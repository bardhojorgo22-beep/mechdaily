// Every part in the game. Numbers here are the main balance knobs.
// Units: hp points, weight in tons, energy per second, heat per shot,
// distances in metres, cooldowns in ticks (10 ticks = 1 second).

export const SLOTS = [
  'head',
  'core',
  'arms',
  'legs',
  'booster',
  'generator',
  'weaponR',
  'weaponL',
  'back',
  'chip',
] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head',
  core: 'Core',
  arms: 'Arms',
  legs: 'Legs',
  booster: 'Booster',
  generator: 'Generator',
  weaponR: 'Right hand',
  weaponL: 'Left hand',
  back: 'Back',
  chip: 'Pilot chip',
};

export const SLOT_SHORT: Record<Slot, string> = {
  head: 'Head',
  core: 'Core',
  arms: 'Arms',
  legs: 'Legs',
  booster: 'Boost',
  generator: 'Power',
  weaponR: 'R.Hand',
  weaponL: 'L.Hand',
  back: 'Back',
  chip: 'Chip',
};

export type DamageType = 'kinetic' | 'energy' | 'explosive' | 'melee';
export type LegType = 'biped' | 'reverse' | 'quad' | 'tank' | 'hover';
export type Behavior = 'rush' | 'kite' | 'turtle' | 'sniper' | 'berserk' | 'flank' | 'redshift' | 'velocity';

export type Weapon = {
  type: DamageType;
  damage: number;
  minRange: number;
  maxRange: number;
  cooldown: number;
  heat: number;
  energyCost: number;
  accuracy: number; // base hit chance before modifiers
  ammo: number | null; // null = unlimited (energy weapons)
  homing?: boolean;
  heavy?: boolean; // non-tank legs must plant to fire
  charge?: boolean; // melee: hits harder the faster you're closing in
  pierce?: boolean; // ignores armor
};

type PartBase = {
  id: string;
  name: string;
  blurb: string;
  weight: number;
  drain: number; // passive energy use per second
};

export type HeadPart = PartBase & {
  slot: 'head';
  hp: number;
  accuracy: number;
  sensor: number;
};
export type CorePart = PartBase & {
  slot: 'core';
  hp: number;
  armorK: number;
  armorE: number;
  cooling: number;
  load: number;
};
export type ArmsPart = PartBase & {
  slot: 'arms';
  hp: number;
  accuracy: number;
  armorK: number;
};
export type LegsPart = PartBase & {
  slot: 'legs';
  legType: LegType;
  hp: number;
  armorK: number;
  armorE: number;
  load: number;
  mobility: number;
  evasion: number;
};
export type BoosterPart = PartBase & {
  slot: 'booster';
  thrust: number;
  boostDrain: number;
  /** quick boost: sideways dash burst */
  qbPower: number;
  qbCooldown: number; // ticks
  qbCost: number; // energy
};
export type GeneratorPart = PartBase & {
  slot: 'generator';
  output: number;
  capacity: number;
  cooling: number;
};
export type WeaponPart = PartBase & {
  slot: 'weaponR' | 'weaponL' | 'back';
  weapon: Weapon;
};
export type ShieldPart = PartBase & {
  slot: 'weaponL';
  shield: { block: number; energyPerHit: number };
};
export type UtilityPart = PartBase & {
  slot: 'back';
  utility: {
    hp?: number;
    armorK?: number;
    armorE?: number;
    sensor?: number;
    accuracy?: number;
    cooling?: number;
    jam?: number;
    range?: number;
    pull?: number; // magnet: drags the enemy toward you, metres per second
  };
};
export type ChipPart = PartBase & { slot: 'chip'; behavior: Behavior };

export type Part =
  | HeadPart
  | CorePart
  | ArmsPart
  | LegsPart
  | BoosterPart
  | GeneratorPart
  | WeaponPart
  | ShieldPart
  | UtilityPart
  | ChipPart;

const w = (weapon: Weapon) => weapon;

