import type { Arena } from './arenas';
import { ARENAS } from './arenas';
import { computeStats, type Build } from './mech';
import { fightingStyle } from './style';
import { SYNERGIES } from './synergies';

// The most telling part of a build gives its adjective. Earlier = more distinctive.
const ADJECTIVE: [string, string][] = [
  ['r-bow', 'Armor-Piercing'],
  ['bk-magnet', 'Magnetic'],
  ['p-velocity', 'Runaway'],
  ['p-redshift', 'Redshifted'],
  ['lw-flamer', 'Scorching'],
  ['r-pile', 'Piledriving'],
  ['r-lance', 'Jousting'],
  ['lw-knuckle', 'Bare-Knuckle'],
  ['r-rail', 'Railgun'],
  ['bk-howitzer', 'Shelling'],
  ['bk-orbit', 'Drone-Backed'],
  ['l-skate', 'Hovering'],
  ['l-hopper', 'Leaping'],
  ['l-crab', 'Crawling'],
  ['lw-aegis', 'Shimmering'],
  ['lw-door', 'Shielded'],
  ['lw-saber', 'Bladed'],
  ['r-scatter', 'Shotgun'],
  ['r-buzz', 'Buzzing'],
  ['bk-swarm', 'Missile'],
  ['bk-chaff', 'Jamming'],
  ['bk-dish', 'Far-Seeing'],
  ['lw-lance', 'Pulsing'],
  ['r-beam', 'Laser'],
  ['p-berserk', 'Berserk'],
  ['p-turtle', 'Fortified'],
  ['p-kite', 'Evasive'],
  ['p-sniper', 'Patient'],
  ['p-flank', 'Flanking'],
  ['p-rush', 'Reckless'],
  ['l-tread', 'Treaded'],
];

/** "Armor-Piercing Hit & Run", "Hunter Brawler": a name for what this build is. */
export const buildTitle = (build: Build, arena: Arena = ARENAS[0]!): string => {
  const st = computeStats(build, arena);
  const style = fightingStyle(st).name;
  const syn = st.synergies.find((s) => SYNERGIES[s].tier === 'legendary') ?? st.synergies[0];
  if (syn) return SYNERGIES[syn].tier === 'legendary' ? `${SYNERGIES[syn].name}` : `${SYNERGIES[syn].name} ${style}`;
  const have = new Set(Object.values(build.parts));
  const adj = ADJECTIVE.find(([id]) => have.has(id))?.[1];
  return adj ? `${adj} ${style}` : style;
};
