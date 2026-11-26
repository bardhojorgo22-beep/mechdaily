import { ARENAS } from './arenas';
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

export const botsForDay = (day: string, count: number): Build[] => {
  const rng = createRng(`bots:${day}`);
  return Array.from({ length: count }, () => randomBuild(rng, botName(rng)));
};
