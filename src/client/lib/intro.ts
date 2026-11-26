import { getArena, type Arena } from '../../shared/game/arenas';
import { simulateBattle, SPECIALS, type BattleResult } from '../../shared/game/battle';
import type { Build } from '../../shared/game/mech';
import type { Tip } from '../components/BattleView';

const KEY = 'mechdaily-intro-done';
export const introDone = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const markIntroDone = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage can be unavailable in some webviews */
  }
};

export const TRAINER: Build = {
  name: 'Training Bot',
  parts: {
    head: 'h-lantern',
    core: 'c-shell',
    arms: 'a-wire',
    legs: 'l-strider',
    booster: 'b-puff',
    generator: 'g-battery',
    weaponR: 'r-scatter',
    weaponL: 'lw-saber',
    back: 'bk-swarm',
    chip: 'p-rush',
  },
  paint: { body: 5, trim: 2, decal: 0 },
};

/** A demo fight the new player wins, with captions explaining what they're seeing. */
export const tutorialFight = (
  mine: Build
): { result: BattleResult; builds: [Build, Build]; arena: Arena; tips: Tip[] } => {
  const arena = getArena('yard');
  let result = simulateBattle({ build: mine }, { build: TRAINER }, arena, 'tutorial:0');
  for (let i = 1; i < 40; i++) {
    if (result.winner === 0 && result.ticks > 150 && result.lastStands.some((l) => l.by === 1)) break;
    result = simulateBattle({ build: mine }, { build: TRAINER }, arena, `tutorial:${i}`);
  }
  const want: Tip[] = [
    { t: 0, text: 'Fights are automatic. You build the mech, the pilot does the rest.' },
    { t: 45, text: 'Legs, weight and boosters decide how it moves. Watch it circle and dodge.' },
  ];
  const big = result.events.find((e) => e.hit && e.dmg >= 260);
  if (big) want.push({ t: big.t, text: 'Big hits shove and stagger. Heavy weapons hit hard but slow you down.' });
  const sp = result.specials[0];
  if (sp) want.push({ t: sp.t, text: `${SPECIALS[sp.kind].name}! Pilot chips give one special move per fight.` });
  const ls = result.lastStands[0];
  if (ls) want.push({ t: ls.t + 6, text: 'LAST STAND: a killing blow blows the armor off instead. 1 HP, all in.' });
  want.push({
    t: Math.max(0, result.ticks - 30),
    text: 'Win matches to climb tonight’s bracket. Champions get a title.',
  });
  // keep captions from talking over each other
  const tips: Tip[] = [];
  for (const tip of want.sort((a, b) => a.t - b.t)) {
    const prev = tips[tips.length - 1];
    if (!prev || tip.t - prev.t >= 40) tips.push(tip);
    else if (tip.text.startsWith('LAST STAND')) tips[tips.length - 1] = tip;
  }
  return { result, builds: [{ ...mine, name: mine.name || 'Your mech' }, TRAINER], arena, tips };
};
