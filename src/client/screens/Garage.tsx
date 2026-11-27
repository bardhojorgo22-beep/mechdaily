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
import { SLOTS, SLOT_SHORT, getPart, partsForSlot, type Part, type Slot } from '../../shared/game/parts';
import { SPECIALS } from '../../shared/game/battle';
import { fightingStyle } from '../../shared/game/style';
import { SYNERGIES, SYNERGY_IDS, synergiesOf, type SynergyId } from '../../shared/game/synergies';
import { buildTitle } from '../../shared/game/title';
import { HANGAR_MAX, type InitResponse } from '../../shared/api';
import { PixelMech } from '../components/PixelMech';
import { sfx } from '../lib/sfx';

type Tab = Slot | 'paint';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const partStats = (p: Part): string[] => {
  switch (p.slot) {
    case 'head':
      return [
        `HP ${p.hp}`,
        `AIM ${pct(p.accuracy)}`,
        `SENSOR ${p.sensor}m`,
        ...(p.melee ? [`MELEE +${pct(p.melee)}`] : []),
      ];
    case 'core':
      return [
        `HP ${p.hp}`,
        `ARM-K ${pct(p.armorK)}`,
        `ARM-E ${pct(p.armorE)}`,
        `COOL ${p.cooling}`,
        `LOAD +${p.load}`,
        ...(p.energy ? [`POWER +${p.energy}/s`] : []),
      ];
    case 'arms':
      return [`HP ${p.hp}`, `AIM ${pct(p.accuracy)}`];
    case 'legs':
      return [p.legType.toUpperCase(), `HP ${p.hp}`, `LOAD ${p.load}t`, `MOVE ${pct(p.mobility)}`];
    case 'booster':
      return [`THRUST ${p.thrust}`, `DRAIN ${p.boostDrain}/s`];
    case 'generator':
      return [`OUT ${p.output}/s`, `TANK ${p.capacity}`, `COOL ${p.cooling >= 0 ? '+' : ''}${p.cooling}`];
    case 'chip':
      return [`SPECIAL: ${SPECIALS[p.behavior].name.toUpperCase()}`];
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
          ...(w.charge ? ['CHARGE BONUS'] : []),
          ...(w.pierce ? ['IGNORES ARMOR'] : []),
          ...(w.chill ? ['SLOWS'] : []),
          ...(w.shock ? ['DRAINS POWER'] : []),
          ...(w.acid ? ['MELTS ARMOR'] : []),
          ...(w.yank ? ['YANKS'] : []),
          ...(w.spinUp ? ['SPINS UP'] : []),
          ...(w.splash ? ['SPLASH'] : []),
          ...(w.slam ? ['ALWAYS STAGGERS'] : []),
          ...(w.shred || w.slam ? ['SHREDS SHIELDS'] : []),
        ];
      }
      if ('shield' in p)
        return [
          `BLOCK ${pct(p.shield.block)}`,
          ...(p.shield.energyPerHit ? [`EN ${p.shield.energyPerHit}/block`] : []),
          ...(p.shield.bash ? ['BASHES MELEE'] : []),
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
          ...(u.mines ? [`MINES ${u.mines.damage} DMG`, `EVERY ${(u.mines.every / 10).toFixed(1)}s`] : []),
          ...(u.smoke ? [`SMOKE ${(u.smoke.dur / 10).toFixed(1)}s`, `EVERY ${(u.smoke.every / 10).toFixed(0)}s`] : []),
          ...(u.barrier ? [`BUBBLE ${u.barrier.hp}`, `+${u.barrier.regen}/s`] : []),
          ...(u.pull ? ['MAGNET'] : []),
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
    <div className={`w-16 text-right ${warn ? 'text-rust font-semibold' : ''}`}>{text}</div>
  </div>
);

type Props = {
  build: Build;
  arena: Arena;
  tax: Tax;
  onChange: (b: Build) => void;
  onBack: () => void;
  /** Fire your weapons at a harmless target dummy. */
  onTestFire?: () => void;
  found?: InitResponse['synergiesFound'];
  username?: string | null;
  /** Saved mechs, and a setter that persists the list. */
  hangar?: Build[];
  onHangar?: (list: Build[]) => void;
};

