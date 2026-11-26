import { context, reddit, redis } from '@devvit/web/server';
import type { Champion, LastResult, Profile } from '../../shared/api';
import { arenaForDay, dayKey, getArena } from '../../shared/game/arenas';
import { FACTIONS, FACTION_IDS, isFactionId, type FactionId } from '../../shared/game/factions';
import { validateBuild, type Build, type Tax } from '../../shared/game/mech';
import { computeTax, runTournament, winsFor, type Entrant, type TournamentResult } from '../../shared/game/tournament';

// ── keys ────────────────────────────────────────────────
const K = {
  day: 'game:day',
  dayNumber: 'game:dayNumber',
  locks: 'game:locks',
  postDay: 'post:day', // hash postId -> day
  dayPost: 'day:post', // hash day -> postId
  dayNumberOf: 'day:number', // hash day -> number
  tax: (day: string) => `tax:${day}`,
  entries: (day: string) => `entries:${day}`,
  results: (day: string) => `results:${day}`,
  factionDay: (day: string) => `faction:day:${day}`,
  factionTotal: 'faction:total',
  build: (userId: string) => `build:${userId}`,
  user: (userId: string) => `user:${userId}`,
  leaderboard: 'leaderboard:wins',
  champions: 'champions',
};

export const parseJson = (raw: string | undefined | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return dayKey(d);
};

// ── day state ───────────────────────────────────────────
export const ensureState = async (): Promise<{
  day: string;
  dayNumber: number;
}> => {
  let day = await redis.get(K.day);
  let num = Number((await redis.get(K.dayNumber)) ?? '0');
  if (!day || !num) {
    day = dayKey(new Date());
    num = 1;
    await redis.set(K.day, day);
    await redis.set(K.dayNumber, String(num));
    await redis.hSet(K.dayNumberOf, { [day]: String(num) });
  }
  return { day, dayNumber: num };
};

export const dayNumberOf = async (day: string): Promise<number> =>
  Number((await redis.hGet(K.dayNumberOf, day)) ?? '0');

export const getTax = async (day: string): Promise<Tax> => {
  const raw = parseJson(await redis.get(K.tax(day)));
  if (typeof raw !== 'object' || raw === null) return {};
  const tax: Tax = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') tax[k] = v;
  return tax;
};

export const postDay = async (postId: string): Promise<string | null> => (await redis.hGet(K.postDay, postId)) ?? null;
export const dayPost = async (day: string): Promise<string | null> => (await redis.hGet(K.dayPost, day)) ?? null;

export const createDailyPost = async (day: string, dayNumber: number) => {
  const arena = arenaForDay(day);
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: `Day ${dayNumber} · ${arena.name} — build a mech, the bracket runs at midnight UTC`,
    postData: { day, dayNumber },
  });
  await redis.hSet(K.postDay, { [post.id]: day });
  await redis.hSet(K.dayPost, { [day]: post.id });
  return post;
};

// ── users ───────────────────────────────────────────────
export const getProfile = async (
  userId: string
): Promise<Profile & { faction: FactionId | null; lastEntryDay: string | null }> => {
  const h = await redis.hGetAll(K.user(userId));
  const n = (k: string) => Number(h[k] ?? '0');
  const f = h.faction;
  return {
    entries: n('entries'),
    wins: n('wins'),
    titles: n('titles'),
    streak: n('streak'),
    bestStreak: n('bestStreak'),
    faction: isFactionId(f) ? f : null,
    lastEntryDay: h.lastEntryDay ?? null,
  };
};

export const getSavedBuild = async (userId: string): Promise<Build | null> =>
  validateBuild(parseJson(await redis.get(K.build(userId))));

export const saveBuild = async (userId: string, build: Build) => {
  await redis.set(K.build(userId), JSON.stringify(build));
};

const flair = async (username: string, text: string, faction: FactionId | null) => {
  try {
    const f = faction ? FACTIONS[faction] : null;
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username,
      text,
      ...(f ? { backgroundColor: f.color, textColor: f.ink } : {}),
    });
  } catch (err) {
    console.error('flair failed', err);
  }
};

const flairText = (faction: FactionId | null, titles: number) => {
  const name = faction ? FACTIONS[faction].name : 'Pilot';
  return titles > 0 ? `${name} · 🏆×${titles}` : name;
};

