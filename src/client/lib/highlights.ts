// Finds the moments worth shouting about in a replay.
import { OVERTIME_TICK, SPECIALS, type BattleResult } from '../../shared/game/battle';
import { SYNERGIES } from '../../shared/game/synergies';

export type Highlight = {
  t: number; // tick
  by: 0 | 1; // who did the cool thing
  text: string;
  sub?: string;
  tier: 1 | 2 | 3; // 1 = callout, 2 = callout + zoom + slow-mo, 3 = finale
  focus: 0 | 1; // which mech the camera looks at
};

export type FightStats = {
  biggestHit: number;
  dodges: number;
  accuracy: number; // 0..1
  bestCombo: number;
  blocked: number;
};

const hpAt = (r: BattleResult, frame: number, m: 0 | 1) => r.frames[frame * 10 + m * 5 + 2]! / Math.max(1, r.maxHp[m]);

export const findHighlights = (r: BattleResult): Highlight[] => {
  const out: Highlight[] = [];
  const lastAt = [-99, -99];
  const push = (h: Highlight, gap = 12) => {
    // don't spam the same mech with callouts back to back (finale always shows)
    if (h.tier < 3 && h.t - lastAt[h.by]! < gap) return;
    lastAt[h.by] = h.t;
    out.push(h);
  };

  let firstBlood = false;
  const combo = [0, 0];
  const comboShown = [0, 0];
  for (const ev of r.events) {
    const other: 0 | 1 = ev.by === 0 ? 1 : 0;
    // only dodging something scary counts: missiles, back cannons, charged shots
    if (ev.dodged && (ev.type === 'explosive' || ev.slot === 'back' || ev.crit)) {
      push({ t: ev.t, by: other, text: 'PERFECT DODGE!', tier: ev.crit ? 2 : 1, focus: other }, 40);
    }
    if (ev.hit) {
      combo[ev.by] = combo[ev.by]! + 1;
      combo[other] = 0;
      comboShown[other] = 0;
      if (!firstBlood && ev.dmg > 0) {
        firstBlood = true;
        push({ t: ev.t, by: ev.by, text: 'FIRST BLOOD', tier: 1, focus: other });
      }
      if (ev.crit) push({ t: ev.t, by: ev.by, text: 'CRITICAL!', sub: `${ev.dmg} damage`, tier: 2, focus: other }, 4);
      else if (ev.dmg >= 420)
        push({ t: ev.t, by: ev.by, text: 'MASSIVE HIT!', sub: `${ev.dmg} damage`, tier: 2, focus: other }, 6);
      else if (ev.dmg >= 260) push({ t: ev.t, by: ev.by, text: 'BIG HIT!', sub: `${ev.dmg}`, tier: 1, focus: other });
      if (ev.stagger) push({ t: ev.t, by: ev.by, text: 'STAGGERED!', tier: 1, focus: other }, 70);
      if (ev.blocked && ev.dmg > 0 && ev.dmg < 80 && ev.type !== 'kinetic') {
        push({ t: ev.t, by: other, text: 'SHIELD WALL!', tier: 1, focus: other }, 60);
      }
      const c = combo[ev.by]!;
      const milestone = c >= 12 ? 12 : c >= 8 ? 8 : c >= 5 ? 5 : 0;
      if (milestone > comboShown[ev.by]!) {
        comboShown[ev.by] = milestone;
        push({ t: ev.t, by: ev.by, text: `COMBO x${milestone}!`, tier: milestone >= 8 ? 2 : 1, focus: other }, 6);
      }
    } else if (!ev.dodged) {
      combo[ev.by] = 0;
      comboShown[ev.by] = 0;
    }
  }

  // hidden synergies firing: first time each one triggers, then now and then
  const synShown: Record<string, number> = {};
  for (const ev of r.events) {
    if (!ev.syn) continue;
    const key = `${ev.by}:${ev.syn}`;
    if (ev.t - (synShown[key] ?? -999) < 90) continue;
    synShown[key] = ev.t;
    const defensive = ev.syn === 'guardian' || ev.syn === 'riotcontrol' || (ev.syn === 'titan' && ev.bashed);
    const by: 0 | 1 = defensive ? (ev.by === 0 ? 1 : 0) : ev.by;
    const legend = SYNERGIES[ev.syn].tier === 'legendary';
    push(
      {
        t: ev.t,
        by,
        text: `${legend ? '🌟' : '⚡'} ${SYNERGIES[ev.syn].name.toUpperCase()}!`,
        tier: legend ? 2 : 1,
        focus: by,
      },
      0
    );
  }
  for (const me of r.misc) {
    if (!me.syn) continue;
    const key = `${me.by}:${me.syn}`;
    if (me.t - (synShown[key] ?? -999) < 90) continue;
    synShown[key] = me.t;
    push({ t: me.t, by: me.by, text: `⚡ ${SYNERGIES[me.syn].name.toUpperCase()}!`, tier: 1, focus: me.by }, 0);
  }

  for (const sp of r.specials) {
    // a last stand owns the screen; don't talk over it
    if (r.lastStands.some((ls) => sp.t >= ls.t && sp.t - ls.t < 12)) continue;
    push({ t: sp.t, by: sp.by, text: `${SPECIALS[sp.kind].name.toUpperCase()}!`, tier: 1, focus: sp.by }, 4);
  }

  for (const ls of r.lastStands) {
    push({ t: ls.t, by: ls.by, text: 'LAST STAND!', sub: 'armor purged · 1 HP', tier: 2, focus: ls.by }, 0);
  }

  if (r.ticks > OVERTIME_TICK + 10)
    push({ t: OVERTIME_TICK, by: 0, text: 'SUDDEN DEATH!', sub: 'damage keeps rising', tier: 2, focus: 0 }, 0);

  // finale
  const w = r.winner;
  const l: 0 | 1 = w === 0 ? 1 : 0;
  const frames = r.frames.length / 10;
  const endHp = hpAt(r, frames - 1, w);
  let worst = 0;
  for (let f = 0; f < frames; f++) worst = Math.min(worst, hpAt(r, f, w) - hpAt(r, f, l));
  let sub = '';
  if (r.lastStands.some((ls) => ls.by === w)) sub = 'FROM 1 HP!';
  else if (endHp > 0.9) sub = 'FLAWLESS!';
  else if (endHp < 0.15) sub = 'CLUTCH!';
  else if (worst < -0.35) sub = 'COMEBACK!';
  out.push({
    t: r.ticks,
    by: w,
    text: r.reason === 'ko' ? 'KNOCKOUT!' : 'TIME!',
    ...(sub ? { sub } : {}),
    tier: 3,
    focus: r.reason === 'ko' ? l : w,
  });
  return out.sort((a, b) => a.t - b.t);
};

export const fightStats = (r: BattleResult, side: 0 | 1): FightStats => {
  let hits = 0;
  let shots = 0;
  let biggestHit = 0;
  let dodges = 0;
  let blocked = 0;
  let run = 0;
  let bestCombo = 0;
  for (const ev of r.events) {
    if (ev.by === side) {
      shots++;
      if (ev.hit) {
        hits++;
        run++;
        bestCombo = Math.max(bestCombo, run);
        biggestHit = Math.max(biggestHit, ev.dmg);
      } else if (!ev.dodged) run = 0;
    } else {
      if (ev.dodged) dodges++;
      if (ev.blocked) blocked++;
      if (ev.hit) run = 0;
    }
  }
  return { biggestHit, dodges, accuracy: shots ? hits / shots : 0, bestCombo, blocked };
};
