// Balance check: random sensible builds fight round-robin in every arena.
// Run: npx tsx tools/balance.ts [buildsPerArena]
import { ARENAS } from '../src/shared/game/arenas';
import { simulateBattle } from '../src/shared/game/battle';
import { computeStats, type Build } from '../src/shared/game/mech';
import { SLOTS, partsForSlot, getPart, type Slot } from '../src/shared/game/parts';
import { createRng } from '../src/shared/game/rng';

const N = Number(process.argv[2] ?? 60);
const rng = createRng('balance');

const randomBuild = (i: number): Build => {
  for (;;) {
    const parts = Object.fromEntries(SLOTS.map((s) => [s, rng.pick(partsForSlot(s)).id])) as Record<Slot, string>;
    const b: Build = { name: `B${i}`, parts, paint: { body: 0, trim: 0, decal: 0 } };
    const st = computeStats(b, ARENAS[0]!);
    if (st.overweight <= 0.05 && st.energyRegen > 0) return b;
  }
};

const partWins: Record<string, { w: number; n: number }> = {};
const overall: Record<string, { w: number; n: number }> = {};
let timeouts = 0;
let fights = 0;
let totalTicks = 0;

for (const arena of ARENAS) {
  const builds = Array.from({ length: N }, (_, i) => randomBuild(i));
  const wins = new Array(N).fill(0);
  const arenaParts: Record<string, { w: number; n: number }> = {};
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const r = simulateBattle({ build: builds[i]! }, { build: builds[j]! }, arena, `${arena.id}:${i}:${j}`);
      fights++;
      totalTicks += r.ticks;
      if (r.reason === 'time') timeouts++;
      const win = r.winner === 0 ? i : j;
      wins[win]++;
      for (const [idx, won] of [
        [i, win === i],
        [j, win === j],
      ] as const) {
        for (const id of Object.values(builds[idx]!.parts)) {
          for (const tbl of [arenaParts, partWins]) {
            tbl[id] ??= { w: 0, n: 0 };
            tbl[id].n++;
            if (won) tbl[id].w++;
          }
        }
      }
    }
  }
  const best = wins.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w)[0]!;
  const top = Object.entries(arenaParts)
    .map(([id, v]) => ({ id, r: v.w / v.n }))
    .sort((a, b) => b.r - a.r);
  console.log(
    `${arena.name.padEnd(13)} best build ${((best.w / (N - 1)) * 100).toFixed(0)}% | top parts: ${top
      .slice(0, 4)
      .map((t) => `${t.id} ${(t.r * 100).toFixed(0)}%`)
      .join(', ')} | worst: ${top
      .slice(-3)
      .map((t) => `${t.id} ${(t.r * 100).toFixed(0)}%`)
      .join(', ')}`
  );
  for (const [id, v] of Object.entries(arenaParts)) {
    overall[id] ??= { w: 0, n: 0 };
    overall[id].w += v.w;
    overall[id].n += v.n;
  }
}

console.log(
  `\nfights ${fights}, timeouts ${((timeouts / fights) * 100).toFixed(1)}%, avg length ${(totalTicks / fights / 10).toFixed(1)}s\n`
);
const bySlot: Record<string, string[]> = {};
for (const [id, v] of Object.entries(overall).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)) {
  const p = getPart(id);
  const r = v.w / v.n;
  const flag = r > 0.58 ? ' !!HIGH' : r < 0.42 ? ' !!LOW' : '';
  (bySlot[p.slot] ??= []).push(`${p.name} ${(r * 100).toFixed(0)}%${flag}`);
}
for (const s of SLOTS) console.log(`${s.padEnd(10)} ${bySlot[s]?.join(' | ')}`);
