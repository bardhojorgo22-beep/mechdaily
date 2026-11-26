import type { MechStats } from './mech';

export type FightingStyle = { name: string; plan: string };

/** A readable label for a build, so players know what their pilot will try to do. */
export const fightingStyle = (s: MechStats): FightingStyle => {
  const dps = (type?: string) =>
    s.weapons.filter((w) => !type || w.type === type).reduce((a, w) => a + w.damage / w.cooldown, 0);
  const melee = dps('melee');
  const total = Math.max(0.01, dps());
  const longest = Math.max(0, ...s.weapons.map((w) => w.maxRange));
  const tough = s.hp * (1 + (s.armorK + s.armorE) / 2);
  if (melee / total > 0.45) {
    return tough > 3400 || s.shield
      ? { name: 'Brawler', plan: 'Shield up, charge in, land the big hit.' }
      : { name: 'Blade Runner', plan: 'Lunges in to strike, boosts back out while the blade recharges.' };
  }
  if (tough < 2600 && s.speed > 150)
    return { name: 'Glass Cannon', plan: 'Fast and fragile. Keeps mid-to-long range and never lets melee get close.' };
  if (tough > 3400 && s.speed < 120)
    return { name: 'Tank', plan: 'Slow and sturdy. Holds ground where its guns hit hardest.' };
  if (longest >= 1100) return { name: 'Artillery', plan: 'Stays far back and punishes anyone in the open.' };
  if (s.speed > 170) return { name: 'Skirmisher', plan: 'Circles and dashes, picks the range that suits the matchup.' };
  return { name: 'Frontliner', plan: 'Solid all-rounder. Fights at mid range and adapts to the enemy.' };
};
