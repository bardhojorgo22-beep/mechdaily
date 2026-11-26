import { useEffect, useMemo, useRef, useState } from 'react';
import type { Arena } from '../../shared/game/arenas';
import {
  FRAME_EVERY,
  TICKS_PER_SECOND,
  type BattleResult,
  type ShotEvent,
} from '../../shared/game/battle';
import type { Build } from '../../shared/game/mech';
import { createRng } from '../../shared/game/rng';
import { isMuted, onMuteChange, setMuted, sfx } from '../lib/sfx';
import { mechSprite } from '../lib/sprite';
import { PixelMech } from './PixelMech';

// The arena is drawn at a low internal resolution and scaled up with
// nearest-neighbour, so everything comes out properly pixelated.
const RES_W = 240;
const SPRITE_W = 30;
const INTRO_MS = 2200;

const FLOOR: Record<string, { floor: string; speck: string; text: string }> = {
  yard: { floor: '#cfc4ae', speck: '#b9ad95', text: '#1b1a17' },
  fog: { floor: '#c3c7c2', speck: '#adb2ac', text: '#1b1a17' },
  mud: { floor: '#7d6447', speck: '#6a533a', text: '#f4ead8' },
  heat: { floor: '#e2a466', speck: '#cf8a4c', text: '#1b1a17' },
  storm: { floor: '#3f4360', speck: '#4f5577', text: '#efe8da' },
  moon: { floor: '#24262c', speck: '#383b44', text: '#efe8da' },
  alley: { floor: '#aaa294', speck: '#958d7f', text: '#1b1a17' },
  plains: { floor: '#e6e0cf', speck: '#d6cfba', text: '#1b1a17' },
  scrap: { floor: '#9a9384', speck: '#857e70', text: '#1b1a17' },
};

const SHOT: Record<ShotEvent['type'], string> = {
  kinetic: '#ffd23f',
  energy: '#3cf0ec',
  explosive: '#ff7a2f',
  melee: '#ffffff',
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
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
  return [0, 1].map((m) => ({
    x: lerp(m * 5),
    y: lerp(m * 5 + 1),
    hp: get(i0, m * 5 + 2),
    heat: get(i0, m * 5 + 3),
    energy: get(i0, m * 5 + 4),
    moving:
      Math.abs(get(i1, m * 5) - get(i0, m * 5)) +
        Math.abs(get(i1, m * 5 + 1) - get(i0, m * 5 + 1)) >
      0.5,
  }));
};

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

