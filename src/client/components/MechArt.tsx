import type { ReactNode } from 'react';
import type { MechLayer } from './mechLayers';
import { BODY_COLORS, DECALS, TRIM_COLORS, type Build } from '../../shared/game/mech';

// Chunky "sticker" style: flat fills, thick ink outlines, no gradients.
const INK = '#1b1a17';
const SW = 3;

type Ctx = { body: string; trim: string; dark: string };

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

const s = {
  stroke: INK,
  strokeWidth: SW,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

const LEGS: Record<string, (c: Ctx) => ReactNode> = {
  'l-strider': (c) => (
    <g {...s}>
      <rect x={70} y={140} width={22} height={34} rx={4} fill={c.body} />
      <rect x={108} y={140} width={22} height={34} rx={4} fill={c.body} />
      <rect x={68} y={172} width={26} height={30} rx={4} fill={c.dark} />
      <rect x={106} y={172} width={26} height={30} rx={4} fill={c.dark} />
      <rect x={62} y={200} width={36} height={10} rx={3} fill={c.trim} />
      <rect x={102} y={200} width={36} height={10} rx={3} fill={c.trim} />
    </g>
  ),
  'l-hopper': (c) => (
    <g {...s}>
      <path d="M74 140 L62 168 L82 196 L74 208 L96 208 L96 196 L80 168 L90 140 Z" fill={c.body} />
      <path d="M126 140 L138 168 L118 196 L126 208 L104 208 L104 196 L120 168 L110 140 Z" fill={c.body} />
      <circle cx={66} cy={168} r={6} fill={c.trim} />
      <circle cx={134} cy={168} r={6} fill={c.trim} />
    </g>
  ),
  'l-crab': (c) => (
    <g {...s}>
      <path d="M70 146 L36 170 L30 208 L44 208 L48 178 L76 160 Z" fill={c.dark} />
      <path d="M130 146 L164 170 L170 208 L156 208 L152 178 L124 160 Z" fill={c.dark} />
      <path d="M80 150 L68 208 L84 208 L92 156 Z" fill={c.body} />
      <path d="M120 150 L132 208 L116 208 L108 156 Z" fill={c.body} />
      <rect x={66} y={136} width={68} height={18} rx={6} fill={c.trim} />
    </g>
  ),
  'l-tread': (c) => (
    <g {...s}>
      <rect x={56} y={140} width={88} height={22} rx={4} fill={c.body} />
      <rect x={40} y={164} width={120} height={46} rx={22} fill={c.dark} />
      {[62, 84, 106, 128].map((x) => (
        <circle key={x} cx={x + 5} cy={187} r={9} fill={c.trim} />
      ))}
    </g>
  ),
  'l-skate': (c) => (
    <g {...s}>
      <path d="M78 140 L122 140 L146 180 L54 180 Z" fill={c.body} />
      <rect x={50} y={178} width={100} height={12} rx={6} fill={c.trim} />
      <path d="M62 198 L138 198 M72 206 L128 206" stroke={c.trim} strokeWidth={4} opacity={0.8} />
    </g>
  ),
};

const CORES: Record<string, (c: Ctx) => ReactNode> = {
  'c-shell': (c) => <rect x={72} y={86} width={56} height={56} rx={14} fill={c.body} {...s} />,
  'c-vault': (c) => (
    <g {...s}>
      <rect x={62} y={80} width={76} height={66} rx={6} fill={c.body} />
      <rect x={70} y={88} width={60} height={50} rx={3} fill="none" />
    </g>
  ),
  'c-prism': (c) => <path d="M100 78 L134 96 L134 130 L100 148 L66 130 L66 96 Z" fill={c.body} {...s} />,
  'c-radiator': (c) => (
    <g {...s}>
      <rect x={68} y={84} width={64} height={60} rx={8} fill={c.body} />
      {[80, 92, 104, 116].map((x) => (
        <line key={x} x1={x} y1={94} x2={x} y2={134} />
      ))}
    </g>
  ),
  'c-ox': (c) => (
    <g {...s}>
      <path d="M56 90 L144 90 L136 146 L64 146 Z" fill={c.body} />
      <rect x={84} y={82} width={32} height={12} rx={3} fill={c.trim} />
    </g>
  ),
};

const HEADS: Record<string, (c: Ctx) => ReactNode> = {
  'h-lantern': (c) => (
    <g {...s}>
      <rect x={86} y={56} width={28} height={26} rx={5} fill={c.body} />
      <circle cx={100} cy={69} r={7} fill={c.trim} />
    </g>
  ),
  'h-owl': (c) => (
    <g {...s}>
      <rect x={80} y={54} width={40} height={28} rx={12} fill={c.body} />
      <circle cx={91} cy={68} r={7} fill={c.trim} />
      <circle cx={109} cy={68} r={7} fill={c.trim} />
    </g>
  ),
  'h-bucket': (c) => (
    <g {...s}>
      <path d="M82 52 L118 52 L114 84 L86 84 Z" fill={c.body} />
      <rect x={88} y={64} width={24} height={6} rx={2} fill={c.trim} />
    </g>
  ),
  'h-needle': (c) => (
    <g {...s}>
      <line x1={100} y1={30} x2={100} y2={50} />
      <circle cx={100} cy={30} r={3} fill={c.trim} />
      <path d="M92 50 L108 50 L104 84 L96 84 Z" fill={c.body} />
      <rect x={95} y={60} width={10} height={4} fill={c.trim} />
    </g>
  ),
  'h-crown': (c) => (
    <g {...s}>
      <path d="M82 60 L88 48 L94 58 L100 46 L106 58 L112 48 L118 60 L118 84 L82 84 Z" fill={c.body} />
      <rect x={88} y={66} width={24} height={7} rx={3} fill={c.trim} />
    </g>
  ),
};

const ARMS: Record<string, { w: number; joint?: boolean }> = {
  'a-wire': { w: 9 },
  'a-brace': { w: 15 },
  'a-ram': { w: 21 },
  'a-gimbal': { w: 12, joint: true },
};

const arm = (id: string, side: -1 | 1, c: Ctx) => {
  const a = ARMS[id] ?? { w: 14 };
  const x = side < 0 ? 58 - a.w : 142;
  return (
    <g {...s}>
      <rect x={x} y={90} width={a.w} height={44} rx={a.w / 2} fill={c.body} />
      {a.joint && <circle cx={x + a.w / 2} cy={112} r={8} fill={c.trim} />}
      <rect x={x - 2} y={128} width={a.w + 4} height={12} rx={4} fill={c.dark} />
    </g>
  );
};

// hand x is the arm's outer edge; weapons hang down from y≈134
const HAND_WEAPONS: Record<string, (x: number, c: Ctx) => ReactNode> = {
  'r-rifle': (x, c) => (
    <g {...s}>
      <rect x={x - 6} y={130} width={12} height={22} rx={2} fill={c.dark} />
      <rect x={x - 3} y={150} width={6} height={36} fill={INK} />
    </g>
  ),
  'r-bow': (x, c) => (
    <g {...s}>
      <rect x={x - 6} y={128} width={12} height={16} rx={3} fill={c.dark} />
      <path d={`M${x - 4} 138 Q${x - 26} 172 ${x - 4} 206`} fill="none" strokeWidth={5} />
      <path d={`M${x - 4} 138 Q${x - 26} 172 ${x - 4} 206`} fill="none" stroke={c.trim} strokeWidth={2} />
      <line x1={x - 4} y1={138} x2={x - 4} y2={206} strokeWidth={1} />
      <circle cx={x - 15} cy={172} r={4} fill={c.trim} />
    </g>
  ),
  'r-scatter': (x, c) => (
    <g {...s}>
      <rect x={x - 10} y={130} width={20} height={30} rx={3} fill={c.dark} />
      <rect x={x - 8} y={158} width={16} height={10} fill={INK} />
    </g>
  ),
  'r-beam': (x, c) => (
    <g {...s}>
      <rect x={x - 7} y={130} width={14} height={30} rx={6} fill={c.dark} />
      <rect x={x - 3} y={158} width={6} height={22} fill={c.trim} />
    </g>
  ),
  'r-rail': (x, c) => (
    <g {...s}>
      <rect x={x - 8} y={128} width={16} height={22} rx={2} fill={c.dark} />
      <rect x={x - 8} y={148} width={5} height={52} fill={c.trim} />
      <rect x={x + 3} y={148} width={5} height={52} fill={c.trim} />
    </g>
  ),
  'r-buzz': (x, c) => (
    <g {...s}>
      <rect x={x - 7} y={130} width={14} height={20} rx={2} fill={c.dark} />
      <rect x={x + 2} y={144} width={8} height={14} fill={c.trim} />
      <rect x={x - 2} y={150} width={4} height={14} fill={INK} />
    </g>
  ),
  'r-pile': (x, c) => (
    <g {...s}>
      <rect x={x - 9} y={130} width={18} height={24} rx={3} fill={c.dark} />
      <path d={`M${x - 5} 154 L${x + 5} 154 L${x} 182 Z`} fill={c.trim} />
    </g>
  ),
  'r-lance': (x, c) => (
    <g {...s}>
      <rect x={x - 8} y={128} width={16} height={14} rx={3} fill={c.dark} />
      <path d={`M${x - 9} 140 L${x + 9} 140 L${x + 4} 150 L${x - 4} 150 Z`} fill={c.trim} />
      <path d={`M${x - 3} 150 L${x + 3} 150 L${x + 1} 206 L${x - 1} 206 Z`} fill="#e8e2d4" />
      <path d={`M${x - 5} 196 L${x + 5} 196 L${x} 214 Z`} fill={c.trim} />
    </g>
  ),
  'lw-knuckle': (x, c) => (
    <g {...s}>
      <rect x={x - 13} y={128} width={26} height={26} rx={6} fill={c.dark} />
      <rect x={x - 13} y={150} width={26} height={8} rx={3} fill={c.trim} />
      <path d={`M${x - 6} 132 V144 M${x} 132 V144 M${x + 6} 132 V144`} />
    </g>
  ),
  'lw-pistol': (x, c) => (
    <g {...s}>
      <rect x={x - 6} y={132} width={12} height={16} rx={2} fill={c.dark} />
      <rect x={x - 2} y={146} width={4} height={14} fill={INK} />
    </g>
  ),
  'lw-saber': (x, c) => (
    <g {...s}>
      <rect x={x - 4} y={130} width={8} height={14} rx={2} fill={c.dark} />
      <rect x={x - 3} y={144} width={6} height={50} rx={3} fill={c.trim} stroke={INK} />
    </g>
  ),
  'lw-flamer': (x, c) => (
    <g {...s}>
      <circle cx={x} cy={140} r={9} fill={c.trim} />
      <rect x={x - 4} y={146} width={8} height={18} fill={c.dark} />
    </g>
  ),
  'lw-lance': (x, c) => (
    <g {...s}>
      <rect x={x - 6} y={130} width={12} height={26} rx={5} fill={c.dark} />
      <circle cx={x} cy={160} r={5} fill={c.trim} />
    </g>
  ),
  'lw-door': (x, c) => (
    <g {...s}>
      <rect x={x - 6} y={104} width={30} height={64} rx={3} fill={c.dark} />
      <circle cx={x + 16} cy={136} r={3} fill={c.trim} />
    </g>
  ),
  'lw-aegis': (x, c) => (
    <g {...s}>
      <path
        d={`M${x} 104 L${x + 22} 116 L${x + 22} 150 L${x} 162 L${x - 4} 150 L${x - 4} 116 Z`}
        fill={c.trim}
        opacity={0.85}
      />
    </g>
  ),
};

const BACKS: Record<string, (c: Ctx) => ReactNode> = {
  'bk-swarm': (c) => (
    <g {...s}>
      <rect x={52} y={60} width={26} height={26} rx={3} fill={c.dark} />
      <rect x={122} y={60} width={26} height={26} rx={3} fill={c.dark} />
      {[58, 70, 128, 140].map((x) => (
        <circle key={x} cx={x} cy={70} r={3} fill={c.trim} />
      ))}
    </g>
  ),
  'bk-howitzer': (c) => (
    <g {...s}>
      <rect x={118} y={38} width={16} height={52} rx={3} fill={c.dark} transform="rotate(18 126 64)" />
      <rect x={116} y={76} width={22} height={14} rx={3} fill={c.trim} />
    </g>
  ),
  'bk-orbit': (c) => (
    <g {...s}>
      <circle cx={146} cy={46} r={10} fill={c.dark} />
      <circle cx={146} cy={46} r={4} fill={c.trim} />
    </g>
  ),
  'bk-plate': (c) => <rect x={60} y={70} width={80} height={20} rx={4} fill={c.dark} {...s} />,
  'bk-dish': (c) => (
    <g {...s}>
      <line x1={128} y1={82} x2={136} y2={56} />
      <path d="M120 54 Q136 40 152 54 Z" fill={c.trim} />
    </g>
  ),
  'bk-chaff': (c) => (
    <g {...s}>
      {[66, 76, 124, 134].map((x) => (
        <line key={x} x1={x} y1={84} x2={x} y2={52} />
      ))}
      {[66, 76, 124, 134].map((x) => (
        <circle key={`d${x}`} cx={x} cy={52} r={3} fill={c.trim} />
      ))}
    </g>
  ),
  'bk-magnet': (c) => (
    <g {...s}>
      <line x1={100} y1={84} x2={100} y2={58} />
      <path d="M78 34 A22 22 0 0 0 122 34 L110 34 A10 10 0 0 1 90 34 Z" fill={c.dark} />
      <rect x={76} y={26} width={14} height={10} fill="#e4572e" />
      <rect x={110} y={26} width={14} height={10} fill="#3cf0ec" />
    </g>
  ),
  'bk-fins': (c) => (
    <g {...s}>
      <path d="M64 84 L52 58 L72 78 Z" fill={c.dark} />
      <path d="M136 84 L148 58 L128 78 Z" fill={c.dark} />
    </g>
  ),
};

const decal = (id: number, c: Ctx): ReactNode => {
  const kind = DECALS[id];
  const g = { stroke: INK, strokeWidth: 2 };
  switch (kind) {
    case 'stripe':
      return <rect x={94} y={90} width={12} height={48} fill={c.trim} {...g} />;
    case 'skull':
      return (
        <g {...g}>
          <circle cx={100} cy={110} r={10} fill="#f4f0e6" />
          <circle cx={96} cy={109} r={2.5} fill={INK} />
          <circle cx={104} cy={109} r={2.5} fill={INK} />
        </g>
      );
    case 'star':
      return (
        <path
          d="M100 98 L104 108 L114 108 L106 114 L109 124 L100 118 L91 124 L94 114 L86 108 L96 108 Z"
          fill={c.trim}
          {...g}
        />
      );
    case 'number':
      return (
        <g fill={c.trim} {...g}>
          <path d="M86 102 H98 V124 H86 Z M90 106 V120 H94 V106 Z" fillRule="evenodd" />
          <path d="M102 102 H114 V108 L108 124 H103 L109 107 H102 Z" />
        </g>
      );
    case 'hazard':
      return (
        <g {...g}>
          <rect x={84} y={122} width={32} height={10} fill="#ffd23f" />
          <path d="M88 122 L84 132 M96 122 L92 132 M104 122 L100 132 M112 122 L108 132" />
        </g>
      );
    case 'eye':
      return (
        <g {...g}>
          <path d="M86 112 Q100 100 114 112 Q100 124 86 112 Z" fill="#f4f0e6" />
          <circle cx={100} cy={112} r={4} fill={c.trim} />
        </g>
      );
    case 'bolt':
      return <path d="M103 96 L92 114 L100 114 L96 130 L110 108 L102 108 Z" fill="#ffd23f" {...g} />;
    default:
      return null;
  }
};

type Props = {
  build: Build;
  size?: number;
  flip?: boolean;
  className?: string;
  /** Render just one moving part (for the animated battle sprites). */
  only?: MechLayer;
};

export const MechArt = ({ build, size = 200, flip = false, className, only }: Props) => {
  const body = BODY_COLORS[build.paint.body] ?? BODY_COLORS[0]!;
  const trim = TRIM_COLORS[build.paint.trim] ?? TRIM_COLORS[0]!;
  const c: Ctx = { body, trim, dark: shade(body, 0.62) };
  const p = build.parts;
  const armW = ARMS[p.arms]?.w ?? 14;
  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={(size * 220) / 200}
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      role="img"
      aria-label={`${build.name} mech`}
    >
      {!only && <ellipse cx={100} cy={212} rx={66} ry={6} fill={INK} opacity={0.15} />}
      {(!only || only === 'back') && BACKS[p.back]?.(c)}
      {(!only || only === 'legs') && LEGS[p.legs]?.(c)}
      {(!only || only === 'armR') && arm(p.arms, -1, c)}
      {(!only || only === 'armL') && arm(p.arms, 1, c)}
      {only === 'armR' && HAND_WEAPONS[p.weaponR]?.(58 - armW / 2, c)}
      {only === 'armL' && HAND_WEAPONS[p.weaponL]?.(142 + armW / 2, c)}
      {(!only || only === 'body') && CORES[p.core]?.(c)}
      {(!only || only === 'body') && decal(build.paint.decal, c)}
      {(!only || only === 'body') && HEADS[p.head]?.(c)}
      {!only && HAND_WEAPONS[p.weaponR]?.(58 - armW / 2, c)}
      {!only && HAND_WEAPONS[p.weaponL]?.(142 + armW / 2, c)}
    </svg>
  );
};
