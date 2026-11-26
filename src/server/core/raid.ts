import { redis } from '@devvit/web/server';
import type { RaidState } from '../../shared/api';
import { getArena, arenaForDay } from '../../shared/game/arenas';
import { bossForDay, raidPoolFor, raidSeed, simulateRaid } from '../../shared/game/boss';
import { FACTION_IDS, type FactionId } from '../../shared/game/factions';
import type { Build, Tax } from '../../shared/game/mech';
import { raidAttempts } from './limits';

const R = {
  state: (day: string) => `raid:${day}`, // hash: hp, max, killedBy
  dmg: (day: string) => `raid:dmg:${day}`, // zset username -> damage
  attempts: (day: string) => `raid:att:${day}`, // hash userId -> attempts used
  faction: (day: string) => `raid:fac:${day}`, // hash faction -> damage
};

export const RAID_POINTS = { topFaction: 10, killParticipation: 3 } as const;

/** Make sure today's boss has an HP pool. Players = yesterday's entries (or 0). */
export const ensureRaid = async (day: string, players = 0) => {
  const exists = await redis.hGet(R.state(day), 'max');
  if (exists) return;
  const max = raidPoolFor(players);
  await redis.hSetNX(R.state(day), 'max', String(max));
  await redis.hSetNX(R.state(day), 'hp', String(max));
};

export const raidState = async (
  day: string,
  userId: string | undefined,
  username: string | undefined
): Promise<RaidState> => {
  await ensureRaid(day);
  const h = await redis.hGetAll(R.state(day));
  const top = await redis.zRange(R.dmg(day), 0, 4, { by: 'rank', reverse: true });
  const used = userId ? Number((await redis.hGet(R.attempts(day), userId)) ?? '0') : 0;
  const mine = username ? ((await redis.zScore(R.dmg(day), username)) ?? 0) : 0;
  const fac = await redis.hGetAll(R.faction(day));
  return {
    bossId: bossForDay(day).id,
    hp: Math.max(0, Number(h.hp ?? '0')),
    max: Number(h.max ?? '1'),
    killedBy: h.killedBy ?? null,
    attemptsLeft: Math.max(0, raidAttempts() - used),
    myDamage: Math.round(mine),
    top: top.map((m) => ({ username: m.member, damage: Math.round(m.score) })),
    factions: { foundry: Number(fac.foundry ?? 0), tide: Number(fac.tide ?? 0), static: Number(fac.static ?? 0) },
  };
};

export type RaidAttack =
  | { ok: false; message: string }
  | { ok: true; seed: string; attempt: number; damage: number; hp: number; max: number; lastHit: boolean };

export const attackBoss = async (
  day: string,
  tax: Tax,
  userId: string,
  username: string,
  faction: FactionId | null,
  build: Build
): Promise<RaidAttack> => {
  await ensureRaid(day);
  const used = await redis.hIncrBy(R.attempts(day), userId, 1);
  if (used > raidAttempts()) {
    await redis.hIncrBy(R.attempts(day), userId, -1);
    return { ok: false, message: `No attacks left today. Come back tomorrow.` };
  }
  const seed = raidSeed(day, userId, used);
  const arena = getArena(arenaForDay(day).id);
  const result = simulateRaid(day, arena, tax, build, seed);
  const before = Number((await redis.hGet(R.state(day), 'hp')) ?? '0');
  const max = Number((await redis.hGet(R.state(day), 'max')) ?? '1');
  const damage = Math.max(0, Math.min(result.damage[0], before));
  const hp = before > 0 ? await redis.hIncrBy(R.state(day), 'hp', -damage) : before;
  let lastHit = false;
  if (damage > 0) {
    await redis.zIncrBy(R.dmg(day), username, damage);
    if (faction) await redis.hIncrBy(R.faction(day), faction, damage);
  }
  if (before > 0 && hp <= 0) {
    lastHit = (await redis.hSetNX(R.state(day), 'killedBy', username)) === 1;
  }
  return { ok: true, seed, attempt: used, damage, hp: Math.max(0, hp), max, lastHit };
};

/** At the end of the day: faction points for the raid. Returns a line for the results comment. */
export const settleRaid = async (
  day: string
): Promise<{ points: Partial<Record<FactionId, number>>; line: string }> => {
  const h = await redis.hGetAll(R.state(day));
  const fac = await redis.hGetAll(R.faction(day));
  const boss = bossForDay(day);
  const points: Partial<Record<FactionId, number>> = {};
  const dealt = FACTION_IDS.map((f) => ({ f, d: Number(fac[f] ?? 0) })).sort((a, b) => b.d - a.d);
  if (dealt[0] && dealt[0].d > 0) points[dealt[0].f] = RAID_POINTS.topFaction;
  const killed = Number(h.hp ?? '1') <= 0;
  if (killed) {
    for (const { f, d } of dealt) if (d > 0) points[f] = (points[f] ?? 0) + RAID_POINTS.killParticipation;
  }
  const max = Number(h.max ?? '0');
  const hp = Math.max(0, Number(h.hp ?? '0'));
  const line = killed
    ? `💥 **${boss.title}** went down! Final blow by u/${h.killedBy ?? 'someone'}.`
    : max > 0
      ? `🛡 **${boss.title}** survived with ${Math.round((hp / max) * 100)}% HP. It'll be back.`
      : '';
  return { points, line };
};