export const joinFaction = async (userId: string, username: string, faction: FactionId) => {
  const profile = await getProfile(userId);
  if (profile.faction) return profile.faction; // one-time choice
  await redis.hSet(K.user(userId), { faction, username });
  await flair(username, flairText(faction, profile.titles), faction);
  return faction;
};

// ── entries ─────────────────────────────────────────────
export const getEntry = async (day: string, userId: string): Promise<Build | null> => {
  const raw = parseJson(await redis.hGet(K.entries(day), userId));
  if (typeof raw !== 'object' || raw === null) return null;
  return validateBuild(Reflect.get(raw, 'build'));
};

export const entryCount = async (day: string) => redis.hLen(K.entries(day));

export const enter = async (day: string, userId: string, username: string, build: Build) => {
  const profile = await getProfile(userId);
  const already = await redis.hGet(K.entries(day), userId);
  await redis.hSet(K.entries(day), {
    [userId]: JSON.stringify({
      build,
      pilot: username,
      faction: profile.faction,
    }),
  });
  await saveBuild(userId, build);
  let streak = profile.streak;
  if (!already) {
    const yesterday = (() => {
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return dayKey(d);
    })();
    streak = profile.lastEntryDay === yesterday ? profile.streak + 1 : 1;
    await redis.hSet(K.user(userId), {
      username,
      lastEntryDay: day,
      streak: String(streak),
      bestStreak: String(Math.max(streak, profile.bestStreak)),
    });
    await redis.hIncrBy(K.user(userId), 'entries', 1);
    if (profile.faction) await redis.hIncrBy(K.factionDay(day), profile.faction, 1);
  }
  return { entryCount: await entryCount(day), streak };
};

// ── factions ────────────────────────────────────────────
const factionHash = async (key: string): Promise<Record<FactionId, number>> => {
  const h = await redis.hGetAll(key);
  return {
    foundry: Number(h.foundry ?? 0),
    tide: Number(h.tide ?? 0),
    static: Number(h.static ?? 0),
  };
};
export const factionTotals = () => factionHash(K.factionTotal);
export const factionToday = (day: string) => factionHash(K.factionDay(day));

// ── champions + results ─────────────────────────────────
export const getChampions = async (): Promise<Champion[]> => {
  const raw = parseJson(await redis.get(K.champions));
  if (!Array.isArray(raw)) return [];
  const out: Champion[] = [];
  for (const c of raw) {
    const build = validateBuild(Reflect.get(c, 'build'));
    if (!build) continue;
    out.push({
      day: String(Reflect.get(c, 'day')),
      dayNumber: Number(Reflect.get(c, 'dayNumber')),
      name: String(Reflect.get(c, 'name')),
      pilot: String(Reflect.get(c, 'pilot')),
      build,
    });
  }
  return out;
};

export const getResults = async (day: string): Promise<TournamentResult | null> => {
  const raw = parseJson(await redis.get(K.results(day)));
  if (typeof raw !== 'object' || raw === null) return null;
  // Written by us in runRollover; validate builds defensively.
  const entrants: unknown = Reflect.get(raw, 'entrants');
  if (!Array.isArray(entrants)) return null;
  for (const e of entrants) if (!validateBuild(Reflect.get(e, 'build'))) return null;
  const result: TournamentResult = JSON.parse(JSON.stringify(raw));
  return result;
};

export const lastResultFor = async (day: string, userId: string | undefined): Promise<LastResult | null> => {
  const prev = (() => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return dayKey(d);
  })();
  const t = await getResults(prev);
  if (!t) return null;
  const champ = t.entrants[t.champion]!;
  const idx = userId ? t.entrants.findIndex((e) => e.id === userId) : -1;
  return {
    day: prev,
    dayNumber: await dayNumberOf(prev),
    postId: await dayPost(prev),
    championName: champ.build.name,
    championPilot: champ.pilot,
    mine:
      idx >= 0
        ? {
            wins: winsFor(t, idx),
            rounds: t.rounds.length,
            champion: idx === t.champion,
          }
        : null,
  };
};

export const leaderboard = async () => {
  const top = await redis.zRange(K.leaderboard, 0, 9, {
    by: 'rank',
    reverse: true,
  });
  return top.map((m) => ({ username: m.member, wins: m.score }));
};

