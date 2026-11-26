import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Arena } from '../../shared/game/arenas';
import { TICKS_PER_SECOND, type BattleResult } from '../../shared/game/battle';
import type { Build } from '../../shared/game/mech';
import {
  BOSS_SPRITE_W,
  RES_W,
  SPRITE_W,
  THEMES,
  createRenderer,
  frameAt,
  type MechSprites,
} from '../lib/arenaRenderer';
import { MECH_LAYERS } from './mechLayers';
import { isMuted, onMuteChange, setMuted, sfx } from '../lib/sfx';
import { mechSprite } from '../lib/sprite';
import { findHighlights, fightStats, type Highlight } from '../lib/highlights';
import { PixelMech } from './PixelMech';

const INTRO_MS = 2200;

type Props = {
  result: BattleResult;
  builds: [Build, Build];
  labels: [string, string];
  arena: Arena;
  tags?: [string, string];
  onDone?: () => void;
  /** Which side is a raid boss (drawn bigger). */
  bossSide?: 0 | 1 | null;
  /** Replaces the default "X wins" card when the fight ends. */
  footer?: ReactNode;
  /** Extra buttons on the end card (e.g. share). */
  actions?: ReactNode;
  /** Tutorial captions: shown from tick t for a few seconds. */
  tips?: Tip[] | undefined;
};

export type Tip = { t: number; text: string };