const sameBuild = (a: Build, b: Build) =>
  JSON.stringify(a.parts) === JSON.stringify(b.parts) && JSON.stringify(a.paint) === JSON.stringify(b.paint);

/** Saved mechs: save the current one, tap one to load it back. */
const Hangar = ({
  build,
  hangar,
  onHangar,
  onLoad,
}: {
  build: Build;
  hangar: Build[];
  onHangar: (l: Build[]) => void;
  onLoad: (b: Build) => void;
}) => {
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const existing = hangar.findIndex((b) => b.name.trim().toLowerCase() === build.name.trim().toLowerCase());
  const savedAlready = hangar.some((b) => sameBuild(b, build) && b.name === build.name);
  const full = hangar.length >= HANGAR_MAX && existing < 0;
  const save = () => {
    if (savedAlready || full) return;
    const copy: Build = JSON.parse(JSON.stringify(build));
    if (existing >= 0) onHangar(hangar.map((b, k) => (k === existing ? copy : b)));
    else onHangar([...hangar, copy]);
    sfx.click();
  };
  return (
    <div className="sticker p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-display font-black text-sm">SAVED MECHS</span>
        <span className="text-[11px] text-mute">
          {hangar.length}/{HANGAR_MAX}
        </span>
        <button className="btn bg-sun text-xs ml-auto whitespace-nowrap" disabled={savedAlready || full} onClick={save}>
          {savedAlready
            ? '✓ Saved'
            : full
              ? 'Hangar full'
              : existing >= 0
                ? `💾 Update “${hangar[existing]!.name}”`
                : '💾 Save this mech'}
        </button>
      </div>
      {hangar.length === 0 ? (
        <div className="text-[11px] text-mute">
          Save builds here to swap between them without remaking them. Same name = overwrite.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {hangar.map((b, k) => {
            const current = sameBuild(b, build) && b.name === build.name;
            return (
              <div
                key={`${b.name}-${k}`}
                className="relative shrink-0 border-2 border-ink p-1 flex flex-col items-center w-[76px] cursor-pointer"
                style={{ background: current ? '#fff3b0' : '#f8f4ec' }}
                onClick={() => {
                  setConfirmDel(null);
                  onLoad(JSON.parse(JSON.stringify(b)));
                }}
                title={`Load ${b.name}`}
              >
                <PixelMech build={b} size={52} />
                <div className="text-[10px] font-semibold truncate w-full text-center">{b.name}</div>
                <button
                  className="absolute -top-2 -right-2 w-5 h-5 border-2 border-ink text-[10px] leading-none font-black"
                  style={{
                    background: confirmDel === k ? '#c0392b' : '#efe8da',
                    color: confirmDel === k ? '#fff' : '#1b1a17',
                  }}
                  aria-label={`Delete ${b.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmDel === k) {
                      onHangar(hangar.filter((_, j) => j !== k));
                      setConfirmDel(null);
                    } else setConfirmDel(k);
                  }}
                >
                  {confirmDel === k ? '?' : '✕'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {confirmDel !== null && (
        <div className="text-[10px] text-rust mt-1">Tap the ? again to delete “{hangar[confirmDel]?.name}”.</div>
      )}
    </div>
  );
};

export const Garage = ({
  build,
  arena,
  tax,
  onChange,
  onBack,
  onTestFire,
  found = {},
  username = null,
  hangar = [],
  onHangar,
}: Props) => {
  const [tab, setTab] = useState<Tab>('weaponR');
  const st = useMemo(() => computeStats(build, arena, tax), [build, arena, tax]);
  const title = buildTitle(build, arena);
  const active = st.synergies;
  const [flash, setFlash] = useState<SynergyId | null>(null);
  const foundCount = SYNERGY_IDS.filter((id) => found[id]).length;
  // parts that would complete a synergy someone in the sub has already found
  const completes = (slot: Slot, id: string): SynergyId | null => {
    const next = { ...build.parts, [slot]: id };
    for (const s of synergiesOf(next)) if (found[s] && !active.includes(s)) return s;
    return null;
  };
  const style = fightingStyle(st);
  const set = (slot: Slot, id: string) => {
    if (build.parts[slot] === id) return;
    const next = { ...build.parts, [slot]: id };
    const fresh = synergiesOf(next).filter((s) => !active.includes(s));
    const gained = fresh.find((s) => SYNERGIES[s].tier === 'legendary') ?? fresh[0];
    if (gained) {
      sfx.hype(2, true);
      setFlash(gained);
      setTimeout(() => setFlash((f) => (f === gained ? null : f)), 2600);
    } else sfx.equip();
    onChange({ ...build, parts: next });
  };
  const partsKey = JSON.stringify(build.parts);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn bg-card text-sm whitespace-nowrap" onClick={onBack}>
          ← Back
        </button>
        <input
          className="flex-1 min-w-0 font-display font-black text-xl bg-transparent border-b-3 border-ink outline-none px-1"
          style={{ borderBottomWidth: 3 }}
          value={build.name}
          maxLength={18}
          onChange={(e) => onChange({ ...build, name: e.target.value })}
          onBlur={() => onChange({ ...build, name: sanitizeName(build.name) })}
          aria-label="Mech name"
        />
      </div>

      {onHangar && <Hangar build={build} hangar={hangar} onHangar={onHangar} onLoad={onChange} />}

      <div className="sticker p-3 flex flex-wrap justify-center gap-3 items-center">
        <PixelMech key={partsKey} build={build} size={120} bob className="pop" />
        <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
          <Bar label="HP" value={st.hp} max={6000} text={`${st.hp}`} />
          <Bar label="ARMOR K" value={st.armorK} max={0.65} text={pct(st.armorK)} />
          <Bar label="ARMOR E" value={st.armorE} max={0.65} text={pct(st.armorE)} />
          <Bar label="SPEED" value={st.speed} max={140} text={`${Math.round(st.speed)} m/s`} />
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
          <Bar label="COOLING" value={Math.max(0, st.cooling)} max={80} text={`${Math.round(st.cooling)}/s`} />
        </div>
      </div>

      <div className="text-center font-display font-black text-sm tracking-wide -mb-1">“{title.toUpperCase()}”</div>

      {flash && (
        <div
          className="sticker p-3 text-center pop"
          style={{
            background: '#1b1a17',
            color: '#ffc914',
            boxShadow: SYNERGIES[flash].tier === 'legendary' ? '0 0 0 3px #ffc914, 6px 6px 0 #1b1a17' : undefined,
          }}
        >
          {SYNERGIES[flash].tier === 'legendary' && <div className="text-xs tracking-widest">🌟 LEGENDARY 🌟</div>}
          <div className="font-display text-2xl stamp">⚡ SYNERGY: {SYNERGIES[flash].name.toUpperCase()}</div>
          <div className="text-xs mt-1" style={{ color: '#efe8da' }}>
            {found[flash] && found[flash]!.by !== username
              ? `First found by u/${found[flash]!.by}.`
              : 'A hidden combo! If nobody here found it yet, you get the credit.'}
          </div>
        </div>
      )}

      {active.map((id) => (
        <div key={id} className="sticker p-2 flex items-start gap-2" style={{ background: '#fff3b0' }}>
          <span className="tag bg-ink text-paper whitespace-nowrap">⚡ {SYNERGIES[id].name}</span>
          <span className="text-[11px] flex-1">{SYNERGIES[id].effect}</span>
        </div>
      ))}

      <div
        className="sticker p-2 flex flex-wrap items-center gap-2"
        style={{ background: '#1b1a17', color: '#efe8da' }}
      >
        <span className="tag bg-sun text-ink">{style.name}</span>
        <span className="text-[11px] flex-1 min-w-[150px]">{style.plan}</span>
        {onTestFire && (
          <button className="btn bg-sun text-ink text-xs whitespace-nowrap" onClick={onTestFire}>
            🎯 Test fire
          </button>
        )}
      </div>

      {(st.overweight > 0 || st.energyRegen <= 0) && (
        <div className="sticker p-2 text-xs bg-sun">
          {st.overweight > 0 && (
            <div>⚠ {pct(st.overweight)} overweight — you'll crawl. Lighter parts or stronger legs.</div>
          )}
          {st.energyRegen <= 0 && <div>⚠ Your parts drain more power than the generator makes.</div>}
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
              {t === 'paint' ? 'Paint' : SLOT_SHORT[t]}
            </div>
            <div className={`text-[10px] truncate ${tab === t ? 'text-paper' : 'text-mute'}`}>
              {t === 'paint' ? DECALS[build.paint.decal] : getPart(build.parts[t]).name}
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
                      outline: build.paint[key] === i ? '3px solid #e4572e' : 'none',
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
                  onClick={() => onChange({ ...build, paint: { ...build.paint, decal: i } })}
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
                data-quiet
                className={`sticker p-2.5 text-left ${active ? 'bg-sun' : ''}`}
                style={active ? { background: '#ffe08a' } : undefined}
                onClick={() => set(tab, p.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="font-display font-black text-lg leading-none">{p.name}</div>
                  {active && <span className="tag bg-ink text-paper">equipped</span>}
                  {t > 0.05 && <span className="tag bg-rust text-white">popular · +{Math.round(t * 45)}% wt</span>}
                  {!active && completes(tab, p.id) && (
                    <span className="tag bg-ink text-paper">⚡ {SYNERGIES[completes(tab, p.id)!].name}</span>
                  )}
                  <div className="ml-auto text-[11px] text-mute">
                    {p.weight}t{!active && dw !== 0 ? ` (${dw > 0 ? '+' : ''}${dw})` : ''}
                    {p.drain ? ` · ${p.drain}en` : ''}
                  </div>
                </div>
                <div className="text-xs mt-0.5">{p.blurb}</div>
                {p.slot === 'chip' && <div className="text-[11px] mt-0.5 text-mute">{SPECIALS[p.behavior].blurb}</div>}
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
      <details className="sticker p-3">
        <summary className="font-display font-black cursor-pointer">
          ⚡ Hidden synergies · {foundCount}/{SYNERGY_IDS.length} found here
        </summary>
        <div className="text-[11px] text-mute mt-1">
          Some odd part pairs secretly work together. The first redditor in this sub to equip one gets credited in the
          comments.
        </div>
        {(
          [
            ['legendary', '🌟 Legendary · 3-part combos'],
            ['pair', 'Part pairs'],
            ['chip', 'Pilot chip + weapon'],
          ] as const
        ).map(([tier, label]) => {
          const ids = SYNERGY_IDS.filter((id) => (SYNERGIES[id].tier ?? 'pair') === tier);
          return (
            <div key={tier} className="mt-3">
              <div className="text-[11px] font-semibold text-mute mb-1">
                {label.toUpperCase()} · {ids.filter((id) => found[id]).length}/{ids.length}
              </div>
              <div className="flex flex-col gap-1.5">
                {ids.map((id) => {
                  const s = SYNERGIES[id];
                  const f = found[id];
                  const mine = active.includes(id);
                  const legend = tier === 'legendary';
                  return f || mine ? (
                    <div
                      key={id}
                      className="border-2 border-ink p-2"
                      style={{
                        background: mine ? '#fff3b0' : legend ? '#fff8d6' : '#f8f4ec',
                        borderColor: legend ? '#c98a00' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black">{s.name}</span>
                        {mine && <span className="tag bg-ink text-paper">active</span>}
                        <span className="ml-auto text-[10px] text-mute">
                          {f ? `found by u/${f.by}` : 'not credited yet'}
                        </span>
                      </div>
                      <div className="text-[11px]">{s.parts.map((p) => getPart(p).name).join(' + ')}</div>
                      <div className="text-[11px] text-mute">{s.effect}</div>
                    </div>
                  ) : (
                    <div
                      key={id}
                      className="border-2 border-dashed p-2 opacity-80"
                      style={{ borderColor: legend ? '#c98a00' : '#1b1a17' }}
                    >
                      <span className="font-display font-black">{legend ? '🌟 ???' : '???'}</span>
                      <span className="text-[11px] ml-2 italic">{s.hint}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </details>
    </div>
  );
};
