// Hidden part combos. Odd pairings that secretly work together.
// Each sub discovers them one by one; the first finder gets credited.

export const SYNERGY_IDS = [
  'hunter',
  'knight',
  'beartrap',
  'inferno',
  'ghost',
  'siege',
  'driveby',
  'dancer',
  'lockon',
  'thunder',
  'guardian',
] as const;
export type SynergyId = (typeof SYNERGY_IDS)[number];

export type Synergy = {
  id: SynergyId;
  name: string;
  /** every one of these part ids must be equipped */
  parts: string[];
  effect: string;
  /** shown before anyone has found it */
  hint: string;
};

export const SYNERGIES: Record<SynergyId, Synergy> = {
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    parts: ['r-bow', 'lw-knuckle'],
    effect: 'Arrow hits pin the target in place. The next jab on a pinned target hits for double.',
    hint: 'A hunter brings two tools: one to pin, one to finish.',
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    parts: ['r-lance', 'lw-door'],
    effect: 'While charging, the shield blocks more. Lance charges hit 8% harder.',
    hint: 'Spear and shield, like the old stories.',
  },
  beartrap: {
    id: 'beartrap',
    name: 'Bear Trap',
    parts: ['bk-magnet', 'r-pile'],
    effect: 'The magnet pulls harder when the pile is loaded. Pile hits stagger.',
    hint: 'Pull them in, then spring the trap.',
  },
  inferno: {
    id: 'inferno',
    name: 'Inferno',
    parts: ['lw-flamer', 'g-furnace'],
    effect: 'Flamer hits set the target burning for 3s, dealing damage over time.',
    hint: 'The hottest weapon fed by the hottest power source.',
  },
  ghost: {
    id: 'ghost',
    name: 'Ghost Shot',
    parts: ['r-rail', 'bk-chaff'],
    effect: 'Rail shots give no warning, so nobody can dodge them, and they aim truer.',
    hint: 'A shot nobody sees coming.',
  },
  siege: {
    id: 'siege',
    name: 'Siege Mode',
    parts: ['bk-howitzer', 'l-tread'],
    effect: 'Howitzer fires 20% faster and 25% more accurately.',
    hint: 'Dig in and shell them.',
  },
  driveby: {
    id: 'driveby',
    name: 'Drive-By',
    parts: ['r-scatter', 'p-velocity'],
    effect: 'Shotgun hits 50% harder once momentum is building.',
    hint: 'Fast ride, shotgun seat.',
  },
  dancer: {
    id: 'dancer',
    name: 'Blade Dancer',
    parts: ['lw-saber', 'l-skate'],
    effect: 'Saber hits 20% harder and every hit instantly refreshes the dodge dash.',
    hint: 'Glide, cut, glide away.',
  },
  lockon: {
    id: 'lockon',
    name: 'Lock-On',
    parts: ['bk-swarm', 'h-owl'],
    effect: 'Missiles are 40% more accurate and hit 20% harder.',
    hint: 'Sharp eyes for smart missiles.',
  },
  thunder: {
    id: 'thunder',
    name: 'Thunder Coil',
    parts: ['lw-lance', 'g-coil'],
    effect: 'Pulse shots hit 35% harder while energy is above 60%.',
    hint: 'An energy weapon that loves a coil.',
  },
  guardian: {
    id: 'guardian',
    name: 'Guardian',
    parts: ['bk-orbit', 'lw-aegis'],
    effect: 'The drone zaps 16% of incoming shots out of the air.',
    hint: 'A little friend with a big shield.',
  },
};

/** Balance tooling only: switch synergies off to measure what they add. */
export const SYNERGY_TEST = { off: false };

export const synergiesOf = (parts: Record<string, string>): SynergyId[] => {
  if (SYNERGY_TEST.off) return [];
  const have = new Set(Object.values(parts));
  return SYNERGY_IDS.filter((id) => SYNERGIES[id].parts.every((p) => have.has(p)));
};
