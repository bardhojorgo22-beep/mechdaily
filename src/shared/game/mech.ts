import type { Arena } from './arenas';
import { SLOTS, getPart, PART_BY_ID, type Behavior, type LegType, type Slot, type Weapon } from './parts';
import { clamp } from './rng';
import { synergiesOf, type SynergyId } from './synergies';

export type Paint = { body: number; trim: number; decal: number };

export type Build = {
  name: string;
  parts: Record<Slot, string>;
  paint: Paint;
};

/** Popularity tax per part id, 0 (nobody uses it) .. 1 (everyone does). */
export type Tax = Record<string, number>;

export const BODY_COLORS = ['#c9b79c', '#5b6b4e', '#8a3b2e', '#2f4858', '#d9a441', '#6d5a72', '#3c3c3c', '#e8e2d4'];
export const TRIM_COLORS = ['#f2542d', '#0e9594', '#f5dfbb', '#127475', '#562c2c', '#ffd23f', '#111111', '#7cb518'];
export const DECALS = ['none', 'stripe', 'skull', 'star', 'number', 'hazard', 'eye', 'bolt'];

export const DEFAULT_BUILD: Build = {
  name: 'Rookie',
  parts: {
    head: 'h-lantern',
    core: 'c-shell',
    arms: 'a-brace',
    legs: 'l-strider',
    booster: 'b-puff',
    generator: 'g-ember',
    weaponR: 'r-rifle',
    weaponL: 'lw-pistol',
    back: 'bk-swarm',
    chip: 'p-rush',
  },
  paint: { body: 0, trim: 0, decal: 0 },
};

