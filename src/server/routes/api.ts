import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type {
  EnterResponse,
  ErrorResponse,
  InitResponse,
  LeaderboardResponse,
  RaidResponse,
  ChallengeResponse,
  ChallengesResponse,
  ResultsResponse,
} from '../../shared/api';
import { arenaForDay } from '../../shared/game/arenas';
import { isFactionId } from '../../shared/game/factions';
import { validateBuild } from '../../shared/game/mech';
import { attackBoss, raidState } from '../core/raid';
import { challenge, listChallenges, rememberUser } from '../core/challenge';
import {
  dayNumberOf,
  dayPost,
  ensureState,
  enter,
  entryCount,
  factionToday,
  factionTotals,
  getChampions,
  getEntry,
  getProfile,
  getResults,
  getSavedBuild,
  getTax,
  joinFaction,
  lastResultFor,
  leaderboard,
  postDay,
  adoptPost,
  saveBuild,
} from '../core/state';

export const api = new Hono();

const err = (message: string) => ({ status: 'error', message }) satisfies ErrorResponse;

const nextMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
};

api.get('/init', async (c) => {
  try {
    const { day, dayNumber } = await ensureState();
    const { userId, username, postId } = context;
    let pDay = postId ? await postDay(postId) : null;
    // a post the app didn't make itself (e.g. the playtest post) becomes today's post if today has none
    if (postId && !pDay && !(await dayPost(day))) {
      await adoptPost(postId, day);
      pDay = day;
    }
    pDay = pDay ?? day;
    if (userId && username) await rememberUser(userId, username);
    const profile = userId ? await getProfile(userId) : null;
    const res: InitResponse = {
      type: 'init',
      username: username ?? null,
      day,
      dayNumber,
      postDay: pDay,
      postDayNumber: pDay === day ? dayNumber : await dayNumberOf(pDay),
      todayPostId: await dayPost(day),
      arenaId: arenaForDay(day).id,
      nextRolloverIso: nextMidnight(),
      tax: await getTax(day),
      myBuild: userId ? await getSavedBuild(userId) : null,
      myEntry: userId ? await getEntry(day, userId) : null,
      entryCount: await entryCount(day),
      faction: profile?.faction ?? null,
      factionTotals: await factionTotals(),
      factionToday: await factionToday(day),
      profile: {
        entries: profile?.entries ?? 0,
        wins: profile?.wins ?? 0,
        titles: profile?.titles ?? 0,
        streak: profile?.streak ?? 0,
        bestStreak: profile?.bestStreak ?? 0,
        chalWins: profile?.chalWins ?? 0,
        chalLosses: profile?.chalLosses ?? 0,
      },
      champions: await getChampions(),
      last: await lastResultFor(day, userId),
      raid: await raidState(day, userId, username),
    };
    return c.json(res);
  } catch (e) {
    console.error('init failed', e);
    return c.json(err('Could not load the game. Try refreshing.'), 500);
  }
});

api.post('/save', async (c) => {
  const { userId } = context;
  if (!userId) return c.json(err('Log in to save your mech.'), 401);
  const body: unknown = await c.req.json().catch(() => null);
  const build = validateBuild(body && typeof body === 'object' ? Reflect.get(body, 'build') : null);
  if (!build) return c.json(err('That build is not valid.'), 400);
  await saveBuild(userId, build);
  return c.json({ type: 'save', ok: true });
});

api.post('/enter', async (c) => {
  const { userId, username } = context;
  if (!userId || !username) return c.json(err('Log in to enter the tournament.'), 401);
  const body: unknown = await c.req.json().catch(() => null);
  const build = validateBuild(body && typeof body === 'object' ? Reflect.get(body, 'build') : null);
  if (!build) return c.json(err('That build is not valid.'), 400);
  const { day } = await ensureState();
  const r = await enter(day, userId, username, build);
  const res: EnterResponse = {
    type: 'enter',
    entryCount: r.entryCount,
    streak: r.streak,
  };
  return c.json(res);
});

api.post('/raid', async (c) => {
  const { userId, username } = context;
  if (!userId || !username) return c.json(err('Log in to fight the boss.'), 401);
  const body: unknown = await c.req.json().catch(() => null);
  const build = validateBuild(body && typeof body === 'object' ? Reflect.get(body, 'build') : null);
  if (!build) return c.json(err('That build is not valid.'), 400);
  const { day } = await ensureState();
  const profile = await getProfile(userId);
  const r = await attackBoss(day, await getTax(day), userId, username, profile.faction, build);
  if (!r.ok) return c.json(err(r.message), 429);
  const res: RaidResponse = {
    type: 'raid',
    seed: r.seed,
    attempt: r.attempt,
    damage: r.damage,
    hp: r.hp,
    max: r.max,
    lastHit: r.lastHit,
  };
  return c.json(res);
});

api.post('/challenge', async (c) => {
  const { userId, username } = context;
  if (!userId || !username) return c.json(err('Log in to challenge someone.'), 401);
  const body: unknown = await c.req.json().catch(() => null);
  const build = validateBuild(body && typeof body === 'object' ? Reflect.get(body, 'build') : null);
  const target: unknown = body && typeof body === 'object' ? Reflect.get(body, 'username') : null;
  if (!build || typeof target !== 'string') return c.json(err('Bad challenge.'), 400);
  const { day } = await ensureState();
  await rememberUser(userId, username);
  await saveBuild(userId, build);
  const r = await challenge(day, await getTax(day), userId, username, build, target);
  if (!r.ok) return c.json(err(r.message), r.status);
  const res: ChallengeResponse = { type: 'challenge', record: r.record, left: r.left };
  return c.json(res);
});

api.get('/challenges', async (c) => {
  const { day } = await ensureState();
  const res: ChallengesResponse = { type: 'challenges', list: await listChallenges(day) };
  return c.json(res);
});

api.post('/faction', async (c) => {
  const { userId, username } = context;
  if (!userId || !username) return c.json(err('Log in to join a faction.'), 401);
  const body: unknown = await c.req.json().catch(() => null);
  const f: unknown = body && typeof body === 'object' ? Reflect.get(body, 'faction') : null;
  if (!isFactionId(f)) return c.json(err('Unknown faction.'), 400);
  const faction = await joinFaction(userId, username, f);
  return c.json({ type: 'faction', faction });
});

api.get('/results/:day', async (c) => {
  const day = c.req.param('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json(err('Bad day.'), 400);
  const result = await getResults(day);
  if (!result) return c.json(err('No results for that day yet.'), 404);
  const res: ResultsResponse = {
    type: 'results',
    dayNumber: await dayNumberOf(day),
    result,
  };
  return c.json(res);
});

api.get('/leaderboard', async (c) => {
  const res: LeaderboardResponse = {
    type: 'leaderboard',
    pilots: await leaderboard(),
  };
  return c.json(res);
});
