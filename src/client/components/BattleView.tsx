import { useEffect, useMemo, useRef, useState } from 'react';
import type { Arena } from '../../shared/game/arenas';
import {
  FRAME_EVERY,
  TICKS_PER_SECOND,
  type BattleResult,
  type ShotEvent,
} from '../../shared/game/battle';
import { BODY_COLORS, type Build } from '../../shared/game/mech';
import { createRng } from '../../shared/game/rng';
import { MechArt } from './MechArt';

const FLOOR: Record<string, { floor: string; line: string }> = {
  yard: { floor: '#d8cfbd', line: 'rgba(27,26,23,0.10)' },
  fog: { floor: '#c9ccc8', line: 'rgba(27,26,23,0.08)' },
  mud: { floor: '#8f7656', line: 'rgba(27,26,23,0.15)' },
  heat: { floor: '#e8b07a', line: 'rgba(120,40,0,0.15)' },
  storm: { floor: '#4b4f6b', line: 'rgba(200,220,255,0.12)' },
  moon: { floor: '#2b2d33', line: 'rgba(255,255,255,0.08)' },
  alley: { floor: '#b9b2a4', line: 'rgba(27,26,23,0.14)' },
  plains: { floor: '#ebe6d8', line: 'rgba(27,26,23,0.06)' },
  scrap: { floor: '#a59e90', line: 'rgba(27,26,23,0.12)' },
};

const SHOT_COLOR: Record<ShotEvent['type'], string> = {
  kinetic: '#ffd23f',
  energy: '#3cf0ec',
  explosive: '#ff7a2f',
  melee: '#ffffff',
};

type Props = {
  result: BattleResult;
  builds: [Build, Build];
  labels: [string, string];
  arena: Arena;
  tags?: [string, string];
  onDone?: () => void;
};

const frameAt = (r: BattleResult, tick: number) => {
  const n = r.frames.length / 10;
  const f = Math.min(n - 1, Math.max(0, tick / FRAME_EVERY));
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const k = f - i0;
  const get = (i: number, j: number) => r.frames[i * 10 + j]!;
  const lerp = (j: number) => get(i0, j) + (get(i1, j) - get(i0, j)) * k;
  return {
    m: [0, 1].map((m) => ({
      x: lerp(m * 5),
      y: lerp(m * 5 + 1),
      hp: get(i0, m * 5 + 2),
      heat: get(i0, m * 5 + 3),
      energy: get(i0, m * 5 + 4),
    })),
  };
};

