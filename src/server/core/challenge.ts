import { context, reddit, redis } from '@devvit/web/server';
import type { ChallengeRecord } from '../../shared/api';
import { arenaForDay, getArena } from '../../shared/game/arenas';
import { simulateBattle } from '../../shared/game/battle';
import { validateBuild, type Build, type Tax } from '../../shared/game/mech';
import { parseJson } from './state';

export const CHALLENGES_PER_DAY = 5;

const C = {
  byName: 'user:byname', // hash lowercased username -> userId
  names: 'user:names', // hash userId -> username (display case)
  count: (day: string) => `chal:count:${day}`,
  list: (day: string) => `chal:list:${day}`,
  build: (userId: string) => `build:${userId}`,
  entries: (day: string) => `entries:${day}`,
  user: (userId: string) => `user:${userId}`,
};

/** Remember who's who, so people can be challenged by username. */
export const rememberUser = async (userId: string, username: string) => {
  await redis.hSet(C.byName, { [username.toLowerCase()]: userId });
  await redis.hSet(C.names, { [userId]: username });
};

const cleanName = (raw: string) =>
  raw
    .trim()
    .replace(/^\/?u\//i, '')
    .replace(/[^A-Za-z0-9_-]/g, '');

const targetBuild = async (day: string, userId: string): Promise<Build | null> => {
  const entry = parseJson(await redis.hGet(C.entries(day), userId));
  const fromEntry = entry && typeof entry === 'object' ? validateBuild(Reflect.get(entry, 'build')) : null;
  return fromEntry ?? validateBuild(parseJson(await redis.get(C.build(userId))));
};

export const listChallenges = async (day: string): Promise<ChallengeRecord[]> => {
  const raw = parseJson(await redis.get(C.list(day)));
  if (!Array.isArray(raw)) return [];
  const out: ChallengeRecord[] = [];
  for (const r of raw) {
    const a = validateBuild(Reflect.get(r, 'aBuild'));
    const b = validateBuild(Reflect.get(r, 'bBuild'));
    if (!a || !b) continue;
    const winner = Reflect.get(r, 'winner');
    out.push({
      seed: String(Reflect.get(r, 'seed')),
      arenaId: String(Reflect.get(r, 'arenaId')),
      aPilot: String(Reflect.get(r, 'aPilot')),
      bPilot: String(Reflect.get(r, 'bPilot')),
      aBuild: a,
      bBuild: b,
      winner: winner === 1 ? 1 : 0,
      at: Number(Reflect.get(r, 'at')),
    });
  }
  return out;
};

export type ChallengeOutcome =
  { ok: false; status: 400 | 404 | 429; message: string } | { ok: true; record: ChallengeRecord; left: number };

export const challenge = async (
  day: string,
  tax: Tax,
  userId: string,
  username: string,
  build: Build,
  rawTarget: string
): Promise<ChallengeOutcome> => {
  const name = cleanName(rawTarget);
  if (!name) return { ok: false, status: 400, message: 'Type a username, like u/someone.' };
  if (name.toLowerCase() === username.toLowerCase())
    return { ok: false, status: 400, message: "You can't challenge yourself." };
  const targetId = await redis.hGet(C.byName, name.toLowerCase());
  if (!targetId) return { ok: false, status: 404, message: `u/${name} hasn't built a mech here yet.` };
  const theirs = await targetBuild(day, targetId);
  if (!theirs) return { ok: false, status: 404, message: `u/${name} hasn't built a mech here yet.` };

  const used = await redis.hIncrBy(C.count(day), userId, 1);
  if (used > CHALLENGES_PER_DAY) {
    await redis.hIncrBy(C.count(day), userId, -1);
    return { ok: false, status: 429, message: `That's ${CHALLENGES_PER_DAY} challenges today. Rest your servos.` };
  }

  const targetName = (await redis.hGet(C.names, targetId)) ?? name;
  const arena = getArena(arenaForDay(day).id);
  const seed = `chal:${day}:${userId}:${used}`;
  const result = simulateBattle({ build, tax }, { build: theirs, tax }, arena, seed);
  const record: ChallengeRecord = {
    seed,
    arenaId: arena.id,
    aPilot: username,
    bPilot: targetName,
    aBuild: build,
    bBuild: theirs,
    winner: result.winner,
    at: Date.now(),
  };
  const list = await listChallenges(day);
  list.unshift(record);
  await redis.set(C.list(day), JSON.stringify(list.slice(0, 30)));
  await redis.hIncrBy(C.user(userId), result.winner === 0 ? 'chalWins' : 'chalLosses', 1);
  await redis.hIncrBy(C.user(targetId), result.winner === 1 ? 'chalWins' : 'chalLosses', 1);

  // Shout it in the comments so the other pilot hears about it.
  const postId = await redis.hGet('day:post', day);
  if (postId && postId.startsWith('t3_')) {
    const winnerName = result.winner === 0 ? username : targetName;
    const how = result.reason === 'ko' ? `KO in ${Math.round(result.ticks / 10)}s` : 'on points';
    const text = [
      `⚔️ u/${username}'s **${build.name}** challenged u/${targetName}'s **${theirs.name}** in ${arena.name}.`,
      ``,
      `**u/${winnerName} wins** (${how}). ${result.winner === 0 ? `Rematch, u/${targetName}?` : `Not today, u/${username}.`} Open the post → Challenges to watch it.`,
    ].join('\n');
    try {
      const id: `t3_${string}` = `t3_${postId.slice(3)}`;
      await reddit.submitComment({ id, text });
    } catch (e) {
      console.error('challenge comment failed', e, context.subredditName);
    }
  }
  return { ok: true, record, left: CHALLENGES_PER_DAY - used };
};
