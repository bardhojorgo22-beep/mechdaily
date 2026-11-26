import './fonts';
import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import { getArena } from '../shared/game/arenas';
import { DEFAULT_BUILD } from '../shared/game/mech';
import { PixelMech } from './components/PixelMech';
import { api, countdown } from './lib/api';

export const Splash = () => {
  const [data, setData] = useState<InitResponse | null>(null);
  useEffect(() => {
    api
      .init()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const old = data ? data.postDay !== data.day : false;
  const arena = getArena(data?.arenaId ?? 'yard');
  const hero = data?.myEntry ?? data?.myBuild ?? data?.champions[0]?.build ?? DEFAULT_BUILD;

  return (
    <div className="grid-paper min-h-screen flex flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="font-display font-black text-4xl leading-[0.85] tracking-tight">MECH DAILY</div>
      {data && (
        <div className="text-xs">
          Day {old ? data.postDayNumber : data.dayNumber} ·{' '}
          {old ? 'results are in' : `${arena.name} · bracket in ${countdown(data.nextRolloverIso)}`}
        </div>
      )}
      <PixelMech build={hero} size={120} bob />
      {data && !old && (
        <div className="text-[11px] text-mute">
          {data.entryCount} pilot{data.entryCount === 1 ? '' : 's'} entered
          {data.champions[0] ? ` · last champ: ${data.champions[0].name}` : ''}
        </div>
      )}
      <button
        className="btn bg-rust text-white text-xl px-8"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {old ? 'See results' : data?.myEntry ? 'Tune your mech' : 'Build your mech'}
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
