import { ARENAS, type Arena } from './arenas';
import { simulateBattle } from './battle';
import { computeStats, type Build } from './mech';
import { partsForSlot, type Slot } from './parts';
import { createRng, type Rng } from './rng';

const FIRST = [
  'Rusty',
  'Old',
  'Lucky',
  'Grim',
  'Tiny',
  'Big',
  'Loud',
  'Sir',
  'Mad',
  'Quiet',
  'Spare',
  'Dented',
  'Iron',
  'Hot',
  'Cold',
  'Last',
];
const SECOND = [
  'Bucket',
  'Kettle',
  'Toaster',
  'Crowbar',
  'Anvil',
  'Forklift',
  'Gremlin',
  'Wrench',
  'Boiler',
  'Stapler',
  'Hinge',
  'Piston',
  'Sprocket',
  'Lugnut',
  'Radiator',
  'Bolt',
];

/** A random build that isn't overweight and doesn't run out of power. */
export const randomBuild = (rng: Rng, name: string): Build => {
  for (let tries = 0; tries < 200; tries++) {
    const p = (slot: Slot) => rng.pick(partsForSlot(slot)).id;
    const parts: Build['parts'] = {
      head: p('head'),
      core: p('core'),
      arms: p('arms'),
      legs: p('legs'),
      booster: p('booster'),
      generator: p('generator'),
      weaponR: p('weaponR'),
      weaponL: p('weaponL'),
      back: p('back'),
      chip: p('chip'),
    };
    const build: Build = {
      name,
      parts,
      paint: { body: rng.int(8), trim: rng.int(8), decal: rng.int(8) },
    };
    const st = computeStats(build, ARENAS[0]!);
    if (st.overweight <= 0.05 && st.energyRegen > 0) return build;
  }
  throw new Error('could not roll a sane build');
};