export const PARTS: Part[] = [
  // ── Heads ────────────────────────────────────────────
  {
    id: 'h-lantern',
    slot: 'head',
    name: 'Lantern',
    blurb: 'Cheap, light, sees fine.',
    weight: 2,
    drain: 1,
    hp: 112,
    accuracy: 1.0,
    sensor: 850,
  },
  {
    id: 'h-owl',
    slot: 'head',
    name: 'Owl Eye',
    blurb: 'Long sensors. Laughs at fog.',
    weight: 3,
    drain: 4,
    hp: 90,
    accuracy: 1.02,
    sensor: 1870,
  },
  {
    id: 'h-bucket',
    slot: 'head',
    name: 'Bucket',
    blurb: 'Thick skull, blurry view.',
    weight: 5,
    drain: 1,
    hp: 285,
    accuracy: 0.93,
    sensor: 680,
  },
  {
    id: 'h-needle',
    slot: 'head',
    name: 'Needle',
    blurb: 'Targeting computer stuffed in a tin.',
    weight: 3,
    drain: 6,
    hp: 82,
    accuracy: 1.12,
    sensor: 1105,
  },
  {
    id: 'h-crown',
    slot: 'head',
    name: 'Crown',
    blurb: 'Balanced all-rounder.',
    weight: 4,
    drain: 3,
    hp: 180,
    accuracy: 1.05,
    sensor: 1275,
  },

  // ── Cores ────────────────────────────────────────────
  {
    id: 'c-shell',
    slot: 'core',
    name: 'Shell',
    blurb: 'Light frame, runs cool.',
    weight: 12,
    drain: 4,
    hp: 1170,
    armorK: 0.15,
    armorE: 0.15,
    cooling: 22,
    load: 20,
  },
  {
    id: 'c-vault',
    slot: 'core',
    name: 'Vault',
    blurb: 'A bank safe with opinions.',
    weight: 30,
    drain: 6,
    hp: 1640,
    armorK: 0.35,
    armorE: 0.16,
    cooling: 13,
    load: 15,
  },
  {
    id: 'c-prism',
    slot: 'core',
    name: 'Prism',
    blurb: 'Coated to scatter lasers.',
    weight: 20,
    drain: 7,
    hp: 1320,
    armorK: 0.12,
    armorE: 0.38,
    cooling: 14,
    load: 18,
  },
  {
    id: 'c-radiator',
    slot: 'core',
    name: 'Radiator',
    blurb: 'All fins, no fear of heat.',
    weight: 18,
    drain: 5,
    hp: 1125,
    armorK: 0.2,
    armorE: 0.2,
    cooling: 38,
    load: 16,
  },
  {
    id: 'c-ox',
    slot: 'core',
    name: 'Ox',
    blurb: 'Carries anything. Feels everything.',
    weight: 24,
    drain: 5,
    hp: 1312,
    armorK: 0.22,
    armorE: 0.18,
    cooling: 16,
    load: 40,
  },

  // ── Arms ─────────────────────────────────────────────
  {
    id: 'a-wire',
    slot: 'arms',
    name: 'Wire',
    blurb: 'Twitchy and precise.',
    weight: 5,
    drain: 3,
    hp: 150,
    accuracy: 1.1,
    armorK: 0.02,
  },
  {
    id: 'a-brace',
    slot: 'arms',
    name: 'Brace',
    blurb: 'Steady, armored forearms.',
    weight: 10,
    drain: 2,
    hp: 315,
    accuracy: 1.0,
    armorK: 0.08,
  },
  {
    id: 'a-ram',
    slot: 'arms',
    name: 'Ram',
    blurb: 'Built for punching things.',
    weight: 14,
    drain: 2,
    hp: 420,
    accuracy: 0.92,
    armorK: 0.12,
  },
  {
    id: 'a-gimbal',
    slot: 'arms',
    name: 'Gimbal',
    blurb: 'Stabilized. Loves energy guns.',
    weight: 7,
    drain: 7,
    hp: 195,
    accuracy: 1.13,
    armorK: 0.03,
  },

  // ── Legs ─────────────────────────────────────────────
  {
    id: 'l-strider',
    slot: 'legs',
    name: 'Strider',
    legType: 'biped',
    blurb: 'Two legs. Does everything okay.',
    weight: 18,
    drain: 3,
    hp: 525,
    armorK: 0.08,
    armorE: 0.08,
    load: 70,
    mobility: 1.0,
    evasion: 1.0,
  },
  {
    id: 'l-hopper',
    slot: 'legs',
    name: 'Hopper',
    legType: 'reverse',
    blurb: 'Backwards knees, big jumps.',
    weight: 14,
    drain: 3,
    hp: 390,
    armorK: 0.05,
    armorE: 0.05,
    load: 55,
    mobility: 1.15,
    evasion: 1.25,
  },
  {
    id: 'l-crab',
    slot: 'legs',
    name: 'Crab',
    legType: 'quad',
    blurb: 'Four legs, very planted.',
    weight: 26,
    drain: 4,
    hp: 820,
    armorK: 0.12,
    armorE: 0.1,
    load: 90,
    mobility: 0.8,
    evasion: 0.85,
  },
  {
    id: 'l-tread',
    slot: 'legs',
    name: 'Tread',
    legType: 'tank',
    blurb: 'Slow. Heavy guns fire on the move.',
    weight: 36,
    drain: 4,
    hp: 1134,
    armorK: 0.18,
    armorE: 0.14,
    load: 130,
    mobility: 0.6,
    evasion: 0.55,
  },
  {
    id: 'l-skate',
    slot: 'legs',
    name: 'Skate',
    legType: 'hover',
    blurb: 'Floats. Ignores mud. Thin.',
    weight: 12,
    drain: 9,
    hp: 392,
    armorK: 0.04,
    armorE: 0.07,
    load: 52,
    mobility: 1.3,
    evasion: 1.22,
  },

  // ── Boosters ─────────────────────────────────────────
  {
    id: 'b-puff',
    slot: 'booster',
    name: 'Puff',
    blurb: 'Gentle and thrifty.',
    weight: 3,
    drain: 1,
    thrust: 205,
    boostDrain: 4,
    qbPower: 170,
    qbCooldown: 24,
    qbCost: 18,
  },
  {
    id: 'b-jet',
    slot: 'booster',
    name: 'Jet',
    blurb: 'Fast. Thirsty.',
    weight: 5,
    drain: 2,
    thrust: 290,
    boostDrain: 12,
    qbPower: 240,
    qbCooldown: 18,
    qbCost: 28,
  },
  {
    id: 'b-rocket',
    slot: 'booster',
    name: 'Rocket',
    blurb: 'Pure speed, empties the tank.',
    weight: 7,
    drain: 3,
    thrust: 380,
    boostDrain: 22,
    qbPower: 310,
    qbCooldown: 19,
    qbCost: 36,
  },
  {
    id: 'b-drift',
    slot: 'booster',
    name: 'Drift',
    blurb: 'Quick-boosts twice as often. Slippery.',
    weight: 4,
    drain: 2,
    thrust: 230,
    boostDrain: 9,
    qbPower: 230,
    qbCooldown: 11,
    qbCost: 20,
  },

  // ── Generators ───────────────────────────────────────
  {
    id: 'g-ember',
    slot: 'generator',
    name: 'Ember',
    blurb: 'Small, steady output.',
    weight: 5,
    drain: 0,
    output: 45,
    capacity: 380,
    cooling: 8,
  },
  {
    id: 'g-furnace',
    slot: 'generator',
    name: 'Furnace',
    blurb: 'Huge output, runs hot.',
    weight: 12,
    drain: 0,
    output: 75,
    capacity: 400,
    cooling: -6,
  },
  {
    id: 'g-battery',
    slot: 'generator',
    name: 'Battery',
    blurb: 'Deep tank, slow refill.',
    weight: 9,
    drain: 0,
    output: 36,
    capacity: 900,
    cooling: 4,
  },
  {
    id: 'g-coil',
    slot: 'generator',
    name: 'Coil',
    blurb: 'Balanced, a bit heavy.',
    weight: 10,
    drain: 0,
    output: 58,
    capacity: 500,
    cooling: 2,
  },

  // ── Right hand weapons ───────────────────────────────
  {
    id: 'r-rifle',
    slot: 'weaponR',
    name: 'Rifle',
    blurb: 'Reliable at any range.',
    weight: 6,
    drain: 0,
    weapon: w({
      type: 'kinetic',
      damage: 74,
      minRange: 0,
      maxRange: 816,
      cooldown: 10,
      heat: 6,
      energyCost: 0,
      accuracy: 0.72,
      ammo: 75,
    }),
  },
  {
    id: 'r-bow',
    slot: 'weaponR',
    name: 'Gearbow',
    blurb: 'Mechanical bow. Slow draw, arrows punch straight through armor.',
    weight: 7,
    drain: 0,
    weapon: w({
      type: 'kinetic',
      damage: 165,
      minRange: 120,
      maxRange: 1300,
      cooldown: 28,
      heat: 5,
      energyCost: 0,
      accuracy: 0.78,
      ammo: 34,
      pierce: true,
    }),
  },
  {
    id: 'r-scatter',
    slot: 'weaponR',
    name: 'Scatter',
    blurb: 'Shotgun. Get close or go home.',
    weight: 7,
    drain: 0,
    weapon: w({
      type: 'kinetic',
      damage: 204,
      minRange: 0,
      maxRange: 289,
      cooldown: 19,
      heat: 13,
      energyCost: 0,
      accuracy: 0.78,
      ammo: 31,
    }),
  },
  {
    id: 'r-beam',
    slot: 'weaponR',
    name: 'Beam',
    blurb: 'Laser rifle. Eats energy.',
    weight: 5,
    drain: 2,
    weapon: w({
      type: 'energy',
      damage: 107,
      minRange: 0,
      maxRange: 952,
      cooldown: 11,
      heat: 14,
      energyCost: 26,
      accuracy: 0.78,
      ammo: null,
    }),
  },
  {
    id: 'r-rail',
    slot: 'weaponR',
    name: 'Rail',
    blurb: 'One slow, enormous shot.',
    weight: 11,
    drain: 3,
    weapon: w({
      type: 'energy',
      damage: 760,
      minRange: 255,
      maxRange: 1615,
      cooldown: 40,
      heat: 42,
      energyCost: 112,
      accuracy: 0.9,
      ammo: null,
      heavy: true,
    }),
  },
  {
    id: 'r-buzz',
    slot: 'weaponR',
    name: 'Buzz',
    blurb: 'SMG. Sprays and prays.',
    weight: 4,
    drain: 0,
    weapon: w({
      type: 'kinetic',
      damage: 32,
      minRange: 0,
      maxRange: 442,
      cooldown: 3,
      heat: 3,
      energyCost: 0,
      accuracy: 0.62,
      ammo: 250,
    }),
  },
  {
    id: 'r-pile',
    slot: 'weaponR',
    name: 'Pile',
    blurb: 'A hydraulic spike. Point blank.',
    weight: 9,
    drain: 0,
    weapon: w({
      type: 'melee',
      damage: 471,
      minRange: 0,
      maxRange: 119,
      cooldown: 35,
      heat: 16,
      energyCost: 0,
      accuracy: 0.87,
      ammo: null,
    }),
  },
  {
    id: 'r-lance',
    slot: 'weaponR',
    name: 'Lance',
    blurb: 'Long spear. Hits harder the faster you charge.',
    weight: 11,
    drain: 0,
    weapon: w({
      type: 'melee',
      damage: 280,
      minRange: 0,
      maxRange: 200,
      cooldown: 40,
      heat: 14,
      energyCost: 0,
      accuracy: 0.84,
      ammo: null,
      charge: true,
    }),
  },

  // ── Left hand: weapons + shields ─────────────────────
  {
    id: 'lw-pistol',
    slot: 'weaponL',
    name: 'Pistol',
    blurb: 'Light sidearm.',
    weight: 3,
    drain: 0,
    weapon: w({
      type: 'kinetic',
      damage: 54,
      minRange: 0,
      maxRange: 544,
      cooldown: 10,
      heat: 5,
      energyCost: 0,
      accuracy: 0.74,
      ammo: 94,
    }),
  },
  {
    id: 'lw-saber',
    slot: 'weaponL',
    name: 'Saber',
    blurb: 'Plasma blade. Ignores armor a bit.',
    weight: 5,
    drain: 3,
    weapon: w({
      type: 'melee',
      damage: 346,
      minRange: 0,
      maxRange: 128,
      cooldown: 22,
      heat: 22,
      energyCost: 32,
      accuracy: 0.82,
      ammo: null,
    }),
  },
  {
    id: 'lw-knuckle',
    slot: 'weaponL',
    name: 'Knuckle',
    blurb: 'A giant fist. Fast jabs, staggers on hit.',
    weight: 7,
    drain: 0,
    weapon: w({
      type: 'melee',
      damage: 180,
      minRange: 0,
      maxRange: 110,
      cooldown: 10,
      heat: 8,
      energyCost: 0,
      accuracy: 0.9,
      ammo: null,
    }),
  },
  {
    id: 'lw-flamer',
    slot: 'weaponL',
    name: 'Flamer',
    blurb: 'Burns armor and the user.',
    weight: 6,
    drain: 0,
    weapon: w({
      type: 'energy',
      damage: 44,
      minRange: 0,
      maxRange: 280,
      cooldown: 3,
      heat: 9,
      energyCost: 5,
      accuracy: 0.86,
      ammo: null,
    }),
  },
  {
    id: 'lw-lance',
    slot: 'weaponL',
    name: 'Pulse',
    blurb: 'Pulse laser, mid range.',
    weight: 4,
    drain: 2,
    weapon: w({
      type: 'energy',
      damage: 77,
      minRange: 0,
      maxRange: 714,
      cooldown: 10,
      heat: 11,
      energyCost: 19,
      accuracy: 0.76,
      ammo: null,
    }),
  },
  {
    id: 'lw-door',
    slot: 'weaponL',
    name: 'Door',
    blurb: 'A shield made of an actual door.',
    weight: 9,
    drain: 1,
    shield: { block: 0.56, energyPerHit: 0 },
  },
  {
    id: 'lw-aegis',
    slot: 'weaponL',
    name: 'Aegis',
    blurb: 'Energy shield. Blocks a lot, costs a lot.',
    weight: 4,
    drain: 2,
    shield: { block: 0.78, energyPerHit: 6 },
  },

  // ── Back units ───────────────────────────────────────
  {
    id: 'bk-swarm',
    slot: 'back',
    name: 'Swarm',
    blurb: 'Homing missiles. Hard to dodge.',
    weight: 8,
    drain: 1,
    weapon: w({
      type: 'explosive',
      damage: 147,
      minRange: 204,
      maxRange: 1275,
      cooldown: 54,
      heat: 16,
      energyCost: 0,
      accuracy: 0.85,
      ammo: 15,
      homing: true,
    }),
  },
  {
    id: 'bk-howitzer',
    slot: 'back',
    name: 'Howitzer',
    blurb: 'Big cannon. Plant your feet.',
    weight: 16,
    drain: 1,
    weapon: w({
      type: 'explosive',
      damage: 640,
      minRange: 340,
      maxRange: 1530,
      cooldown: 70,
      heat: 35,
      energyCost: 0,
      accuracy: 0.62,
      ammo: 10,
      heavy: true,
    }),
  },
  {
    id: 'bk-orbit',
    slot: 'back',
    name: 'Orbit',
    blurb: 'Laser drone that fires on its own.',
    weight: 5,
    drain: 5,
    weapon: w({
      type: 'energy',
      damage: 48,
      minRange: 0,
      maxRange: 850,
      cooldown: 8,
      heat: 5,
      energyCost: 13,
      accuracy: 0.7,
      ammo: null,
    }),
  },
  {
    id: 'bk-plate',
    slot: 'back',
    name: 'Plate',
    blurb: 'Bolted-on armor. Heavy.',
    weight: 14,
    drain: 0,
    utility: { hp: 600, armorK: 0.08, armorE: 0.04 },
  },
  {
    id: 'bk-dish',
    slot: 'back',
    name: 'Dish',
    blurb: 'Radar. Better aim, longer reach.',
    weight: 5,
    drain: 4,
    utility: { sensor: 1530, accuracy: 0.24, range: 0.2 },
  },
  {
    id: 'bk-chaff',
    slot: 'back',
    name: 'Chaff',
    blurb: 'Jammer. Enemy aim gets worse.',
    weight: 4,
    drain: 5,
    utility: { jam: 0.22 },
  },
  {
    id: 'bk-magnet',
    slot: 'back',
    name: 'Grav Anchor',
    blurb: "Magnet. Pulls enemies in if you want them close, pushes them off if you don't.",
    weight: 11,
    drain: 6,
    utility: { pull: 130, hp: 200 },
  },
  {
    id: 'bk-fins',
    slot: 'back',
    name: 'Fins',
    blurb: 'Extra cooling. Spam freely.',
    weight: 4,
    drain: 1,
    utility: { cooling: 40, hp: 240 },
  },

  // ── Pilot chips ──────────────────────────────────────
  {
    id: 'p-rush',
    slot: 'chip',
    name: 'Rush',
    behavior: 'rush',
    blurb: 'Closes the gap, fights close.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-kite',
    slot: 'chip',
    name: 'Kite',
    behavior: 'kite',
    blurb: 'Keeps distance, backs off.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-turtle',
    slot: 'chip',
    name: 'Turtle',
    behavior: 'turtle',
    blurb: 'Holds ground, saves energy.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-sniper',
    slot: 'chip',
    name: 'Sniper',
    behavior: 'sniper',
    blurb: 'Stops to aim. Max range.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-berserk',
    slot: 'chip',
    name: 'Berserk',
    behavior: 'berserk',
    blurb: 'Fires through overheat. Burns itself.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-flank',
    slot: 'chip',
    name: 'Flank',
    behavior: 'flank',
    blurb: 'Circles the enemy, hard to pin.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-redshift',
    slot: 'chip',
    name: 'Redshift',
    behavior: 'redshift',
    blurb: 'Overclocks the pilot. Burns hot after.',
    weight: 0,
    drain: 0,
  },
  {
    id: 'p-velocity',
    slot: 'chip',
    name: 'Velocity',
    behavior: 'velocity',
    blurb: 'Starts slow, builds momentum. Getting hit bleeds it. At full speed: ram.',
    weight: 0,
    drain: 0,
  },
];

export const PART_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const partsForSlot = (slot: Slot): Part[] => PARTS.filter((p) => p.slot === slot);

export const getPart = (id: string): Part => {
  const p = PART_BY_ID[id];
  if (!p) throw new Error(`unknown part ${id}`);
  return p;
};