/** White silhouette of a sprite, for hit flashes. */
const whiteOf = (src: HTMLCanvasElement) => {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  if (g) {
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
};

const Reel = ({ result, side }: { result: BattleResult; side: 0 | 1 }) => {
  const st = fightStats(result, side);
  const cells = [
    ['BIGGEST HIT', `${st.biggestHit}`],
    ['DODGES', `${st.dodges}`],
    ['ACCURACY', `${Math.round(st.accuracy * 100)}%`],
    ['BEST COMBO', `x${st.bestCombo}`],
  ];
  return (
    <div className="grid grid-cols-4 gap-1 mt-3">
      {cells.map(([k, v]) => (
        <div key={k} className="border-2 border-ink bg-white py-1">
          <div className="font-display text-lg leading-none">{v}</div>
          <div className="text-[8px] font-semibold text-mute mt-0.5">{k}</div>
        </div>
      ))}
    </div>
  );
};

export const BattleView = ({
  result,
  builds,
  labels,
  arena,
  tags = ['YOU', 'FOE'],
  onDone,
  bossSide = null,
  footer,
  actions,
  tips,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [intro, setIntro] = useState<string | null>('3');
  const [muted, setMutedState] = useState(isMuted());
  const tickRef = useRef(0);
  const highlights = useMemo(() => findHighlights(result), [result]);
  const [callouts, setCallouts] = useState<(Highlight & { id: number })[]>([]);
  const calloutId = useRef(0);
  const speedRef = useRef(1);
  const tagsRef = useRef(tags);
  const sprites = useRef<MechSprites[]>([]);
  useEffect(() => {
    speedRef.current = speed;
    tagsRef.current = tags;
  }, [speed, tags]);
  useEffect(() => {
    const off = onMuteChange(setMutedState);
    return () => {
      off();
    };
  }, []);
  const done = tick >= result.ticks;
  const H = Math.round((RES_W * arena.height) / arena.width);

  useEffect(() => {
    Promise.all(
      builds.map(async (b, i) => {
        const w = i === bossSide ? BOSS_SPRITE_W : SPRITE_W;
        const normal = await mechSprite(b, w);
        const layers: MechSprites['layers'] = {};
        await Promise.all(
          MECH_LAYERS.map(async (name) => {
            layers[name] = await mechSprite(b, w, name);
          })
        );
        return { normal, white: whiteOf(normal), layers };
      })
    )
      .then((cs) => {
        sprites.current = cs;
      })
      .catch(() => undefined);
  }, [builds, bossSide]);

  // intro countdown
  useEffect(() => {
    const steps = ['3', '2', '1', 'FIGHT!'];
    const timers = steps.map((s, i) =>
      setTimeout(
        () => {
          setIntro(s);
          sfx.count(s === 'FIGHT!');
        },
        (i * INTRO_MS) / steps.length
      )
    );
    timers.push(setTimeout(() => setIntro(null), INTRO_MS + 250));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(
      canvas,
      result,
      builds,
      arena,
      sprites,
      () => tagsRef.current,
      () => speedRef.current,
      bossSide,
      highlights,
      (h) => {
        const id = ++calloutId.current;
        setCallouts((cs) => [...cs.slice(-2), { ...h, id }]);
        setTimeout(
          () => setCallouts((cs) => cs.filter((c) => c.id !== id)),
          h.tier === 3 ? 3200 : h.tier === 2 ? 1700 : 1200
        );
      }
    );
    if (!renderer) return;
    let raf = 0;
    let last = performance.now();
    let hold = 0; // hit-stop: sim time pauses, effects keep moving
    const started = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      hold = Math.max(hold - dt, 0);
      const playing = (now - started > INTRO_MS || tickRef.current > 0) && hold <= 0;
      const left = result.ticks - tickRef.current;
      const slow = (result.reason === 'ko' && left < 10 ? 0.3 : 1) * renderer.timeScale();
      if (playing && tickRef.current < result.ticks) {
        tickRef.current = Math.min(result.ticks, tickRef.current + dt * TICKS_PER_SECOND * speedRef.current * slow);
        setTick(tickRef.current);
      }
      const busy = renderer.draw(tickRef.current, dt);
      hold = Math.max(hold, renderer.takeFreeze() / Math.max(1, speedRef.current));
      if (tickRef.current < result.ticks || busy) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [result, builds, arena, bossSide, highlights]);

  const fr = frameAt(result, tick);
  const secs = Math.floor(tick / TICKS_PER_SECOND);
  const theme = THEMES[arena.id] ?? THEMES.yard!;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => {
          const m = fr[i]!;
          const pct = Math.max(0, m.hp / result.maxHp[i]!);
          return (
            <div
              key={i}
              className={`sticker p-2 flex gap-2 items-center ${i === 1 ? 'flex-row-reverse text-right' : ''}`}
            >
              <PixelMech build={builds[i]!} size={44} flip={i === 1} />
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm leading-none truncate">{builds[i]!.name}</div>
                <div className="text-[10px] text-mute truncate">{labels[i]}</div>
                <div
                  className="h-3 mt-1 border-2 border-ink bg-white overflow-hidden flex"
                  style={{
                    justifyContent: i === 1 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round(pct * 20) * 5}%`,
                      background: pct > 0.5 ? '#7cb518' : pct > 0.25 ? '#ffc914' : '#e4572e',
                    }}
                  />
                </div>
                <div
                  className="flex gap-1 mt-1 text-[9px] font-semibold"
                  style={{
                    justifyContent: i === 1 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span className={m.heat >= 100 ? 'text-rust blink' : ''}>HEAT {Math.min(999, m.heat)}</span>
                  <span>EN {m.energy}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative border-ink overflow-hidden" style={{ borderWidth: 3, borderStyle: 'solid' }}>
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${RES_W} / ${H}`,
          }}
        />
        <div className="absolute top-1 left-2 font-display text-xs" style={{ color: theme.text }}>
          {arena.name.toUpperCase()} · {secs}s
        </div>
        {intro && (
          <div key={intro} className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="font-display text-5xl stamp"
              style={{
                color: '#ffc914',
                textShadow: '3px 3px 0 #1b1a17, -2px -2px 0 #1b1a17',
              }}
            >
              {intro}
            </div>
          </div>
        )}
        {(() => {
          const tip = tips?.filter((x) => tick >= x.t && tick < x.t + 45).pop();
          return tip && !intro ? (
            <div key={tip.t} className="absolute inset-x-2 bottom-2 flex justify-center pointer-events-none pop">
              <div className="text-xs px-2 py-1 border-2 border-ink" style={{ background: '#fffbe6', maxWidth: 420 }}>
                💡 {tip.text}
              </div>
            </div>
          ) : null;
        })()}
        {callouts.map((c, k) => {
          const mine = tags[c.by] === 'YOU';
          const enemyOfYou = tags[c.by === 0 ? 1 : 0] === 'YOU';
          const color = mine ? '#ffc914' : enemyOfYou ? '#ff6b4a' : '#f8f4ec';
          const big = c.tier >= 2;
          return (
            <div
              key={c.id}
              className="absolute inset-x-0 flex flex-col items-center pointer-events-none"
              style={{ top: c.tier === 3 ? '30%' : `${12 + k * 18}%` }}
            >
              <div
                className="font-display stamp whitespace-nowrap"
                style={{
                  fontSize: c.tier === 3 ? 'min(11vw, 46px)' : big ? 'min(8vw, 32px)' : 'min(6vw, 22px)',
                  color,
                  transform: `rotate(${c.by === 0 ? -4 : 4}deg)`,
                  textShadow: '3px 3px 0 #1b1a17, -2px -2px 0 #1b1a17, 2px -2px 0 #1b1a17, -2px 2px 0 #1b1a17',
                  letterSpacing: '0.02em',
                }}
              >
                {c.text}
              </div>
              {(c.sub || big) && (
                <div className="font-display text-xs mt-1 px-2 py-0.5" style={{ background: '#1b1a17', color }}>
                  {c.sub ? `${c.sub} · ` : ''}
                  {tags[c.by] === 'YOU'
                    ? 'YOUR MECH'
                    : tags[c.by] === 'BOSS'
                      ? 'THE BOSS'
                      : builds[c.by]!.name.toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!done ? (
        <div className="flex gap-2">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={`btn flex-1 text-sm ${speed === s ? 'bg-ink text-paper' : 'bg-card'}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
          <button
            className="btn flex-1 text-sm bg-card"
            onClick={() => {
              tickRef.current = result.ticks;
              setTick(result.ticks);
              setIntro(null);
            }}
          >
            Skip
          </button>
          <button
            data-quiet
            className="btn text-sm bg-card"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => setMuted(!muted)}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      ) : footer ? (
        <div className="sticker p-3 text-center">
          {footer}
          <Reel result={result} side={0} />
          {actions}
          {onDone && (
            <button className="btn bg-sun mt-3 w-full" onClick={onDone}>
              Continue
            </button>
          )}
        </div>
      ) : (
        <div className="sticker p-3 text-center">
          <div
            className="font-display text-3xl leading-none stamp"
            style={{ color: result.winner === 0 ? '#2f7d1f' : '#c0392b' }}
          >
            {builds[result.winner].name} wins
          </div>
          <div className="text-xs mt-2 text-mute">
            {result.reason === 'ko' ? 'Knockout' : 'Time ran out — more HP left wins'} · {Math.round(result.ticks / 10)}
            s · damage {result.damage[0]} vs {result.damage[1]}
          </div>
          <Reel result={result} side={0} />
          {actions}
          {onDone && (
            <button className="btn bg-sun mt-3 w-full" onClick={onDone}>
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  );
};