export const botName = (rng: Rng) => `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;

// Archetypes real players build. Each slot lists sensible options; bots roll within them.
type Template = { name: string; slots: Partial<Record<Slot, string[]>> };
const TEMPLATES: Template[] = [
  {
    name: 'sniper',
    slots: {
      head: ['h-needle', 'h-owl', 'h-crown'],
      core: ['c-shell', 'c-ox', 'c-radiator'],
      arms: ['a-gimbal', 'a-wire'],
      legs: ['l-strider', 'l-hopper'],
      booster: ['b-drift', 'b-jet'],
      generator: ['g-coil', 'g-ember', 'g-battery'],
      weaponR: ['r-rail', 'r-bow'],
      weaponL: ['lw-door', 'lw-aegis', 'lw-pistol'],
      back: ['bk-dish', 'bk-howitzer', 'bk-chaff'],
      chip: ['p-sniper', 'p-kite', 'p-turtle'],
    },
  },
  {
    name: 'brawler',
    slots: {
      head: ['h-bucket', 'h-crown', 'h-lantern'],
      core: ['c-vault', 'c-ox'],
      arms: ['a-ram', 'a-brace'],
      legs: ['l-tread', 'l-strider', 'l-crab'],
      booster: ['b-rocket', 'b-jet'],
      generator: ['g-furnace', 'g-coil'],
      weaponR: ['r-pile', 'r-lance'],
      weaponL: ['lw-door', 'lw-knuckle', 'lw-saber'],
      back: ['bk-plate', 'bk-magnet', 'bk-fins'],
      chip: ['p-rush', 'p-berserk', 'p-velocity', 'p-turtle'],
    },
  },
  {
    name: 'skirmisher',
    slots: {
      head: ['h-lantern', 'h-needle', 'h-owl'],
      core: ['c-shell', 'c-prism'],
      arms: ['a-wire', 'a-gimbal'],
      legs: ['l-skate', 'l-hopper'],
      booster: ['b-drift', 'b-jet', 'b-puff'],
      generator: ['g-ember', 'g-coil', 'g-battery'],
      weaponR: ['r-scatter', 'r-buzz', 'r-rifle'],
      weaponL: ['lw-saber', 'lw-pistol', 'lw-flamer'],
      back: ['bk-orbit', 'bk-swarm', 'bk-chaff'],
      chip: ['p-flank', 'p-velocity', 'p-kite', 'p-redshift'],
    },
  },
  {
    name: 'tank',
    slots: {
      head: ['h-bucket', 'h-crown'],
      core: ['c-vault', 'c-ox', 'c-radiator'],
      arms: ['a-brace', 'a-ram', 'a-gimbal'],
      legs: ['l-tread', 'l-crab'],
      booster: ['b-puff', 'b-rocket'],
      generator: ['g-furnace', 'g-coil'],
      weaponR: ['r-rifle', 'r-beam', 'r-buzz', 'r-bow'],
      weaponL: ['lw-aegis', 'lw-door', 'lw-lance'],
      back: ['bk-howitzer', 'bk-plate', 'bk-swarm'],
      chip: ['p-turtle', 'p-berserk', 'p-sniper'],
    },
  },
  {
    name: 'energy',
    slots: {
      head: ['h-owl', 'h-needle', 'h-crown'],
      core: ['c-prism', 'c-radiator'],
      arms: ['a-gimbal', 'a-wire'],
      legs: ['l-strider', 'l-hopper', 'l-skate'],
      booster: ['b-drift', 'b-jet'],
      generator: ['g-coil', 'g-battery'],
      weaponR: ['r-beam', 'r-rail'],
      weaponL: ['lw-lance', 'lw-aegis'],
      back: ['bk-orbit', 'bk-dish', 'bk-fins'],
      chip: ['p-kite', 'p-redshift', 'p-sniper', 'p-flank'],
    },
  },
  {
    name: 'inferno',
    slots: {
      head: ['h-bucket', 'h-lantern'],
      core: ['c-radiator', 'c-vault', 'c-ox'],
      arms: ['a-ram', 'a-brace'],
      legs: ['l-tread', 'l-strider'],
      booster: ['b-rocket', 'b-jet'],
      generator: ['g-furnace'],
      weaponR: ['r-lance', 'r-scatter', 'r-pile'],
      weaponL: ['lw-flamer'],
      back: ['bk-fins', 'bk-plate'],
      chip: ['p-berserk', 'p-rush'],
    },
  },
];

/** A build in the style of a real player: picks an archetype and rolls sensible parts for it. */
export const smartBuild = (rng: Rng, name: string): Build => {
  for (let tries = 0; tries < 200; tries++) {
    const tpl = rng.pick(TEMPLATES);
    const p = (slot: Slot) => {
      const opts = tpl.slots[slot];
      // now and then a bot goes off-script, like people do
      return opts && !rng.chance(0.12) ? rng.pick(opts) : rng.pick(partsForSlot(slot)).id;
    };
    const parts: Build['parts'] = {
      head: p('head'),
      core: p('core'),
      arms: p('arms'),
      legs: p('legs'),
      booster: p('booster'),
      generator: p('generator'),
      weaponR: p('weaponR'),
      weaponL: p('weaponL'),
      back: p('back'),
      chip: p('chip'),
    };
    const build: Build = { name, parts, paint: { body: rng.int(8), trim: rng.int(8), decal: rng.int(8) } };
    const st = computeStats(build, ARENAS[0]!);
    if (st.overweight <= 0.02 && st.energyRegen > 2) return build;
  }
  return randomBuild(rng, name);
};

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Today's sparring partners: one of each difficulty. Hard bots are the best of several smart builds for today's arena. */
export const sparringForDay = (day: string, arena: Arena): { build: Build; level: Difficulty }[] => {
  const rng = createRng(`spar:${day}`);
  const easy = randomBuild(rng, botName(rng));
  const medium = smartBuild(rng, botName(rng));
  // hard: try a few smart builds against each other in today's arena, keep the winner
  const cands = Array.from({ length: 7 }, () => smartBuild(rng, botName(rng)));
  const wins = cands.map(() => 0);
  for (let i = 0; i < cands.length; i++)
    for (let j = i + 1; j < cands.length; j++)
      for (let s = 0; s < 2; s++) {
        const r = simulateBattle({ build: cands[i]! }, { build: cands[j]! }, arena, `spar:${day}:${i}:${j}:${s}`);
        wins[r.winner === 0 ? i : j]!++;
      }
  const hard = cands[wins.indexOf(Math.max(...wins))]!;
  return [
    { build: easy, level: 'easy' },
    { build: medium, level: 'medium' },
    { build: hard, level: 'hard' },
  ];
};

/** Bracket filler: mostly smart builds, some wild cards. */
export const botsForDay = (day: string, count: number): Build[] => {
  const rng = createRng(`bots:${day}`);
  return Array.from({ length: count }, () =>
    rng.chance(0.7) ? smartBuild(rng, botName(rng)) : randomBuild(rng, botName(rng))
  );
};
