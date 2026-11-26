import './fonts';
import './index.css';

import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { context, navigateTo, showToast } from '@devvit/web/client';
import type {
  InitResponse,
  LeaderboardResponse,
  ResultsResponse,
} from '../shared/api';
import { getArena, type Arena } from '../shared/game/arenas';
import { simulateBattle, type BattleResult } from '../shared/game/battle';
import { botsForDay } from '../shared/game/bots';
import { FACTIONS, FACTION_IDS, type FactionId } from '../shared/game/factions';
import { DEFAULT_BUILD, type Build, type Tax } from '../shared/game/mech';
import { getPart } from '../shared/game/parts';
import { winsFor } from '../shared/game/tournament';
import { BattleView } from './components/BattleView';
import { PixelMech } from './components/PixelMech';
import { api, countdown } from './lib/api';
import { isMuted, onMuteChange, setMuted, sfx } from './lib/sfx';
import { Garage } from './screens/Garage';

type Fight = {
  result: BattleResult;
  builds: [Build, Build];
  labels: [string, string];
  tags: [string, string];
  arena: Arena;
  key: string;
};
type Screen =
  'home' | 'garage' | 'practice' | 'battle' | 'bracket' | 'factions';

const postUrl = (postId: string) =>
  `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;

const MuteButton = () => {
  const [m, setM] = useState(isMuted());
  useEffect(() => {
    const off = onMuteChange(setM);
    return () => {
      off();
    };
  }, []);
  return (
    <button
      data-quiet
      className="btn bg-card text-xs px-2 py-1"
      aria-label={m ? 'Unmute' : 'Mute'}
      onClick={() => setMuted(!m)}
    >
      {m ? '🔇' : '🔊'}
    </button>
  );
};

const Header = ({ data }: { data: InitResponse }) => (
  <div className="flex items-end justify-between gap-2">
    <div>
      <div className="font-display font-black text-3xl leading-[0.85] tracking-tight">
        MECH DAILY
      </div>
      <div className="text-[11px] text-mute mt-1">
        Day {data.dayNumber} · {data.entryCount} pilot
        {data.entryCount === 1 ? '' : 's'} entered
      </div>
    </div>
    <div className="flex items-center gap-2">
      {data.faction && (
        <span
          className="tag py-0.5"
          style={{ background: FACTIONS[data.faction].color }}
        >
          {FACTIONS[data.faction].name}
        </span>
      )}
      <MuteButton />
    </div>
  </div>
);

const FactionPicker = ({ onPick }: { onPick: (f: FactionId) => void }) => (
  <div className="fixed inset-0 z-20 grid-paper flex flex-col justify-center p-4 gap-3">
    <div className="font-display font-black text-3xl leading-none">
      Pick a side
    </div>
    <div className="text-sm">
      Every match your faction wins adds to its score. You can't switch later.
    </div>
    {FACTION_IDS.map((id) => {
      const f = FACTIONS[id];
      return (
        <button
          key={id}
          className="sticker p-3 text-left flex items-center gap-3"
          onClick={() => onPick(id)}
        >
          <div
            className="w-10 h-10 rounded-md border-3"
            style={{
              background: f.color,
              borderWidth: 3,
              borderColor: '#1b1a17',
            }}
          />
          <div>
            <div className="font-display font-black text-xl leading-none">
              {f.name}
            </div>
            <div className="text-xs">{f.motto}</div>
          </div>
        </button>
      );
    })}
  </div>
);

const FactionBars = ({ totals }: { totals: Record<FactionId, number> }) => {
  const max = Math.max(1, ...FACTION_IDS.map((f) => totals[f]));
  return (
    <div className="flex flex-col gap-1.5">
      {FACTION_IDS.map((f) => (
        <div key={f} className="flex items-center gap-2 text-xs">
          <div className="w-14 font-semibold">{FACTIONS[f].name}</div>
          <div className="flex-1 h-3 border-2 border-ink rounded-sm bg-white overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${(totals[f] / max) * 100}%`,
                background: FACTIONS[f].color,
              }}
            />
          </div>
          <div className="w-10 text-right">{totals[f]}</div>
        </div>
      ))}
    </div>
  );
};

