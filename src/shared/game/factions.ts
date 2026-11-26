export const FACTION_IDS = ['foundry', 'tide', 'static'] as const;
export type FactionId = (typeof FACTION_IDS)[number];

export type Faction = {
  id: FactionId;
  name: string;
  motto: string;
  color: string;
  ink: 'dark' | 'light';
};

export const FACTIONS: Record<FactionId, Faction> = {
  foundry: {
    id: 'foundry',
    name: 'Foundry',
    motto: 'Heavier is better.',
    color: '#e4572e',
    ink: 'light',
  },
  tide: {
    id: 'tide',
    name: 'Tide',
    motto: 'Never stand still.',
    color: '#17bebb',
    ink: 'dark',
  },
  static: {
    id: 'static',
    name: 'Static',
    motto: 'Every shot counts.',
    color: '#ffc914',
    ink: 'dark',
  },
};

export const isFactionId = (v: unknown): v is FactionId =>
  typeof v === 'string' && (FACTION_IDS as readonly string[]).includes(v);
