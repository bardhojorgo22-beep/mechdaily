// Renders hundreds of fights frame by frame with the real renderer and reports any crash.
import { ARENAS, arenaForDay, getArena } from '../../src/shared/game/arenas';
import { simulateBattle } from '../../src/shared/game/battle';
import { randomBuild, smartBuild, sparringForDay } from '../../src/shared/game/bots';
import type { Build } from '../../src/shared/game/mech';
import { createRng } from '../../src/shared/game/rng';
import { createRenderer, type MechSprites } from '../../src/client/lib/arenaRenderer';
import { findHighlights } from '../../src/client/lib/highlights';
import { MECH_LAYERS } from '../../src/client/components/mechLayers';
import { mechSprite } from '../../src/client/lib/sprite';

const white = (src: HTMLCanvasElement) => {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
};
const spritesFor = async (b: Build): Promise<MechSprites> => {
  const normal = await mechSprite(b, 42);
  const layers: MechSprites['layers'] = {};
  for (const l of MECH_LAYERS) layers[l] = await mechSprite(b, 42, l);
  return { normal, white: white(normal), layers };
};

const run = async () => {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('n') ?? 60);
  const rng = createRng(q.get('seed') ?? 'stress');
  const day = '2026-11-27';
  const today = getArena(arenaForDay(day).id);
  const bots = sparringForDay(day, today).map((s) => s.build);
  const errors: string[] = [];
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  for (let k = 0; k < n; k++) {
    const a = k % 3 === 0 ? randomBuild(rng, 'A') : smartBuild(rng, 'A');
    const b = k < 20 ? bots[k % 3]! : smartBuild(rng, 'B');
    const arena = k < 20 ? today : ARENAS[k % ARENAS.length]!;
    const result = simulateBattle({ build: a }, { build: b }, arena, `stress:${k}`);
    const sprites = { current: [await spritesFor(a), await spritesFor(b)] };
    const r = createRenderer(
      canvas,
      result,
      [a, b],
      arena,
      sprites,
      () => ['YOU', 'FOE'],
      () => 1,
      null,
      findHighlights(result)
    );
    if (!r) continue;
    try {
      for (let t = 0; t <= result.ticks + 20; t += 0.35) r.draw(Math.min(t, result.ticks), 0.035);
    } catch (e) {
      errors.push(
        `${e instanceof Error ? e.stack : String(e)}\nA=${JSON.stringify(a.parts)}\nB=${JSON.stringify(b.parts)}\narena=${arena.id} k=${k}`
      );
    }
  }
  (window as unknown as { STRESS: unknown }).STRESS = { done: true, errors };
};
void run();