export const BattleView = ({
  result,
  builds,
  labels,
  arena,
  tags = ['YOU', 'FOE'],
  onDone,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portraitRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const sprites = useRef<(HTMLImageElement | null)[]>([null, null]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);
  const speedRef = useRef(1);
  const tagsRef = useRef(tags);
  useEffect(() => {
    speedRef.current = speed;
    tagsRef.current = tags;
  }, [speed, tags]);
  const done = tick >= result.ticks;

  // debris positions for scrap rain, deterministic per battle
  const debris = useMemo(() => {
    const rng = createRng(`debris:${result.ticks}:${result.damage.join(',')}`);
    return result.hazardHits.map((t) => ({ t, x: rng.next(), y: rng.next() }));
  }, [result]);

  // Reuse the portrait SVGs as arena sprites.
  useEffect(() => {
    portraitRefs.forEach((ref, i) => {
      const svg = ref.current?.querySelector('svg');
      if (!svg) return;
      const clone = svg.cloneNode(true);
      if (!(clone instanceof SVGSVGElement)) return;
      clone.removeAttribute('style');
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const img = new Image();
      img.onload = () => {
        sprites.current[i] = img;
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tickRef.current = Math.min(
        result.ticks,
        tickRef.current + dt * TICKS_PER_SECOND * speedRef.current
      );
      setTick(tickRef.current);
      draw();
      if (tickRef.current < result.ticks) raf = requestAnimationFrame(loop);
    };
    const draw = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth;
      const cssH = Math.round((cssW * arena.height) / arena.width);
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const sc = (cssW / arena.width) * dpr;
      const t = tickRef.current;
      const theme = FLOOR[arena.id] ?? FLOOR.yard!;
      ctx.fillStyle = theme.floor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= arena.width; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(gx * sc, 0);
        ctx.lineTo(gx * sc, canvas.height);
        ctx.stroke();
      }
      for (let gy = 0; gy <= arena.height; gy += 50) {
        ctx.beginPath();
        ctx.moveTo(0, gy * sc);
        ctx.lineTo(canvas.width, gy * sc);
        ctx.stroke();
      }

      const fr = frameAt(result, t);
      const pos = fr.m.map((m) => ({ x: m.x * sc, y: m.y * sc }));
      const r = Math.max(9, 16 * sc * (arena.width > 1200 ? 1.4 : 1));

      // shots in the last few ticks
      for (const ev of result.events) {
        if (ev.t > t || ev.t < t - 3) continue;
        const from = pos[ev.by]!;
        const to = pos[1 - ev.by]!;
        const age = (t - ev.t) / 3;
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = SHOT_COLOR[ev.type];
        ctx.lineWidth =
          (ev.type === 'explosive' ? 4 : ev.type === 'energy' ? 3 : 2) * dpr;
        const off = ev.hit ? 0 : (ev.t % 2 === 0 ? 1 : -1) * r * 2.2;
        if (ev.type === 'melee') {
          ctx.beginPath();
          ctx.arc(to.x, to.y, r * 1.5, -0.8 + age, 0.8 + age);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x + off, to.y - off * 0.5);
          ctx.stroke();
        }
        if (ev.hit && (ev.type === 'explosive' || ev.dmg > 150)) {
          ctx.fillStyle = SHOT_COLOR[ev.type];
          ctx.beginPath();
          ctx.arc(to.x, to.y, r * (1 + age * 1.5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // falling scrap
      for (const d of debris) {
        if (d.t > t || d.t < t - 6) continue;
        const a = (t - d.t) / 6;
        ctx.fillStyle = `rgba(27,26,23,${0.7 - a * 0.7})`;
        ctx.fillRect(
          d.x * canvas.width - 6 * dpr,
          d.y * canvas.height - 6 * dpr,
          12 * dpr,
          12 * dpr
        );
      }

      // mechs
      const spriteH =
        Math.max(44, Math.min(70, canvas.height / dpr / 4.2)) * dpr;
      const spriteW = (spriteH * 200) / 220;
      fr.m.forEach((m, i) => {
        const p = pos[i]!;
        const other = pos[1 - i]!;
        const b = builds[i]!;
        ctx.fillStyle = 'rgba(27,26,23,0.22)';
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y + spriteH * 0.42,
          spriteW * 0.36,
          spriteH * 0.07,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        const img = sprites.current[i];
        const facingLeft = other.x < p.x;
        ctx.save();
        if (m.hp <= 0) ctx.globalAlpha = 0.35;
        ctx.translate(p.x, p.y);
        if (facingLeft) ctx.scale(-1, 1);
        if (img) {
          ctx.drawImage(img, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
        } else {
          ctx.fillStyle = BODY_COLORS[b.paint.body] ?? '#ccc';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (m.heat >= 100) {
          ctx.fillStyle = 'rgba(228,87,46,0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, spriteW * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = i === 0 ? '#ffc914' : '#f8f4ec';
        ctx.strokeStyle = '#1b1a17';
        ctx.lineWidth = 2 * dpr;
        ctx.font = `700 ${10 * dpr}px "IBM Plex Mono", monospace`;
        ctx.textAlign = 'center';
        const tag = tagsRef.current[i]!;
        const tw = ctx.measureText(tag).width + 8 * dpr;
        ctx.fillRect(p.x - tw / 2, p.y - spriteH / 2 - 16 * dpr, tw, 14 * dpr);
        ctx.strokeRect(
          p.x - tw / 2,
          p.y - spriteH / 2 - 16 * dpr,
          tw,
          14 * dpr
        );
        ctx.fillStyle = '#1b1a17';
        ctx.fillText(tag, p.x, p.y - spriteH / 2 - 5 * dpr);
      });

      // floating damage numbers
      ctx.font = `900 ${15 * dpr}px "Big Shoulders Display", sans-serif`;
      for (const ev of result.events) {
        if (!ev.hit || ev.t > t || ev.t < t - 8 || ev.dmg < 15) continue;
        const to = pos[1 - ev.by]!;
        const a = (t - ev.t) / 8;
        ctx.globalAlpha = 1 - a;
        ctx.fillStyle = ev.blocked ? '#3cf0ec' : '#1b1a17';
        const jx =
          (((ev.t * 7 +
            (ev.slot === 'back' ? 3 : ev.slot === 'weaponL' ? 1 : 0)) %
            5) -
            2) *
          14 *
          dpr;
        ctx.fillText(`${ev.dmg}`, to.x + jx, to.y - 34 * dpr - a * 26 * dpr);
        ctx.globalAlpha = 1;
      }

      if (arena.fog) {
        ctx.fillStyle = 'rgba(230,232,228,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [result, builds, arena, debris]);

  const fr = frameAt(result, tick);
  const secs = Math.floor(tick / TICKS_PER_SECOND);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => {
          const m = fr.m[i]!;
          const pct = Math.max(0, m.hp / result.maxHp[i]!);
          return (
            <div
              key={i}
              className={`sticker p-2 flex gap-2 items-center ${i === 1 ? 'flex-row-reverse text-right' : ''}`}
            >
              <div ref={portraitRefs[i]}>
                <MechArt build={builds[i]!} size={44} flip={i === 1} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-black text-lg leading-none truncate">
                  {builds[i]!.name}
                </div>
                <div className="text-[10px] text-mute truncate">
                  {labels[i]}
                </div>
                <div className="h-3 mt-1 border-2 border-ink rounded bg-white overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{
                      width: `${pct * 100}%`,
                      background:
                        pct > 0.5
                          ? '#7cb518'
                          : pct > 0.25
                            ? '#ffc914'
                            : '#e4572e',
                      marginLeft: i === 1 ? 'auto' : undefined,
                    }}
                  />
                </div>
                <div
                  className="flex gap-1 mt-1 text-[9px] font-semibold"
                  style={{
                    justifyContent: i === 1 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span className={m.heat >= 100 ? 'text-rust' : ''}>
                    HEAT {Math.min(999, m.heat)}
                  </span>
                  <span>EN {m.energy}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        ref={wrapRef}
        className="relative border-3 border-ink rounded-lg overflow-hidden"
        style={{ borderWidth: 3 }}
      >
        <canvas ref={canvasRef} className="block w-full" />
        <div
          className="absolute top-1 left-2 font-display font-black text-sm"
          style={{
            color:
              arena.id === 'moon' || arena.id === 'storm'
                ? '#efe8da'
                : '#1b1a17',
          }}
        >
          {arena.name.toUpperCase()} · {secs}s
        </div>
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
            }}
          >
            Skip
          </button>
        </div>
      ) : (
        <div className="sticker p-3 text-center">
          <div
            className="font-display font-black text-4xl leading-none"
            style={{ color: result.winner === 0 ? '#2f7d1f' : '#c0392b' }}
          >
            {result.winner === 0
              ? `${builds[0].name} wins`
              : `${builds[1].name} wins`}
          </div>
          <div className="text-xs mt-1 text-mute">
            {result.reason === 'ko'
              ? 'Knockout'
              : 'Time ran out — more HP left wins'}{' '}
            · {Math.round(result.ticks / 10)}s · damage {result.damage[0]} vs{' '}
            {result.damage[1]}
          </div>
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
