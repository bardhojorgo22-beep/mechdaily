import type { BattleResult } from './battle';

export type Verdict = {
  winner: 0 | 1;
  tag: '' | 'FROM 1 HP' | 'FLAWLESS' | 'COMEBACK' | 'CLUTCH';
  seconds: number;
  ko: boolean;
  biggestHit: number;
};

const hpAt = (r: BattleResult, frame: number, m: 0 | 1) => r.frames[frame * 10 + m * 5 + 2]! / Math.max(1, r.maxHp[m]);

/** How a fight went, in one tag. Shared so the server can describe a replay it re-simulated. */
export const verdict = (r: BattleResult): Verdict => {
  const w = r.winner;
  const l: 0 | 1 = w === 0 ? 1 : 0;
  const frames = r.frames.length / 10;
  const endHp = hpAt(r, frames - 1, w);
  let worst = 0;
  for (let f = 0; f < frames; f++) worst = Math.min(worst, hpAt(r, f, w) - hpAt(r, f, l));
  let tag: Verdict['tag'] = '';
  if (r.lastStands.some((ls) => ls.by === w)) tag = 'FROM 1 HP';
  else if (endHp > 0.9) tag = 'FLAWLESS';
  else if (worst < -0.35) tag = 'COMEBACK';
  else if (endHp < 0.15) tag = 'CLUTCH';
  let biggestHit = 0;
  for (const e of r.events) if (e.by === w && e.hit) biggestHit = Math.max(biggestHit, e.dmg);
  return { winner: w, tag, seconds: Math.round(r.ticks / 10), ko: r.reason === 'ko', biggestHit };
};
