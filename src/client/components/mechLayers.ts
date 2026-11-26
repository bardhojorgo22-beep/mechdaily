export const MECH_LAYERS = ['back', 'legs', 'armR', 'armL', 'body'] as const;
export type MechLayer = (typeof MECH_LAYERS)[number];
