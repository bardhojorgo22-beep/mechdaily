import { useMemo, useState } from 'react';
import type { Arena } from '../../shared/game/arenas';
import {
  BODY_COLORS,
  DECALS,
  TRIM_COLORS,
  computeStats,
  sanitizeName,
  type Build,
  type Tax,
} from '../../shared/game/mech';
import {
  SLOTS,
  SLOT_LABEL,
  getPart,
  partsForSlot,
  type Part,
  type Slot,
} from '../../shared/game/parts';
import { MechArt } from '../components/MechArt';

type Tab = Slot | 'paint';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const partStats = (p: Part): string[] => {
  switch (p.slot) {
    case 'head':
      return [`HP ${p.hp}`, `AIM ${pct(p.accuracy)}`, `SENSOR ${p.sensor}m`];
    case 'core':
      return [
        `HP ${p.hp}`,
        `ARM-K ${pct(p.armorK)}`,
        `ARM-E ${pct(p.armorE)}`,
        `COOL ${p.cooling}`,
        `LOAD +${p.load}`,
      ];
    case 'arms':
      return [`HP ${p.hp}`, `AIM ${pct(p.accuracy)}`];
    case 'legs':
      return [
        p.legType.toUpperCase(),
        `HP ${p.hp}`,
        `LOAD ${p.load}t`,
        `MOVE ${pct(p.mobility)}`,
      ];
    case 'booster':
      return [`THRUST ${p.thrust}`, `DRAIN ${p.boostDrain}/s`];
    case 'generator':
      return [
        `OUT ${p.output}/s`,
        `TANK ${p.capacity}`,
        `COOL ${p.cooling >= 0 ? '+' : ''}${p.cooling}`,
      ];
    case 'chip':
      return [];
    default:
      if ('weapon' in p) {
        const w = p.weapon;
        return [
          w.type.toUpperCase(),
          `DMG ${w.damage}`,
          `RNG ${w.minRange ? `${w.minRange}-` : ''}${w.maxRange}m`,
          `${(10 / w.cooldown).toFixed(1)}/s`,
          ...(w.energyCost ? [`EN ${w.energyCost}`] : []),
          ...(w.ammo ? [`AMMO ${w.ammo}`] : []),
          ...(w.homing ? ['HOMING'] : []),
          ...(w.heavy ? ['PLANT TO FIRE'] : []),
        ];
      }
      if ('shield' in p)
        return [
          `BLOCK ${pct(p.shield.block)}`,
          ...(p.shield.energyPerHit
            ? [`EN ${p.shield.energyPerHit}/block`]
            : []),
        ];
      if ('utility' in p) {
        const u = p.utility;
        return [
          ...(u.hp ? [`HP +${u.hp}`] : []),
          ...(u.armorK ? [`ARM-K +${pct(u.armorK)}`] : []),
          ...(u.sensor ? [`SENSOR ${u.sensor}m`] : []),
          ...(u.accuracy ? [`AIM +${pct(u.accuracy)}`] : []),
          ...(u.range ? [`RANGE +${pct(u.range)}`] : []),
          ...(u.cooling ? [`COOL +${u.cooling}`] : []),
          ...(u.jam ? [`ENEMY AIM -${pct(u.jam)}`] : []),
        ];
      }
      return [];
  }
};

const Bar = ({
  label,
  value,
  max,
  text,
  warn,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  warn?: boolean;
}) => (
  <div className="flex items-center gap-2 text-[11px]">
    <div className="w-16 font-semibold">{label}</div>
    <div className="flex-1 h-2.5 border-2 border-ink rounded-sm bg-white overflow-hidden">
      <div
        className="h-full"
        style={{
          width: `${Math.min(100, (value / max) * 100)}%`,
          background: warn ? '#e4572e' : '#1b1a17',
        }}
      />
    </div>
    <div className={`w-16 text-right ${warn ? 'text-rust font-semibold' : ''}`}>
      {text}
    </div>
  </div>
);

type Props = {
  build: Build;
  arena: Arena;
  tax: Tax;
  onChange: (b: Build) => void;
  onBack: () => void;
};

