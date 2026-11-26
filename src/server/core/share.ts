import { context, reddit, redis } from '@devvit/web/server';
import type { ShareRequest, SharedFight } from '../../shared/api';
import { ARENAS, getArena } from '../../shared/game/arenas';
import { simulateBattle, type BattleResult } from '../../shared/game/battle';
import { bossForDay, simulateRaid } from '../../shared/game/boss';
import { validateBuild, type Tax } from '../../shared/game/mech';
import { verdict } from '../../shared/game/verdict';
import { buildTitle } from '../../shared/game/title';
import { sharesPerDay } from './limits';
import { dayPost, parseJson } from './state';

const S = {
  reel: 'reel', // JSON array of SharedFight, newest first
  count: (day: string) => `share:count:${day}`,
  seq: 'share:seq',
};
const REEL_SIZE = 20;

export const getReel = async (): Promise<SharedFight[]> => {
  const raw = parseJson(await redis.get(S.reel));
  return Array.isArray(raw) ? (raw as SharedFight[]) : [];
};

/** Labels come from the client; keep them short, plain, and never pinging anyone but the sharer. */
const cleanLabel = (raw: unknown, sharer: string): string => {
  const s =
    typeof raw === 'string'
      ? raw
          .replace(/[^\w /.-]/g, '')
          .slice(0, 32)
          .trim()
      : '';
  if (/^u\//i.test(s) && s.slice(2).toLowerCase() !== sharer.toLowerCase()) return s.slice(2);
  return s || 'mech';
};
const cleanTax = (raw: unknown): Tax | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const tax: Tax = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
    tax[k.slice(0, 20)] = v;
  }
  return tax;
};

/** Parse + verify a share. Returns the request and the re-simulated result, or an error message. */
export const parseShare = (
  body: unknown,
  sharer: string
): { ok: true; req: ShareRequest; result: BattleResult } | { ok: false; message: string } => {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'Bad share.' };
  const g = (k: string): unknown => Reflect.get(body, k);
  const kind = g('kind');
  const a = validateBuild(g('a'));
  const seed = g('seed');
  const arenaId = g('arenaId');
  const tax = cleanTax(g('tax'));
  if ((kind !== 'duel' && kind !== 'raid') || !a || typeof seed !== 'string' || seed.length > 120 || !tax)
    return { ok: false, message: 'Bad share.' };
  if (typeof arenaId !== 'string' || !ARENAS.some((x) => x.id === arenaId)) return { ok: false, message: 'Bad arena.' };
  const arena = getArena(arenaId);
  if (kind === 'raid') {
    const day = g('day');
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, message: 'Bad day.' };
    const boss = bossForDay(day);
    const req: ShareRequest = {
      kind,
      a,
      b: boss.build,
      aLabel: cleanLabel(g('aLabel'), sharer),
      bLabel: 'daily boss',
      arenaId,
      seed,
      tax,
      day,
    };
    return { ok: true, req, result: simulateRaid(day, arena, tax, a, seed) };
  }
  const b = validateBuild(g('b'));
  if (!b) return { ok: false, message: 'Bad share.' };
  const req: ShareRequest = {
    kind,
    a,
    b,
    aLabel: cleanLabel(g('aLabel'), sharer),
    bLabel: cleanLabel(g('bLabel'), sharer),
    arenaId,
    seed,
    tax,
  };
  return { ok: true, req, result: simulateBattle({ build: a, tax }, { build: b, tax }, arena, seed) };
};

const who = (name: string, label: string) => `**${name}**${label ? ` (${label})` : ''}`;

export const headlineFor = (req: ShareRequest, result: BattleResult): string => {
  if (req.kind === 'raid') {
    const dmg = Math.round(result.damage[0]);
    return `${req.a.name} hit ${req.b.name} for ${dmg.toLocaleString('en-US')} damage`;
  }
  const v = verdict(result);
  const w = v.winner === 0 ? req.a : req.b;
  const l = v.winner === 0 ? req.b : req.a;
  return `${w.name} beat ${l.name}${v.tag ? ` ${v.tag}` : ''}`;
};

export const shareFight = async (
  day: string,
  userId: string,
  username: string,
  body: unknown
): Promise<{ ok: true; fight: SharedFight; left: number } | { ok: false; status: 400 | 429; message: string }> => {
  const parsed = parseShare(body, username);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const { req, result } = parsed;

  const used = await redis.hIncrBy(S.count(day), userId, 1);
  if (used > sharesPerDay()) {
    await redis.hIncrBy(S.count(day), userId, -1);
    return { ok: false, status: 429, message: `That's ${sharesPerDay()} shares today.` };
  }

  const arena = getArena(req.arenaId);
  const v = verdict(result);
  const headline = headlineFor(req, result);
  const id = String(await redis.hIncrBy(S.seq, 'n', 1));
  const fight: SharedFight = { ...req, id, by: username, at: Date.now(), headline };

  const reel = await getReel();
  reel.unshift(fight);
  await redis.set(S.reel, JSON.stringify(reel.slice(0, REEL_SIZE)));

  // the comment
  let detail: string;
  if (req.kind === 'raid') {
    detail = `${who(req.a.name, req.aLabel)} took on today's boss **${req.b.name}** in ${arena.name} and dealt **${Math.round(result.damage[0]).toLocaleString('en-US')} damage**.`;
  } else {
    const w = v.winner === 0 ? ([req.a, req.aLabel] as const) : ([req.b, req.bLabel] as const);
    const l = v.winner === 0 ? ([req.b, req.bLabel] as const) : ([req.a, req.aLabel] as const);
    const how = v.ko ? `KO in ${v.seconds}s` : `on time after ${v.seconds}s`;
    const hit = v.biggestHit > 0 ? `, biggest hit ${Math.round(v.biggestHit).toLocaleString('en-US')}` : '';
    detail = `${who(w[0].name, w[1])}, *${buildTitle(w[0], arena)}*, beat ${who(l[0].name, l[1])} in ${arena.name}${v.tag ? ` — **${v.tag}**` : ''} (${how}${hit}).`;
  }
  const text = [
    `🎬 u/${username} shared a fight`,
    ``,
    detail,
    ``,
    `Open Mech Daily → **Fight reel** to watch the replay.`,
  ].join('\n');
  const target = context.postId ?? (await dayPost(day));
  if (target && target.startsWith('t3_')) {
    try {
      const tid: `t3_${string}` = `t3_${target.slice(3)}`;
      await reddit.submitComment({ id: tid, text });
    } catch (e) {
      console.error('share comment failed', e);
    }
  }
  return { ok: true, fight, left: sharesPerDay() - used };
};
