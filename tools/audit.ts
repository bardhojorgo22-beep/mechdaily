// Deep balance audit. Run: npx tsx tools/audit.ts [buildsPerArena]
import { ARENAS } from '../src/shared/game/arenas';
import { simulateBattle, type BattleResult } from '../src/shared/game/battle';
import { computeStats, type Build } from '../src/shared/game/mech';
import { SLOTS, partsForSlot, getPart, type Slot } from '../src/shared/game/parts';
import { createRng } from '../src/shared/game/rng';

const N = Number(process.argv[2] ?? 70);
const rng = createRng('audit');
const sane = (b: Build) => {
  const st = computeStats(b, ARENAS[0]!);
  return st.overweight <= 0.05 && st.energyRegen > 0;
};
const randomBuild = (i: number): Build => {
  for (;;) {
    const parts = Object.fromEntries(SLOTS.map((s) => [s, rng.pick(partsForSlot(s)).id])) as Record<Slot, string>;
    const b: Build = { name: `B${i}`, parts, paint: { body: 0, trim: 0, decal: 0 } };
    if (sane(b)) return b;
  }
};
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
type Acc = { w: number; n: number };
const add = (m: Record<string, Acc>, k: string, won: boolean) => {
  m[k] ??= { w: 0, n: 0 };
  m[k].n++;
  if (won) m[k].w++;
};

// ── A. round robin with diagnostics ──
const overall: Record<string, Acc> = {};
const perArena: Record<string, Record<string, Acc>> = {};
const lengths: number[] = [];
let timeouts = 0;
let fights = 0;
let lastStandFights = 0;
let lastStandWins = 0;
const weaponFired: Record<string, Acc> = {}; // fraction of fights where an equipped weapon fired
const weaponHit: Record<string, { hits: number; shots: number; dmg: number; fights: number }> = {};
const chipTrig: Record<string, Acc> = {};
const overheatShare: Record<string, { hot: number; ticks: number }> = {};
const zeroEnergy: Record<string, { z: number; ticks: number }> = {};
const shortFights: string[] = [];

const scan = (r: BattleResult, builds: [Build, Build]) => {
  const frames = r.frames.length / 10;
  for (const side of [0, 1] as const) {
    const b = builds[side];
    const slots: ('weaponR' | 'weaponL' | 'back')[] = ['weaponR', 'weaponL', 'back'];
    for (const s of slots) {
      const id = b.parts[s];
      const part = getPart(id);
      if (!('weapon' in part)) continue;
      const evs = r.events.filter((e) => e.by === side && e.slot === s);
      add(weaponFired, id, evs.length > 0);
      const w = (weaponHit[id] ??= { hits: 0, shots: 0, dmg: 0, fights: 0 });
      w.fights++;
      w.shots += evs.length;
      for (const e of evs) if (e.hit) (w.hits++, (w.dmg += e.dmg));
    }
    add(
      chipTrig,
      b.parts.chip,
      r.specials.some((sp) => sp.by === side)
    );
    const oh = (overheatShare[b.parts.generator] ??= { hot: 0, ticks: 0 });
    const ze = (zeroEnergy[b.parts.generator] ??= { z: 0, ticks: 0 });
    for (let f = 0; f < frames; f++) {
      oh.ticks++;
      ze.ticks++;
      if (r.frames[f * 10 + side * 5 + 3]! >= 100) oh.hot++;
      if (r.frames[f * 10 + side * 5 + 4]! < 5) ze.z++;
    }
  }
};

