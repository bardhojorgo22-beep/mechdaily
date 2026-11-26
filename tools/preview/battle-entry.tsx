import '../../src/client/fonts';
import '../../src/client/index.css';
import { createRoot } from 'react-dom/client';
import { getArena } from '../../src/shared/game/arenas';
import { simulateBattle } from '../../src/shared/game/battle';
import { DEFAULT_BUILD, type Build } from '../../src/shared/game/mech';
import { BattleView } from '../../src/client/components/BattleView';

const q = new URLSearchParams(location.search);
const a: Build = {
  ...DEFAULT_BUILD,
  name: 'Railgun Rita',
  parts: {
    ...DEFAULT_BUILD.parts,
    weaponR: q.get('ar') ?? 'r-rail',
    weaponL: q.get('al') ?? 'lw-flamer',
    back: q.get('ab') ?? 'bk-howitzer',
    legs: 'l-tread',
    core: 'c-ox',
    generator: 'g-furnace',
    chip: q.get('ac') ?? 'p-turtle',
  },
  paint: { body: 1, trim: 5, decal: 2 },
};
const b: Build = {
  ...DEFAULT_BUILD,
  name: 'Blade Bob',
  parts: {
    ...DEFAULT_BUILD.parts,
    weaponR: q.get('br') ?? 'r-beam',
    weaponL: q.get('bl') ?? 'lw-saber',
    back: q.get('bb') ?? 'bk-swarm',
    legs: 'l-hopper',
    chip: q.get('bc') ?? 'p-rush',
    booster: 'b-jet',
    generator: 'g-coil',
  },
  paint: { body: 3, trim: 0, decal: 7 },
};
const arena = getArena(q.get('arena') ?? 'yard');
const result = simulateBattle({ build: a }, { build: b }, arena, q.get('seed') ?? 's1');
Reflect.set(window, 'R', result);
createRoot(document.getElementById('root')!).render(
  <div className="grid-paper min-h-screen p-3">
    <BattleView result={result} builds={[a, b]} labels={['test', 'test']} arena={arena} />
  </div>
);