export const BattleView = ({
  result,
  builds,
  labels,
  arena,
  tags = ['YOU', 'FOE'],
  onDone,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [intro, setIntro] = useState<string | null>('3');
  const [muted, setMutedState] = useState(isMuted());
  const tickRef = useRef(0);
  const speedRef = useRef(1);
  const tagsRef = useRef(tags);
  const sprites = useRef<
    { normal: HTMLCanvasElement; white: HTMLCanvasElement }[]
  >([]);
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

  useEffect(() => {
    Promise.all(builds.map((b) => mechSprite(b, SPRITE_W)))
      .then((cs) => {
        sprites.current = cs.map((c) => ({ normal: c, white: whiteOf(c) }));
      })
      .catch(() => undefined);
  }, [builds]);

  const H = Math.round((RES_W * arena.height) / arena.width);
  const debris = useMemo(() => {
    const rng = createRng(`debris:${result.ticks}:${result.damage.join(',')}`);
    return result.hazardHits.map((t) => ({
      t,
      x: rng.next() * RES_W,
      y: rng.next() * H,
    }));
  }, [result, H]);

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
    canvas.width = RES_W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    const sc = RES_W / arena.width;
    const theme = FLOOR[arena.id] ?? FLOOR.yard!;
    const rng = createRng('fx');
    const particles: Particle[] = [];
    const flashUntil = [0, 0];
    const muzzleUntil = [0, 0];
    const heatWarned = [false, false];
    let shake = 0;
    let nextEvent = 0;
    let koPlayed = false;
    let raf = 0;
    let last = performance.now();
    const started = performance.now();

    const floorRng = createRng(`floor:${arena.id}`);
    const specks = Array.from({ length: 90 }, () => ({
      x: Math.floor(floorRng.next() * RES_W),
      y: Math.floor(floorRng.next() * H),
      s: floorRng.chance(0.2) ? 2 : 1,
    }));

    const burst = (
      x: number,
      y: number,
      n: number,
      color: string,
      spd: number,
      life: number,
      size = 1
    ) => {
      for (let i = 0; i < n; i++) {
        const a = rng.next() * 6.283;
        const v = spd * (0.4 + rng.next());
        particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life,
          max: life,
          color,
          size,
        });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const playing = now - started > INTRO_MS || tickRef.current > 0;
      const ticksLeft = result.ticks - tickRef.current;
      const slow = result.reason === 'ko' && ticksLeft < 10 ? 0.3 : 1;
      if (playing && tickRef.current < result.ticks) {
        tickRef.current = Math.min(
          result.ticks,
          tickRef.current + dt * TICKS_PER_SECOND * speedRef.current * slow
        );
        setTick(tickRef.current);
      }
      const t = tickRef.current;
      const fr = frameAt(result, t);
      const pos = fr.map((m) => ({ x: m.x * sc, y: m.y * sc }));
      const skipping = speedRef.current > 2;

      // fire events we just passed
      while (
        nextEvent < result.events.length &&
        result.events[nextEvent]!.t <= t
      ) {
        const ev = result.events[nextEvent++]!;
        if (t - ev.t > 20) continue; // skipped ahead: don't replay a wall of sound
        const from = pos[ev.by]!;
        const to = pos[1 - ev.by]!;
        muzzleUntil[ev.by] = t + 1;
        if (!skipping || ev.dmg > 140) sfx.shoot(ev.type, ev.by);
        if (ev.hit) {
          flashUntil[1 - ev.by] = t + 1.2;
          const big = ev.dmg > 140;
          burst(
            to.x,
            to.y,
            big ? 14 : 5,
            SHOT[ev.type],
            big ? 40 : 25,
            big ? 0.6 : 0.3
          );
          if (ev.type === 'explosive')
            burst(to.x, to.y, 8, '#5b5148', 12, 0.9, 2);
          if (ev.blocked) sfx.block();
          else sfx.hit(big);
          if (big) shake = Math.max(shake, 3);
        } else {
          burst(to.x + (to.x - from.x) * 0.1, to.y + 4, 2, '#8a8170', 10, 0.25);
        }
      }
      fr.forEach((m, i) => {
        if (m.heat >= 100 && !heatWarned[i]) {
          heatWarned[i] = true;
          sfx.overheat();
        }
        if (m.heat < 60) heatWarned[i] = false;
      });
      if (t >= result.ticks && !koPlayed) {
        koPlayed = true;
        const loser = pos[1 - result.winner]!;
        if (result.reason === 'ko') {
          sfx.ko();
          shake = 6;
          burst(loser.x, loser.y, 30, '#ff7a2f', 55, 1.1, 2);
          burst(loser.x, loser.y, 20, '#1b1a17', 30, 1.4, 2);
        }
        setTimeout(
          () =>
            result.winner === 0 || tagsRef.current[0] !== 'YOU'
              ? sfx.win()
              : sfx.lose(),
          600
        );
      }

      // ── draw ──
      g.save();
      if (shake > 0.2) {
        g.translate(
          Math.round((rng.next() - 0.5) * shake * 2),
          Math.round((rng.next() - 0.5) * shake * 2)
        );
        shake *= 0.86;
      }
      g.fillStyle = theme.floor;
      g.fillRect(-8, -8, RES_W + 16, H + 16);
      g.fillStyle = theme.speck;
      for (const s of specks) g.fillRect(s.x, s.y, s.s, s.s);

      for (const d of debris) {
        if (d.t > t + 8 || d.t < t - 4) continue;
        if (d.t > t) {
          g.fillStyle = 'rgba(27,26,23,0.25)';
          g.fillRect(Math.round(d.x) - 3, Math.round(d.y) - 1, 6, 3);
        } else {
          g.fillStyle = '#4a453d';
          g.fillRect(Math.round(d.x) - 2, Math.round(d.y) - 2, 4, 4);
        }
      }

      // tracers
      for (let i = nextEvent - 1; i >= 0; i--) {
        const ev = result.events[i]!;
        if (ev.t < t - 2) break;
        if (ev.type === 'melee') continue;
        const from = pos[ev.by]!;
        const to = pos[1 - ev.by]!;
        const miss = ev.hit ? 0 : ev.t % 2 === 0 ? 7 : -7;
        g.strokeStyle = SHOT[ev.type];
        g.lineWidth = ev.type === 'explosive' ? 2 : 1;
        g.globalAlpha = Math.max(0, 1 - (t - ev.t) / 2);
        g.beginPath();
        g.moveTo(Math.round(from.x), Math.round(from.y - 3));
        g.lineTo(Math.round(to.x + miss), Math.round(to.y - 3 - miss / 2));
        g.stroke();
        g.globalAlpha = 1;
      }

      // mechs, lower one drawn last for depth
      const order = pos[0]!.y < pos[1]!.y ? [0, 1] : [1, 0];
      const spriteH = Math.round((SPRITE_W * 220) / 200);
      for (const i of order) {
        const m = fr[i]!;
        const p = pos[i]!;
        const other = pos[1 - i]!;
        const bobY = m.moving && Math.floor(t / 1.5) % 2 === 0 ? -1 : 0;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        g.fillStyle = 'rgba(27,26,23,0.3)';
        g.fillRect(x - 8, y + spriteH / 2 - 2, 16, 3);
        const sp = sprites.current[i];
        g.save();
        g.translate(x, y + bobY);
        if (other.x < p.x) g.scale(-1, 1);
        if (m.hp <= 0) g.globalAlpha = 0.4;
        if (sp)
          g.drawImage(
            t < flashUntil[i]! ? sp.white : sp.normal,
            -SPRITE_W / 2,
            -spriteH / 2
          );
        else {
          g.fillStyle = '#888';
          g.fillRect(-6, -8, 12, 16);
        }
        g.restore();
        if (t < muzzleUntil[i]!) {
          const dir = other.x < p.x ? -1 : 1;
          g.fillStyle = '#fff6c2';
          g.fillRect(x + dir * 10 - 1, y, 3, 3);
        }
        if (m.heat >= 100 && Math.floor(t) % 2 === 0) {
          g.fillStyle = '#e4572e';
          g.fillRect(x - 1, y - spriteH / 2 - 13, 3, 3);
        }
        const tag = tagsRef.current[i]!;
        g.font = '8px Silkscreen, monospace';
        const tw = Math.ceil(g.measureText(tag).width) + 4;
        g.fillStyle = i === 0 ? '#ffc914' : '#f8f4ec';
        g.fillRect(x - Math.ceil(tw / 2), y - spriteH / 2 - 9, tw, 8);
        g.fillStyle = '#1b1a17';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(tag, x, y - spriteH / 2 - 9);
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        g.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
        g.fillStyle = p.color;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      g.globalAlpha = 1;

      // damage numbers
      g.font = '8px Silkscreen, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (let i = nextEvent - 1; i >= 0; i--) {
        const ev = result.events[i]!;
        if (ev.t < t - 8) break;
        if (!ev.hit || ev.dmg < 20) continue;
        const to = pos[1 - ev.by]!;
        const a = (t - ev.t) / 8;
        const jx =
          (((ev.t * 7 +
            (ev.slot === 'back' ? 3 : ev.slot === 'weaponL' ? 1 : 0)) %
            5) -
            2) *
          7;
        const yy = Math.round(to.y - spriteH / 2 - 20 - a * 10);
        g.globalAlpha = Math.max(0, 1 - a);
        g.fillStyle = '#1b1a17';
        g.fillText(`${ev.dmg}`, Math.round(to.x + jx) + 1, yy + 1);
        g.fillStyle = ev.blocked
          ? '#3cf0ec'
          : ev.dmg > 140
            ? '#ffc914'
            : '#ffffff';
        g.fillText(`${ev.dmg}`, Math.round(to.x + jx), yy);
      }
      g.globalAlpha = 1;

      if (arena.fog) {
        g.fillStyle = 'rgba(230,232,228,0.28)';
        g.fillRect(0, 0, RES_W, H);
      }
      if (arena.id === 'storm' && Math.floor(t) % 47 === 0 && t > 0) {
        g.fillStyle = 'rgba(200,220,255,0.25)';
        g.fillRect(0, 0, RES_W, H);
      }
      g.restore();

      if (tickRef.current < result.ticks || particles.length > 0 || shake > 0.2)
        raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [result, arena, H, debris]);

  const fr = frameAt(result, tick);
  const secs = Math.floor(tick / TICKS_PER_SECOND);

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
                <div className="font-display text-sm leading-none truncate">
                  {builds[i]!.name}
                </div>
                <div className="text-[10px] text-mute truncate">
                  {labels[i]}
                </div>
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
                      background:
                        pct > 0.5
                          ? '#7cb518'
                          : pct > 0.25
                            ? '#ffc914'
                            : '#e4572e',
                    }}
                  />
                </div>
                <div
                  className="flex gap-1 mt-1 text-[9px] font-semibold"
                  style={{
                    justifyContent: i === 1 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span className={m.heat >= 100 ? 'text-rust blink' : ''}>
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
        className="relative border-ink overflow-hidden"
        style={{ borderWidth: 3, borderStyle: 'solid' }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${RES_W} / ${H}`,
          }}
        />
        <div
          className="absolute top-1 left-2 font-display text-xs"
          style={{ color: (FLOOR[arena.id] ?? FLOOR.yard!).text }}
        >
          {arena.name.toUpperCase()} · {secs}s
        </div>
        {intro && (
          <div
            key={intro}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
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
      </div>

      {!done ? (
        <div className="flex gap-2">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={`btn flex-1 text-sm ${speed === s ? 'bg-ink text-paper' : 'bg-card'}`}
              onClick={() => {
                sfx.click();
                setSpeed(s);
              }}
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
            className="btn text-sm bg-card"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => setMuted(!muted)}
          >
            {muted ? '🔇' : '🔊'}
          </button>
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
            {result.reason === 'ko'
              ? 'Knockout'
              : 'Time ran out — more HP left wins'}{' '}
            · {Math.round(result.ticks / 10)}s · damage {result.damage[0]} vs{' '}
            {result.damage[1]}
          </div>
          {onDone && (
            <button
              className="btn bg-sun mt-3 w-full"
              onClick={() => {
                sfx.click();
                onDone();
              }}
            >
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  );
};
