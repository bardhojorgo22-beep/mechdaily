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
  // new pairs
  'shatter',
  'overload',
  'conductor',
  'reelin',
  'minefield',
  'riotcontrol',
  'leadstorm',
  'frostbite',
  'bunker',
  'demolition',
  // pilot chip + weapon
  'volley',
  'bloodlust',
  'unstoppable',
  'jackpot',
  'slingshot',
  // legendary 3-part combos
  'titan',
  'absolutezero',
  'stormcaller',
  'deathdrive',
  'bullethell',
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
  /** pair (default), a pilot-chip combo, or a rare 3-part legendary */
  tier?: 'chip' | 'legendary';
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
  shatter: {
    id: 'shatter',
    name: 'Shatter',
    parts: ['r-frost', 'lw-knuckle'],
    effect: 'Punches on a chilled target shatter the ice for ×2.2 damage.',
    hint: 'Freeze it first, then punch it.',
  },
  overload: {
    id: 'overload',
    name: 'Overload',
    parts: ['r-tesla', 'g-fusion'],
    effect: 'Tesla arcs hit a bit harder and pump heat into the target until it overheats.',
    hint: 'Too much power, aimed at someone else.',
  },
  conductor: {
    id: 'conductor',
    name: 'Conductor',
    parts: ['lw-acid', 'r-tesla'],
    effect: 'Tesla arcs do +25% to targets dripping with acid.',
    hint: 'Wet metal conducts.',
  },
  reelin: {
    id: 'reelin',
    name: 'Reel & Rip',
    parts: ['r-harpoon', 'lw-saber'],
    effect: 'After a harpoon hit, the saber does +50% for 3 seconds.',
    hint: 'Hook them, then bring the blade.',
  },
  minefield: {
    id: 'minefield',
    name: 'Minefield',
    parts: ['bk-mines', 'r-harpoon'],
    effect: 'Mines drop twice as often and arm instantly. Yank them onto your traps.',
    hint: 'Leave a gift, then reel them in.',
  },
  riotcontrol: {
    id: 'riotcontrol',
    name: 'Riot Control',
    parts: ['lw-riot', 'bk-smoke'],
    effect: 'Smoke pops more often and shield bashes stun longer.',
    hint: 'Gas and shields, the classic kit.',
  },
  leadstorm: {
    id: 'leadstorm',
    name: 'Lead Storm',
    parts: ['r-minigun', 'a-gimbal'],
    effect: 'The minigun spins up twice as fast and aims 10% truer.',
    hint: 'Steady arms for a spinning gun.',
  },
  frostbite: {
    id: 'frostbite',
    name: 'Frostbite',
    parts: ['r-frost', 'lw-acid'],
    effect: 'Acid also chills, and frost shots also melt armor.',
    hint: 'Ice and acid, both at once.',
  },
  bunker: {
    id: 'bunker',
    name: 'Bunker',
    parts: ['bk-barrier', 'c-vault'],
    effect: 'The barrier bubble is 30% bigger and recharges almost twice as fast.',
    hint: 'The thickest core under a shield bubble.',
  },
  demolition: {
    id: 'demolition',
    name: 'Demolition',
    parts: ['lw-grenade', 'bk-howitzer'],
    effect: 'Explosions hit 18% harder, and grenade misses splash 50% more.',
    hint: 'Everything that goes boom, all at once.',
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    tier: 'chip',
    parts: ['p-sniper', 'r-bow'],
    effect: 'The Sniper’s charged shot becomes a 4-arrow volley that never misses (up to half their HP).',
    hint: 'A patient pilot with a bow.',
  },
  bloodlust: {
    id: 'bloodlust',
    name: 'Bloodlust',
    tier: 'chip',
    parts: ['p-berserk', 'r-chainsaw'],
    effect: 'Chainsaw hits heal you a little. Double while raging.',
    hint: 'A berserker and a saw.',
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Unstoppable',
    tier: 'chip',
    parts: ['p-juggernaut', 'r-hammer'],
    effect: 'Hammer slams hit 25% harder and stagger through any defense.',
    hint: 'An unstoppable pilot with an immovable weapon.',
  },
  jackpot: {
    id: 'jackpot',
    name: 'Jackpot',
    tier: 'chip',
    parts: ['p-gambler', 'r-minigun'],
    effect: 'Minigun rounds roll double 35% of the time.',
    hint: 'More bullets, more rolls of the dice.',
  },
  slingshot: {
    id: 'slingshot',
    name: 'Slingshot',
    tier: 'chip',
    parts: ['p-velocity', 'r-harpoon'],
    effect: 'Harpoon hits fling you forward: +50% momentum each time.',
    hint: 'Hook something and let it pull you up to speed.',
  },
  titan: {
    id: 'titan',
    name: 'THE JUGGERNAUT',
    tier: 'legendary',
    parts: ['r-hammer', 'lw-riot', 'p-juggernaut'],
    effect: 'Hammer shockwaves reach much further, and every shield bash reflects 25% of the blocked melee damage.',
    hint: 'Hammer, shield, and a pilot who never stops.',
  },
  absolutezero: {
    id: 'absolutezero',
    name: 'ABSOLUTE ZERO',
    tier: 'legendary',
    parts: ['r-frost', 'bk-fins', 'g-coil'],
    effect: 'Frost chills much faster, and a chilled target freezes solid: can’t move or shoot for 1.5s.',
    hint: 'Cold shots, cooling fins, and a power coil.',
  },
  stormcaller: {
    id: 'stormcaller',
    name: 'STORMCALLER',
    tier: 'legendary',
    parts: ['r-tesla', 'bk-orbit', 'g-fusion'],
    effect: 'Your orbit drone fires lightning too: +25% damage and every hit drains power.',
    hint: 'Lightning, a little drone, and the biggest power source.',
  },
  deathdrive: {
    id: 'deathdrive',
    name: 'DEATH DRIVE',
    tier: 'legendary',
    parts: ['p-velocity', 'r-lance', 'b-thruster'],
    effect: 'Momentum builds 50% faster and the full-speed ram hits 70% harder.',
    hint: 'A speed-hungry pilot, a lance, and the biggest booster.',
  },
  bullethell: {
    id: 'bullethell',
    name: 'BULLET HELL',
    tier: 'legendary',
    parts: ['r-minigun', 'lw-pistol', 'a-gimbal'],
    effect: 'The minigun never spins down and the pistol fires 50% faster.',
    hint: 'Two guns, steady arms, and absolutely no restraint.',
  },
};

/** Balance tooling only: switch synergies off to measure what they add. */
export const SYNERGY_TEST = { off: false };

export const synergiesOf = (parts: Record<string, string>): SynergyId[] => {
  if (SYNERGY_TEST.off) return [];
  const have = new Set(Object.values(parts));
  return SYNERGY_IDS.filter((id) => SYNERGIES[id].parts.every((p) => have.has(p)));
};