export const sanitizeName = (raw: unknown): string => {
  const s = typeof raw === 'string' ? raw : '';
  const cleaned = s
    .replace(/[^\p{L}\p{N} _\-'.]/gu, '')
    .trim()
    .slice(0, 18);
  return cleaned.length > 0 ? cleaned : 'Unnamed';
};

/** Returns a valid build or null. Never trust a build from the client. */
export const validateBuild = (raw: unknown): Build | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const partsIn: unknown = Reflect.get(raw, 'parts');
  if (typeof partsIn !== 'object' || partsIn === null) return null;
  const ids: Partial<Record<Slot, string>> = {};
  for (const slot of SLOTS) {
    const id: unknown = Reflect.get(partsIn, slot);
    if (typeof id !== 'string') return null;
    const part = PART_BY_ID[id];
    if (!part || part.slot !== slot) return null;
    ids[slot] = id;
  }
  const paintRaw: unknown = Reflect.get(raw, 'paint');
  const paintIn: object = typeof paintRaw === 'object' && paintRaw !== null ? paintRaw : {};
  const idx = (v: unknown, n: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : 0);
  const pick = (slot: Slot) => ids[slot] ?? DEFAULT_BUILD.parts[slot];
  return {
    name: sanitizeName(Reflect.get(raw, 'name')),
    parts: {
      head: pick('head'),
      core: pick('core'),
      arms: pick('arms'),
      legs: pick('legs'),
      booster: pick('booster'),
      generator: pick('generator'),
      weaponR: pick('weaponR'),
      weaponL: pick('weaponL'),
      back: pick('back'),
      chip: pick('chip'),
    },
    paint: {
      body: idx(Reflect.get(paintIn, 'body'), BODY_COLORS.length),
      trim: idx(Reflect.get(paintIn, 'trim'), TRIM_COLORS.length),
      decal: idx(Reflect.get(paintIn, 'decal'), DECALS.length),
    },
  };
};

export type MountedWeapon = Weapon & {
  slot: 'weaponR' | 'weaponL' | 'back';
  partId: string;
};

export type MechStats = {
  synergies: SynergyId[];
  hp: number;
  armorK: number;
  armorE: number;
  weight: number;
  load: number;
  overweight: number; // 0 = fine, 0.3 = 30% over
  speed: number; // metres per second while boosting
  walkSpeed: number; // when out of energy
  evasion: number;
  accuracy: number;
  sensor: number;
  energyCap: number;
  energyRegen: number; // net per second, after passive drains
  boostDrain: number;
  qbSpeed: number;
  qbCooldown: number;
  qbCost: number;
  cooling: number; // heat removed per second
  jam: number;
  pull: number; // magnet drag on the enemy, m/s
  rangeBonus: number;
  legType: LegType;
  behavior: Behavior;
  weapons: MountedWeapon[];
  shield: { block: number; energyPerHit: number; bash: number } | null;
  meleeBonus: number; // extra melee damage share
  mines: { damage: number; every: number } | null;
  smoke: { every: number; dur: number } | null;
  barrier: { hp: number; regen: number } | null;
};

/** Popularity tax: popular parts get heavier and a little weaker. */
const taxWeight = (t: number) => 1 + 0.45 * t;
const taxEff = (t: number) => 1 - 0.18 * t;

export const computeStats = (build: Build, arena: Arena, tax: Tax = {}): MechStats => {
  let hp = 0;
  let armorK = 0;
  let armorE = 0;
  let weight = 0;
  let load = 0;
  let drain = 0;
  let accuracy = 1;
  let sensor = 0;
  let cooling = 0;
  let jam = 0;
  let pull = 0;
  let meleeBonus = 0;
  let mines: MechStats['mines'] = null;
  let smoke: MechStats['smoke'] = null;
  let barrier: MechStats['barrier'] = null;
  let rangeBonus = 0;
  let thrust = 0;
  let boostDrain = 0;
  let qbPower = 0;
  let qbCooldown = 30;
  let qbCost = 40;
  let output = 0;
  let capacity = 0;
  let mobility = 1;
  let legEvasion = 1;
  let legType: LegType = 'biped';
  let behavior: Behavior = 'rush';
  let shield: MechStats['shield'] = null;
  const weapons: MountedWeapon[] = [];

  for (const slot of SLOTS) {
    const part = getPart(build.parts[slot]);
    const t = tax[part.id] ?? 0;
    const eff = taxEff(t);
    weight += part.weight * taxWeight(t);
    drain += part.drain;

    switch (part.slot) {
      case 'head':
        hp += part.hp * eff;
        accuracy *= 1 + (part.accuracy - 1) * eff;
        sensor = Math.max(sensor, part.sensor);
        meleeBonus += (part.melee ?? 0) * eff;
        break;
      case 'core':
        hp += part.hp * eff;
        output += (part.energy ?? 0) * eff;
        armorK += part.armorK * eff;
        armorE += part.armorE * eff;
        cooling += part.cooling * eff;
        load += part.load * eff;
        break;
      case 'arms':
        hp += part.hp * eff;
        accuracy *= 1 + (part.accuracy - 1) * eff;
        armorK += part.armorK * eff;
        break;
      case 'legs':
        hp += part.hp * eff;
        armorK += part.armorK * eff;
        armorE += part.armorE * eff;
        load += part.load * eff;
        mobility = part.mobility * eff;
        legEvasion = part.evasion;
        legType = part.legType;
        break;
      case 'booster':
        thrust = part.thrust * eff;
        boostDrain = part.boostDrain;
        qbPower = part.qbPower * eff;
        qbCooldown = part.qbCooldown;
        qbCost = part.qbCost;
        break;
      case 'generator':
        output += part.output * eff;
        capacity = part.capacity;
        cooling += part.cooling;
        break;
      case 'chip':
        behavior = part.behavior;
        break;
      default:
        if ('weapon' in part) {
          weapons.push({
            ...part.weapon,
            damage: part.weapon.damage * eff,
            slot: part.slot,
            partId: part.id,
          });
        } else if ('shield' in part) {
          shield = {
            block: part.shield.block * eff,
            energyPerHit: part.shield.energyPerHit,
            bash: part.shield.bash ?? 0,
          };
        } else if ('utility' in part) {
          const u = part.utility;
          hp += (u.hp ?? 0) * eff;
          armorK += (u.armorK ?? 0) * eff;
          armorE += (u.armorE ?? 0) * eff;
          sensor = Math.max(sensor, u.sensor ?? 0);
          accuracy *= 1 + (u.accuracy ?? 0) * eff;
          cooling += (u.cooling ?? 0) * eff;
          jam += (u.jam ?? 0) * eff;
          pull += (u.pull ?? 0) * eff;
          if (u.mines) mines = { damage: u.mines.damage * eff, every: u.mines.every };
          if (u.smoke) smoke = u.smoke;
          if (u.barrier) barrier = { hp: u.barrier.hp * eff, regen: u.barrier.regen };
          rangeBonus += (u.range ?? 0) * eff;
        }
    }
  }

  const overweight = Math.max(0, weight / load - 1);
  // Overweight hurts a lot: 20% over = roughly half speed.
  const weightFactor = overweight > 0 ? 1 / (1 + overweight * overweight * 12 + overweight * 2) : 1;
  const legSpeed = arena.legSpeed[legType] ?? 1;
  // Heavier mechs are slower even under the limit.
  const massFactor = 1 / (1 + weight / 160);
  const speed = thrust * mobility * weightFactor * legSpeed * arena.speed * massFactor * 0.9;
  const evasion = clamp((speed / 346) * legEvasion * (arena.evasion[legType] ?? 1), 0, 0.55);

  return {
    synergies: synergiesOf(build.parts),
    hp: Math.round(hp),
    armorK: clamp(armorK, 0, 0.65),
    armorE: clamp(armorE, 0, 0.65),
    weight,
    load,
    overweight,
    speed,
    walkSpeed: speed * 0.35,
    evasion,
    accuracy,
    sensor,
    energyCap: capacity,
    energyRegen: output * arena.genOutput - drain,
    boostDrain: boostDrain * arena.boostDrain,
    qbSpeed: (1.15 * qbPower * mobility * weightFactor * legSpeed * arena.speed) / (1 + weight / 140),
    qbCooldown,
    qbCost: qbCost * arena.boostDrain,
    cooling: cooling * arena.cooling,
    jam,
    pull,
    rangeBonus,
    legType,
    behavior,
    weapons: weapons.map((wp) => ({
      ...wp,
      maxRange: wp.maxRange * (1 + rangeBonus),
    })),
    shield,
    meleeBonus,
    mines,
    smoke,
    barrier,
  };
};