// ── the daily rollover ──────────────────────────────────
export const runRollover = async (): Promise<string> => {
  const { day, dayNumber } = await ensureState();
  const got = await redis.hSetNX(K.locks, `rollover:${day}`, new Date().toISOString());
  if (!got) return `rollover for ${day} already done`;

  const arena = getArena(arenaForDay(day).id);
  const tax = await getTax(day);
  const raw = await redis.hGetAll(K.entries(day));
  const humans: Entrant[] = [];
  for (const [userId, json] of Object.entries(raw)) {
    const e = parseJson(json);
    if (typeof e !== 'object' || e === null) continue;
    const build = validateBuild(Reflect.get(e, 'build'));
    if (!build) continue;
    const faction: unknown = Reflect.get(e, 'faction');
    const pilot: unknown = Reflect.get(e, 'pilot');
    humans.push({
      id: userId,
      pilot: typeof pilot === 'string' ? pilot : 'unknown',
      faction: isFactionId(faction) ? faction : null,
      build,
      bot: false,
    });
  }

  const t = runTournament(day, arena, tax, humans);
  await redis.set(K.results(day), JSON.stringify(t));

  // faction + player stats
  for (const f of FACTION_IDS) {
    const pts = t.factionPoints[f];
    if (pts) await redis.hIncrBy(K.factionTotal, f, pts);
  }
  for (let i = 0; i < t.entrants.length; i++) {
    const e = t.entrants[i]!;
    if (e.bot) continue;
    const wins = winsFor(t, i);
    if (wins > 0) {
      await redis.hIncrBy(K.user(e.id), 'wins', wins);
      await redis.zIncrBy(K.leaderboard, e.pilot, wins);
    }
  }

  // champion
  const champ = t.entrants[t.champion]!;
  const champions = await getChampions();
  champions.unshift({
    day,
    dayNumber,
    name: champ.build.name,
    pilot: champ.pilot,
    build: champ.build,
  });
  await redis.set(K.champions, JSON.stringify(champions.slice(0, 10)));
  if (!champ.bot) {
    const titles = await redis.hIncrBy(K.user(champ.id), 'titles', 1);
    await flair(champ.pilot, flairText(champ.faction, titles), champ.faction);
  }

  // tomorrow
  const tomorrow = nextDay(day);
  const tomorrowNumber = dayNumber + 1;
  await redis.set(K.tax(tomorrow), JSON.stringify(computeTax(humans.map((h) => h.build))));
  await redis.set(K.day, tomorrow);
  await redis.set(K.dayNumber, String(tomorrowNumber));
  await redis.hSet(K.dayNumberOf, { [tomorrow]: String(tomorrowNumber) });

  let newPostId: string | null = null;
  try {
    newPostId = (await createDailyPost(tomorrow, tomorrowNumber)).id;
  } catch (err) {
    console.error('could not create daily post', err);
  }

  // results comment on today's post
  const oldPost = await dayPost(day);
  if (oldPost && oldPost.startsWith('t3_')) {
    const final = t.rounds[t.rounds.length - 1]![0]!;
    const loser = t.entrants[final.w === final.a ? final.b : final.a]!;
    const who = (e: Entrant) => (e.bot ? `**${e.build.name}** (bot)` : `**${e.build.name}** — u/${e.pilot}`);
    const pts = FACTION_IDS.map((f) => `${FACTIONS[f].name} +${t.factionPoints[f] ?? 0}`).join(' · ');
    const text = [
      `## Day ${dayNumber} results — ${arena.name}`,
      ``,
      `🏆 Champion: ${who(champ)}${champ.faction ? ` (${FACTIONS[champ.faction].name})` : ''}`,
      ``,
      `Final: ${champ.build.name} beat ${loser.build.name}.`,
      ``,
      `${humans.length} pilot${humans.length === 1 ? '' : 's'} entered. Faction points: ${pts}`,
      ``,
      `Tomorrow's arena: **${arenaForDay(tomorrow).name}**. Open the post to watch the bracket.`,
    ].join('\n');
    try {
      const id: `t3_${string}` = `t3_${oldPost.slice(3)}`;
      const comment = await reddit.submitComment({ id, text });
      await comment.distinguish(true);
    } catch (err) {
      console.error('could not comment results', err);
    }
  }

  return `Day ${dayNumber} done: ${humans.length} pilots, champion ${champ.build.name}. New post ${newPostId ?? 'failed'}.`;
};