export const Garage = ({ build, arena, tax, onChange, onBack }: Props) => {
  const [tab, setTab] = useState<Tab>('weaponR');
  const st = useMemo(
    () => computeStats(build, arena, tax),
    [build, arena, tax]
  );
  const set = (slot: Slot, id: string) =>
    onChange({ ...build, parts: { ...build.parts, [slot]: id } });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn bg-card text-sm" onClick={onBack}>
          ← Back
        </button>
        <input
          className="flex-1 min-w-0 font-display font-black text-2xl bg-transparent border-b-3 border-ink outline-none px-1"
          style={{ borderBottomWidth: 3 }}
          value={build.name}
          maxLength={18}
          onChange={(e) => onChange({ ...build, name: e.target.value })}
          onBlur={() => onChange({ ...build, name: sanitizeName(build.name) })}
          aria-label="Mech name"
        />
      </div>

      <div className="sticker p-3 flex gap-3 items-center">
        <MechArt build={build} size={120} />
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <Bar label="HP" value={st.hp} max={6000} text={`${st.hp}`} />
          <Bar
            label="ARMOR K"
            value={st.armorK}
            max={0.65}
            text={pct(st.armorK)}
          />
          <Bar
            label="ARMOR E"
            value={st.armorE}
            max={0.65}
            text={pct(st.armorE)}
          />
          <Bar
            label="SPEED"
            value={st.speed}
            max={220}
            text={`${Math.round(st.speed)} m/s`}
          />
          <Bar
            label="WEIGHT"
            value={st.weight}
            max={st.load}
            text={`${Math.round(st.weight)}/${Math.round(st.load)}t`}
            warn={st.overweight > 0}
          />
          <Bar
            label="ENERGY"
            value={Math.max(0, st.energyRegen)}
            max={70}
            text={`${st.energyRegen >= 0 ? '+' : ''}${Math.round(st.energyRegen)}/s`}
            warn={st.energyRegen <= 0}
          />
          <Bar
            label="COOLING"
            value={Math.max(0, st.cooling)}
            max={80}
            text={`${Math.round(st.cooling)}/s`}
          />
        </div>
      </div>

      {(st.overweight > 0 || st.energyRegen <= 0) && (
        <div className="sticker p-2 text-xs bg-sun">
          {st.overweight > 0 && (
            <div>
              ⚠ {pct(st.overweight)} overweight — you'll crawl. Lighter parts or
              stronger legs.
            </div>
          )}
          {st.energyRegen <= 0 && (
            <div>⚠ Your parts drain more power than the generator makes.</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {[...SLOTS, 'paint' as const].map((t) => (
          <button
            key={t}
            className={`rounded-md border-2 border-ink px-1 py-1 text-left leading-tight ${tab === t ? 'bg-ink text-paper' : 'bg-card'}`}
            onClick={() => setTab(t)}
          >
            <div className="font-display font-black text-[13px] uppercase truncate">
              {t === 'paint' ? 'Paint' : SLOT_LABEL[t]}
            </div>
            <div
              className={`text-[10px] truncate ${tab === t ? 'text-paper' : 'text-mute'}`}
            >
              {t === 'paint'
                ? DECALS[build.paint.decal]
                : getPart(build.parts[t]).name}
            </div>
          </button>
        ))}
      </div>

      {tab === 'paint' ? (
        <div className="sticker p-3 flex flex-col gap-3">
          {(
            [
              ['Body', BODY_COLORS, 'body'],
              ['Trim', TRIM_COLORS, 'trim'],
            ] as const
          ).map(([label, colors, key]) => (
            <div key={key}>
              <div className="text-xs font-semibold mb-1">{label}</div>
              <div className="flex gap-2 flex-wrap">
                {colors.map((c, i) => (
                  <button
                    key={c}
                    aria-label={`${label} color ${i + 1}`}
                    className="w-9 h-9 rounded-md border-3"
                    style={{
                      background: c,
                      borderWidth: 3,
                      borderColor: '#1b1a17',
                      outline:
                        build.paint[key] === i ? '3px solid #e4572e' : 'none',
                      outlineOffset: 2,
                    }}
                    onClick={() =>
                      onChange({
                        ...build,
                        paint: { ...build.paint, [key]: i },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="text-xs font-semibold mb-1">Decal</div>
            <div className="flex gap-2 flex-wrap">
              {DECALS.map((d, i) => (
                <button
                  key={d}
                  className={`tag py-1 ${build.paint.decal === i ? 'bg-ink text-paper' : 'bg-card'}`}
                  onClick={() =>
                    onChange({ ...build, paint: { ...build.paint, decal: i } })
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {partsForSlot(tab).map((p) => {
            const active = build.parts[tab] === p.id;
            const t = tax[p.id] ?? 0;
            const cur = getPart(build.parts[tab]);
            const dw = p.weight - cur.weight;
            return (
              <button
                key={p.id}
                className={`sticker p-2.5 text-left ${active ? 'bg-sun' : ''}`}
                style={active ? { background: '#ffe08a' } : undefined}
                onClick={() => set(tab, p.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="font-display font-black text-xl leading-none">
                    {p.name}
                  </div>
                  {active && (
                    <span className="tag bg-ink text-paper">equipped</span>
                  )}
                  {t > 0.05 && (
                    <span className="tag bg-rust text-white">
                      popular · +{Math.round(t * 45)}% wt
                    </span>
                  )}
                  <div className="ml-auto text-[11px] text-mute">
                    {p.weight}t
                    {!active && dw !== 0 ? ` (${dw > 0 ? '+' : ''}${dw})` : ''}
                    {p.drain ? ` · ${p.drain}en` : ''}
                  </div>
                </div>
                <div className="text-xs mt-0.5">{p.blurb}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {partStats(p).map((x) => (
                    <span key={x} className="tag bg-white">
                      {x}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