export const App = () => {
  const [data, setData] = useState<InitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [build, setBuild] = useState<Build>(DEFAULT_BUILD);
  const [fight, setFight] = useState<Fight | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [, setNow] = useState(0);
  const fightCount = useRef(0);

  const load = useCallback(() => {
    api
      .init()
      .then((d) => {
        setData(d);
        setBuild(d.myEntry ?? d.myBuild ?? DEFAULT_BUILD);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load')
      );
  }, []);

  // every button clicks, unless it makes its own sound
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el =
        e.target instanceof Element
          ? e.target.closest('button, summary')
          : null;
      if (el && !el.closest('[data-quiet]')) sfx.click();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => setNow((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const arena = useMemo(
    () => getArena(data?.arenaId ?? 'yard'),
    [data?.arenaId]
  );
  const tax: Tax = data?.tax ?? {};
  const isOldPost = data ? data.postDay !== data.day : false;

  const entered = data?.myEntry
    ? JSON.stringify(data.myEntry) === JSON.stringify(build)
    : false;

  const leaveGarage = async () => {
    setScreen('home');
    try {
      await api.save(build);
    } catch {
      /* not logged in: keep it local */
    }
  };

  const enter = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api.enter(build);
      setData({
        ...data,
        myEntry: build,
        entryCount: r.entryCount,
        profile: { ...data.profile, streak: r.streak },
      });
      showToast(
        data.myEntry
          ? 'Entry updated'
          : `Entered! Streak: ${r.streak} day${r.streak === 1 ? '' : 's'}`
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not enter');
    } finally {
      setBusy(false);
    }
  };

  const pickFaction = async (f: FactionId) => {
    if (!data) return;
    try {
      const r = await api.faction(f);
      setData({ ...data, faction: r.faction });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not join');
    }
  };

  const practice = (opp: Build, label: string) => {
    fightCount.current += 1;
    const seed = `practice:${data?.day ?? ''}:${fightCount.current}:${opp.name}:${build.name}`;
    const result = simulateBattle(
      { build, tax },
      { build: opp, tax },
      arena,
      seed
    );
    setFight({
      result,
      builds: [build, opp],
      labels: [data?.username ? `u/${data.username}` : 'you', label],
      tags: ['YOU', 'FOE'],
      arena,
      key: seed,
    });
    setScreen('battle');
  };

  const openBracket = async (day: string) => {
    setScreen('bracket');
    setResults(null);
    try {
      setResults(await api.results(day));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No results yet');
      setScreen('home');
    }
  };

  const openFactions = async () => {
    setScreen('factions');
    try {
      setBoard(await api.leaderboard());
    } catch {
      /* ignore */
    }
  };

  if (error)
    return (
      <div className="grid-paper min-h-screen p-6 flex flex-col gap-3 justify-center">
        <div className="font-display font-black text-2xl">Something broke.</div>
        <div className="text-sm">{error}</div>
        <button
          className="btn bg-sun"
          onClick={() => {
            setError(null);
            load();
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="grid-paper min-h-screen flex items-center justify-center font-display font-black text-xl">
        WARMING UP…
      </div>
    );

  const needFaction = !!data.username && !data.faction && !isOldPost;
  const sparring = botsForDay(`${data.day}:spar`, 3);

  return (
    <div className="grid-paper min-h-screen">
      <div className="max-w-[560px] mx-auto p-3 pb-10 flex flex-col gap-3">
        {needFaction && <FactionPicker onPick={(f) => void pickFaction(f)} />}

        {screen === 'home' && (
          <>
            <Header data={data} />

            {isOldPost && (
              <div
                className="sticker p-3 bg-sun flex flex-col gap-2"
                style={{ background: '#ffe08a' }}
              >
                <div className="text-sm">
                  This is Day {data.postDayNumber}'s post. Its bracket is done.
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn bg-card flex-1 text-sm"
                    onClick={() => void openBracket(data.postDay)}
                  >
                    See that bracket
                  </button>
                  {data.todayPostId && (
                    <button
                      className="btn bg-rust text-white flex-1 text-sm"
                      onClick={() => navigateTo(postUrl(data.todayPostId!))}
                    >
                      Go to today
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="sticker p-3">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-semibold text-mute">
                  TODAY'S ARENA
                </div>
                <div className="text-[11px]">
                  bracket in {countdown(data.nextRolloverIso)}
                </div>
              </div>
              <div className="font-display font-black text-2xl leading-none mt-1">
                {arena.name}
              </div>
              <div className="text-sm mt-1">{arena.blurb}</div>
              {Object.keys(tax).length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-mute mb-1">
                    TOO POPULAR YESTERDAY — HEAVIER TODAY
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(tax)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([id, t]) => (
                        <span key={id} className="tag bg-rust text-white">
                          {getPart(id).name} +{Math.round(t * 45)}%
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticker p-3 flex gap-3 items-center">
              <PixelMech build={build} size={110} bob />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div>
                  <div className="font-display font-black text-xl leading-none truncate">
                    {build.name}
                  </div>
                  <div className="text-[11px] text-mute">
                    {getPart(build.parts.chip).name} pilot ·{' '}
                    {getPart(build.parts.legs).name} legs
                  </div>
                </div>
                <button
                  className="btn bg-card text-sm"
                  onClick={() => setScreen('garage')}
                >
                  Garage
                </button>
                <button
                  className="btn bg-teal text-sm"
                  onClick={() => setScreen('practice')}
                >
                  Practice fight
                </button>
              </div>
            </div>

            {!isOldPost && (
              <button
                className="btn bg-rust text-white text-xl py-3"
                disabled={busy || entered || !data.username}
                onClick={() => void enter()}
              >
                {!data.username
                  ? 'Log in to enter'
                  : entered
                    ? '✓ Entered for today'
                    : data.myEntry
                      ? 'Update my entry'
                      : "Enter today's bracket"}
              </button>
            )}
            {data.profile.streak > 0 && !isOldPost && (
              <div className="text-xs text-center -mt-1">
                🔥 {data.profile.streak}-day streak · {data.profile.wins} match
                wins total
                {data.profile.titles > 0 ? ` · 🏆×${data.profile.titles}` : ''}
              </div>
            )}

            {data.last && (
              <div className="sticker p-3">
                <div className="text-[11px] font-semibold text-mute">
                  DAY {data.last.dayNumber} RESULT
                </div>
                <div className="font-display font-black text-xl leading-none mt-1">
                  🏆 {data.last.championName}
                </div>
                <div className="text-xs">
                  {data.last.championPilot
                    ? `piloted by u/${data.last.championPilot}`
                    : 'a house bot took it'}
                </div>
                {data.last.mine && (
                  <div className="text-sm mt-2">
                    {data.last.mine.champion
                      ? 'That was you. Champion!'
                      : `You won ${data.last.mine.wins} match${data.last.mine.wins === 1 ? '' : 'es'} out of ${data.last.mine.rounds} rounds.`}
                  </div>
                )}
                <button
                  className="btn bg-card text-sm w-full mt-2"
                  onClick={() => void openBracket(data.last!.day)}
                >
                  Watch the bracket
                </button>
              </div>
            )}

            <button
              className="sticker p-3 text-left"
              onClick={() => void openFactions()}
            >
              <div className="flex justify-between text-[11px] font-semibold text-mute mb-2">
                <span>FACTION WAR</span>
                <span>leaderboard →</span>
              </div>
              <FactionBars totals={data.factionTotals} />
            </button>

            <details className="sticker p-3 text-xs">
              <summary className="font-display font-black text-lg cursor-pointer">
                How it works
              </summary>
              <ol className="list-decimal pl-4 mt-2 flex flex-col gap-1">
                <li>
                  Build a mech in the garage. 10 slots, every part has a
                  trade-off.
                </li>
                <li>
                  Check today's arena. Fog, mud, heat… the best build changes
                  daily.
                </li>
                <li>Practice against sparring bots and past champions.</li>
                <li>
                  Enter. At 00:00 UTC every entry fights in an automatic
                  bracket.
                </li>
                <li>
                  Parts that were too popular get heavier the next day. Don't
                  copy the meta.
                </li>
              </ol>
            </details>
          </>
        )}

        {screen === 'garage' && (
          <Garage
            build={build}
            arena={arena}
            tax={tax}
            onChange={setBuild}
            onBack={() => void leaveGarage()}
          />
        )}

        {screen === 'practice' && (
          <>
            <div className="flex items-center gap-2">
              <button
                className="btn bg-card text-sm"
                onClick={() => setScreen('home')}
              >
                ← Back
              </button>
              <div className="font-display font-black text-2xl">Practice</div>
            </div>
            <div className="text-xs">
              Fights happen in today's arena: {arena.name}. Nothing here counts.
            </div>
            <div className="text-[11px] font-semibold text-mute">
              SPARRING BOTS
            </div>
            {sparring.map((b, i) => (
              <button
                key={i}
                className="sticker p-2 flex items-center gap-3 text-left"
                onClick={() => practice(b, 'sparring bot')}
              >
                <PixelMech build={b} size={56} />
                <div className="flex-1">
                  <div className="font-display font-black text-lg leading-none">
                    {b.name}
                  </div>
                  <div className="text-[11px] text-mute">
                    {getPart(b.parts.chip).name} ·{' '}
                    {getPart(b.parts.weaponR).name} +{' '}
                    {getPart(b.parts.back).name}
                  </div>
                </div>
                <span className="font-display font-black">FIGHT →</span>
              </button>
            ))}
            {data.champions.length > 0 && (
              <div className="text-[11px] font-semibold text-mute mt-2">
                PAST CHAMPIONS
              </div>
            )}
            {data.champions.slice(0, 5).map((c) => (
              <button
                key={c.day}
                className="sticker p-2 flex items-center gap-3 text-left"
                onClick={() => practice(c.build, `Day ${c.dayNumber} champ`)}
              >
                <PixelMech build={c.build} size={56} />
                <div className="flex-1">
                  <div className="font-display font-black text-lg leading-none">
                    🏆 {c.name}
                  </div>
                  <div className="text-[11px] text-mute">
                    Day {c.dayNumber} · {c.pilot ? `u/${c.pilot}` : 'house bot'}
                  </div>
                </div>
                <span className="font-display font-black">FIGHT →</span>
              </button>
            ))}
          </>
        )}

        {screen === 'battle' && fight && (
          <BattleView
            key={fight.key}
            result={fight.result}
            builds={fight.builds}
            labels={fight.labels}
            tags={fight.tags}
            arena={fight.arena}
            onDone={() =>
              setScreen(fight.tags[0] === 'YOU' ? 'practice' : 'bracket')
            }
          />
        )}

        {screen === 'bracket' && (
          <>
            <div className="flex items-center gap-2">
              <button
                className="btn bg-card text-sm"
                onClick={() => setScreen('home')}
              >
                ← Back
              </button>
              <div className="font-display font-black text-2xl">
                {results ? `Day ${results.dayNumber} bracket` : 'Loading…'}
              </div>
            </div>
            {results && (
              <Bracket
                res={results}
                username={data.username}
                onWatch={setFight}
                onShow={() => setScreen('battle')}
              />
            )}
          </>
        )}

        {screen === 'factions' && (
          <>
            <div className="flex items-center gap-2">
              <button
                className="btn bg-card text-sm"
                onClick={() => setScreen('home')}
              >
                ← Back
              </button>
              <div className="font-display font-black text-2xl">
                Faction war
              </div>
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">
                ALL-TIME POINTS
              </div>
              <FactionBars totals={data.factionTotals} />
              <div className="text-[11px] text-mute mt-2">
                +1 for entering, +2 per match won, +5 for the champion.
              </div>
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">
                ENTERED TODAY
              </div>
              <FactionBars totals={data.factionToday} />
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">
                TOP PILOTS (MATCH WINS)
              </div>
              {!board && <div className="text-xs">Loading…</div>}
              {board && board.pilots.length === 0 && (
                <div className="text-xs">No winners yet. Be the first.</div>
              )}
              {board?.pilots.map((p, i) => (
                <div
                  key={p.username}
                  className="flex justify-between text-sm py-0.5"
                >
                  <span>
                    {i + 1}. u/{p.username}
                  </span>
                  <span className="font-semibold">{p.wins}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ROUND_NAME = (fromEnd: number, total: number) =>
  fromEnd === 0
    ? 'Final'
    : fromEnd === 1
      ? 'Semifinals'
      : fromEnd === 2
        ? 'Quarterfinals'
        : `Round ${total - fromEnd}`;

const Bracket = ({
  res,
  username,
  onWatch,
  onShow,
}: {
  res: ResultsResponse;
  username: string | null;
  onWatch: (f: Fight) => void;
  onShow: () => void;
}) => {
  const t = res.result;
  const arena = getArena(t.arenaId);
  const me = username ? t.entrants.findIndex((e) => e.pilot === username) : -1;
  const champ = t.entrants[t.champion]!;
  const label = (i: number) => {
    const e = t.entrants[i]!;
    return e.bot ? 'bot' : `u/${e.pilot}`;
  };
  const watch = (a: number, b: number, seed: string) => {
    const ea = t.entrants[a]!;
    const eb = t.entrants[b]!;
    const result = simulateBattle(
      { build: ea.build, tax: t.tax },
      { build: eb.build, tax: t.tax },
      arena,
      seed
    );
    onWatch({
      result,
      builds: [ea.build, eb.build],
      labels: [label(a), label(b)],
      tags: ['A', 'B'],
      arena,
      key: seed,
    });
    onShow();
  };
  const humans = t.entrants.filter((e) => !e.bot).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="sticker p-3 flex gap-3 items-center">
        <PixelMech build={champ.build} size={90} />
        <div>
          <div className="text-[11px] font-semibold text-mute">
            CHAMPION · {arena.name.toUpperCase()}
          </div>
          <div className="font-display font-black text-2xl leading-none">
            🏆 {champ.build.name}
          </div>
          <div className="text-xs">{label(t.champion)}</div>
          <div className="text-[11px] text-mute mt-1">
            {humans} pilots + {t.entrants.length - humans} bots
          </div>
        </div>
      </div>
      {me >= 0 && (
        <div className="sticker p-2 text-sm">
          You won {winsFor(t, me)} match{winsFor(t, me) === 1 ? '' : 'es'}.
        </div>
      )}
      {t.rounds.map((round, ri) => {
        const fromEnd = t.rounds.length - 1 - ri;
        const shown = round.filter(
          (m) => fromEnd <= 2 || m.a === me || m.b === me
        );
        if (shown.length === 0) return null;
        return (
          <div key={ri} className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold text-mute">
              {ROUND_NAME(fromEnd, t.rounds.length).toUpperCase()}
            </div>
            {shown.map((m) => {
              const mine = m.a === me || m.b === me;
              return (
                <button
                  key={m.seed}
                  className="sticker px-2 py-1.5 flex items-center gap-2 text-left text-sm"
                  style={mine ? { background: '#ffe08a' } : undefined}
                  onClick={() => watch(m.a, m.b, m.seed)}
                >
                  <span
                    className={`flex-1 truncate ${m.w === m.a ? 'font-semibold' : 'text-mute line-through'}`}
                  >
                    {t.entrants[m.a]!.build.name}
                  </span>
                  <span className="text-[10px]">vs</span>
                  <span
                    className={`flex-1 truncate text-right ${m.w === m.b ? 'font-semibold' : 'text-mute line-through'}`}
                  >
                    {t.entrants[m.b]!.build.name}
                  </span>
                  <span className="font-display font-black">▶</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