const t0 = Date.now();
for (const arena of ARENAS) {
  const builds = Array.from({ length: N }, (_, i) => randomBuild(i));
  const pa = (perArena[arena.id] ??= {});
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const r = simulateBattle({ build: builds[i]! }, { build: builds[j]! }, arena, `${arena.id}:${i}:${j}`);
      fights++;
      lengths.push(r.ticks / 10);
      if (r.reason === 'time') timeouts++;
      if (r.ticks < 80)
        shortFights.push(`${arena.id} ${Object.values(builds[r.winner === 0 ? i : j]!.parts).join(',')}`);
      if (r.lastStands.length) {
        lastStandFights++;
        if (r.lastStands.some((l) => l.by === r.winner)) lastStandWins++;
      }
      scan(r, [builds[i]!, builds[j]!]);
      for (const [idx, won] of [
        [i, r.winner === 0],
        [j, r.winner === 1],
      ] as const)
        for (const id of Object.values(builds[idx]!.parts)) {
          add(overall, id, won);
          add(pa, id, won);
        }
    }
}
lengths.sort((a, b) => a - b);
const q = (p: number) => lengths[Math.floor(lengths.length * p)]!.toFixed(1);
console.log(`== A. ${fights} fights in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(
  `length p5 ${q(0.05)}s  p50 ${q(0.5)}s  p95 ${q(0.95)}s | timeouts ${pct(timeouts / fights)} | under 8s ${pct(shortFights.length / fights)}`
);
console.log(
  `last stand in ${pct(lastStandFights / fights)} of fights, stander wins ${pct(lastStandWins / Math.max(1, lastStandFights))}`
);
console.log('\nPart win rates (overall | worst arena | best arena):');
for (const s of SLOTS) {
  const rows = partsForSlot(s)
    .map((p) => {
      const o = overall[p.id];
      if (!o) return null;
      const ar = ARENAS.map((a) => ({
        a: a.id,
        r: perArena[a.id]![p.id] ? perArena[a.id]![p.id]!.w / perArena[a.id]![p.id]!.n : 0.5,
      }));
      ar.sort((x, y) => x.r - y.r);
      const r = o.w / o.n;
      const flag = r > 0.57 ? ' HIGH' : r < 0.43 ? ' LOW' : '';
      const arenaFlag = ar[0]!.r < 0.33 || ar[ar.length - 1]!.r > 0.67 ? ' ARENA-SWING' : '';
      return {
        r,
        line: `  ${p.name.padEnd(12)} ${pct(r).padStart(4)} | ${ar[0]!.a} ${pct(ar[0]!.r)} | ${ar[ar.length - 1]!.a} ${pct(ar[ar.length - 1]!.r)}${flag}${arenaFlag}`,
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.r - a.r);
  console.log(`${s}:`);
  for (const r of rows) console.log(r.line);
}
console.log('\nWeapons: fired-in-fight | hit rate | avg dmg/fight:');
for (const [id, w] of Object.entries(weaponHit).sort((a, b) => b[1].dmg / b[1].fights - a[1].dmg / a[1].fights)) {
  const fired = weaponFired[id]!;
  console.log(
    `  ${getPart(id).name.padEnd(12)} ${pct(fired.w / fired.n).padStart(4)} | ${pct(w.hits / Math.max(1, w.shots)).padStart(4)} | ${Math.round(w.dmg / w.fights)}${fired.w / fired.n < 0.8 ? '  <- often never fires' : ''}`
  );
}
console.log('\nChip special trigger rate:');
for (const [id, a] of Object.entries(chipTrig)) console.log(`  ${getPart(id).name.padEnd(12)} ${pct(a.w / a.n)}`);
console.log('\nGenerators: time overheated | time out of energy:');
for (const id of Object.keys(overheatShare))
  console.log(
    `  ${getPart(id).name.padEnd(12)} ${pct(overheatShare[id]!.hot / overheatShare[id]!.ticks)} | ${pct(zeroEnergy[id]!.z / zeroEnergy[id]!.ticks)}`
  );
if (shortFights.length) console.log(`\nsample sub-8s winners:\n  ${shortFights.slice(0, 5).join('\n  ')}`);

// ── B. meta search: can an optimizer find a build that dominates? ──
const pool = Array.from({ length: 90 }, (_, i) => randomBuild(1000 + i));
const evalArenas = [ARENAS[0]!, ARENAS[3]!, ARENAS[7]!];
const score = (b: Build, opp = pool, arenas = evalArenas) => {
  let w = 0;
  let n = 0;
  for (const a of arenas)
    for (let k = 0; k < opp.length; k++) {
      const side = k % 2;
      const r = side
        ? simulateBattle({ build: opp[k]! }, { build: b }, a, `m:${a.id}:${k}`)
        : simulateBattle({ build: b }, { build: opp[k]! }, a, `m:${a.id}:${k}`);
      n++;
      if (r.winner === (side ? 1 : 0)) w++;
    }
  return w / n;
};
const found: { b: Build; s: number }[] = [];
for (let restart = 0; restart < 6; restart++) {
  let cur = randomBuild(2000 + restart);
  let cs = score(cur);
  for (let step = 0; step < 36; step++) {
    const slot = rng.pick([...SLOTS]);
    const cand: Build = { ...cur, parts: { ...cur.parts, [slot]: rng.pick(partsForSlot(slot)).id } };
    if (!sane(cand)) continue;
    const s = score(cand);
    if (s > cs) ((cur = cand), (cs = s));
  }
  found.push({ b: cur, s: cs });
}
const fresh = Array.from({ length: 120 }, (_, i) => randomBuild(5000 + i));
console.log('\n== B. optimizer builds vs a fresh pool in all arenas (want < ~80%):');
for (const f of found.sort((a, b) => b.s - a.s)) {
  const v = score(f.b, fresh, ARENAS);
  console.log(`  ${pct(v)}  ${SLOTS.map((s) => getPart(f.b.parts[s]).name).join(' / ')}`);
}
console.log(JSON.stringify(found.map((f) => f.b.parts)));
