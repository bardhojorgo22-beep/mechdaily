import './fonts';
import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { context, navigateTo, showToast } from '@devvit/web/client';
import type {
  ChallengeRecord,
  InitResponse,
  LeaderboardResponse,
  RaidState,
  ResultsResponse,
  ShareRequest,
  SharedFight,
} from '../shared/api';
import { getArena, type Arena } from '../shared/game/arenas';
import { simulateBattle, type BattleResult } from '../shared/game/battle';
import { botsForDay } from '../shared/game/bots';
import { bossForDay, simulateRaid } from '../shared/game/boss';
import { FACTIONS, FACTION_IDS, type FactionId } from '../shared/game/factions';
import { DEFAULT_BUILD, validateBuild, type Build, type Tax } from '../shared/game/mech';
import { getPart } from '../shared/game/parts';
import { winsFor } from '../shared/game/tournament';
import { BattleView } from './components/BattleView';
import { PixelMech } from './components/PixelMech';
import { api, countdown } from './lib/api';
import { isMuted, onMuteChange, setMuted, sfx } from './lib/sfx';
import { Garage } from './screens/Garage';
import { Intro } from './screens/Intro';
import { introDone, markIntroDone, tutorialFight } from './lib/intro';
import type { Tip } from './components/BattleView';

type Fight = {
  result: BattleResult;
  builds: [Build, Build];
  labels: [string, string];
  tags: [string, string];
  arena: Arena;
  key: string;
  bossSide?: 0 | 1;
  footer?: ReactNode;
  back: Screen;
  share?: ShareRequest;
  tips?: Tip[];
};
type Screen = 'home' | 'garage' | 'practice' | 'battle' | 'bracket' | 'factions' | 'challenge' | 'intro';

// Local backup of the last build, in case the server copy is missing.
const BACKUP_KEY = 'mechdaily-build';
const loadBackup = (): Build | null => {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? validateBuild(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};
const saveBackup = (b: Build) => {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable */
  }
};

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

const RaidCard = ({
  raid,
  day,
  canAttack,
  busy,
  onAttack,
}: {
  raid: RaidState;
  day: string;
  canAttack: boolean;
  busy: boolean;
  onAttack: () => void;
}) => {
  const boss = bossForDay(day);
  const pct = raid.max > 0 ? raid.hp / raid.max : 0;
  const dead = raid.hp <= 0;
  const blocks = 20;
  const filled = Math.ceil(pct * blocks);
  return (
    <div
      className="sticker p-3"
      style={{ background: dead ? '#e8e2d4' : '#2b2d34', color: dead ? '#1b1a17' : '#efe8da' }}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold opacity-70">DAILY BOSS · EVERYONE vs ONE</div>
        <div className="text-[11px] opacity-70">
          {raid.attemptsLeft} attack{raid.attemptsLeft === 1 ? '' : 's'} left
        </div>
      </div>
      <div className="flex gap-3 items-center mt-1">
        <PixelMech build={boss.build} size={86} bob={!dead} className={dead ? 'opacity-40' : ''} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl leading-none">{boss.title}</div>
          <div className="text-xs mt-1 opacity-80">
            {dead ? `Destroyed. Final blow: u/${raid.killedBy ?? '?'}` : boss.taunt}
          </div>
          <div className="flex gap-[2px] mt-2" aria-label={`Boss HP ${raid.hp} of ${raid.max}`}>
            {Array.from({ length: blocks }, (_, i) => (
              <div
                key={i}
                className="h-3 flex-1"
                style={{ background: i < filled ? (pct > 0.3 ? '#e4572e' : '#ffc914') : 'rgba(239,232,218,0.15)' }}
              />
            ))}
          </div>
          <div className="text-[11px] mt-1 opacity-80">
            {raid.hp.toLocaleString()} / {raid.max.toLocaleString()} HP
            {raid.myDamage > 0 ? ` · you: ${raid.myDamage.toLocaleString()}` : ''}
          </div>
        </div>
      </div>
      {raid.top.length > 0 && (
        <div className="text-[11px] mt-2 opacity-80">
          Top damage:{' '}
          {raid.top
            .slice(0, 3)
            .map((p, i) => `${i + 1}. u/${p.username} ${p.damage.toLocaleString()}`)
            .join(' · ')}
        </div>
      )}
      {!dead && (
        <button
          className="btn bg-rust text-white w-full mt-2"
          disabled={!canAttack || busy || raid.attemptsLeft <= 0}
          onClick={onAttack}
        >
          {!canAttack
            ? 'Log in to attack'
            : raid.attemptsLeft <= 0
              ? 'Out of attacks — back tomorrow'
              : 'Attack the boss'}
        </button>
      )}
    </div>
  );
};

const Header = ({ data }: { data: InitResponse }) => (
  <div className="flex items-end justify-between gap-2">
    <div>
      <div className="font-display font-black text-3xl leading-[0.85] tracking-tight">MECH DAILY</div>
      <div className="text-[11px] text-mute mt-1">
        Day {data.dayNumber} · {data.entryCount} pilot
        {data.entryCount === 1 ? '' : 's'} entered
      </div>
    </div>
    <div className="flex items-center gap-2">
      {data.faction && (
        <span className="tag py-0.5" style={{ background: FACTIONS[data.faction].color }}>
          {FACTIONS[data.faction].name}
        </span>
      )}
      <MuteButton />
    </div>
  </div>
);

const FactionPicker = ({ onPick }: { onPick: (f: FactionId) => void }) => (
  <div className="fixed inset-0 z-20 grid-paper flex flex-col justify-center p-4 gap-3">
    <div className="font-display font-black text-3xl leading-none">Pick a side</div>
    <div className="text-sm">Every match your faction wins adds to its score. You can't switch later.</div>
    {FACTION_IDS.map((id) => {
      const f = FACTIONS[id];
      return (
        <button key={id} className="sticker p-3 text-left flex items-center gap-3" onClick={() => onPick(id)}>
          <div
            className="w-10 h-10 rounded-md border-3"
            style={{
              background: f.color,
              borderWidth: 3,
              borderColor: '#1b1a17',
            }}
          />
          <div>
            <div className="font-display font-black text-xl leading-none">{f.name}</div>
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
  const [chals, setChals] = useState<ChallengeRecord[] | null>(null);
  const [rival, setRival] = useState('');
  const [, setNow] = useState(0);
  const fightCount = useRef(0);
  const loaded = useRef(false);
  const lastSaved = useRef('');

  const load = useCallback(() => {
    api
      .init()
      .then((d) => {
        setData(d);
        setBuild(d.myBuild ?? d.myEntry ?? loadBackup() ?? DEFAULT_BUILD);
        if (!d.myBuild && !d.myEntry && d.profile.entries === 0 && !introDone() && d.postDay === d.day)
          setScreen('intro');
        loaded.current = true;
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  // every button clicks, unless it makes its own sound
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('button, summary') : null;
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

  const arena = useMemo(() => getArena(data?.arenaId ?? 'yard'), [data?.arenaId]);
  const tax: Tax = data?.tax ?? {};
  const isOldPost = data ? data.postDay !== data.day : false;

  const entered = data?.myEntry ? JSON.stringify(data.myEntry) === JSON.stringify(build) : false;

  // Autosave: every change to the mech is saved (debounced) to the server
  // and backed up locally, so it survives refreshes and app updates.
  useEffect(() => {
    if (!loaded.current) return;
    const json = JSON.stringify(build);
    if (json === lastSaved.current) return;
    saveBackup(build);
    const id = setTimeout(() => {
      api
        .save(build)
        .then(() => {
          lastSaved.current = json;
        })
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(id);
  }, [build]);

  const leaveGarage = () => {
    setScreen('home');
    saveBackup(build);
    api.save(build).catch(() => undefined);
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
      showToast(data.myEntry ? 'Entry updated' : `Entered! Streak: ${r.streak} day${r.streak === 1 ? '' : 's'}`);
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
    const result = simulateBattle({ build, tax }, { build: opp, tax }, arena, seed);
    setFight({
      result,
      builds: [build, opp],
      labels: [data?.username ? `u/${data.username}` : 'you', label],
      tags: ['YOU', 'FOE'],
      arena,
      key: seed,
      back: 'practice',
      share: {
        kind: 'duel',
        a: build,
        b: opp,
        aLabel: data?.username ? `u/${data.username}` : 'you',
        bLabel: label,
        arenaId: arena.id,
        seed,
        tax,
      },
    });
    setScreen('battle');
  };

  const attackBoss = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api.raid(build);
      const boss = bossForDay(data.day);
      const result = simulateRaid(data.day, arena, tax, build, r.seed);
      setData({
        ...data,
        raid: {
          ...data.raid,
          hp: r.hp,
          attemptsLeft: Math.max(0, data.raid.attemptsLeft - 1),
          myDamage: data.raid.myDamage + r.damage,
          killedBy: r.lastHit ? data.username : data.raid.killedBy,
        },
      });
      setFight({
        result,
        builds: [build, boss.build],
        labels: [data.username ? `u/${data.username}` : 'you', 'daily boss'],
        tags: ['YOU', 'BOSS'],
        arena,
        key: r.seed,
        bossSide: 1,
        back: 'home',
        share: {
          kind: 'raid',
          a: build,
          b: boss.build,
          aLabel: data.username ? `u/${data.username}` : 'you',
          bLabel: 'daily boss',
          arenaId: arena.id,
          seed: r.seed,
          tax,
          day: data.day,
        },
        footer: (
          <>
            <div className="font-display text-2xl leading-none stamp" style={{ color: '#c0392b' }}>
              {r.lastHit ? 'FINAL BLOW!' : `${r.damage.toLocaleString()} damage`}
            </div>
            <div className="text-xs mt-2 text-mute">
              {r.lastHit
                ? `You took down ${boss.title}. Your faction gets the credit.`
                : `${boss.title} has ${r.hp.toLocaleString()} HP left. Everyone's hits add up.`}
            </div>
          </>
        ),
      });
      setScreen('battle');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Attack failed');
    } finally {
      setBusy(false);
    }
  };

  /** Shoot at a target dummy that never fires back, to see what your weapons do. */
  const testFire = () => {
    fightCount.current += 1;
    const dummy: Build = {
      name: 'Target Dummy',
      parts: { ...DEFAULT_BUILD.parts, legs: 'l-strider', core: 'c-ox', booster: 'b-puff', chip: 'p-kite' },
      paint: { body: 6, trim: 1, decal: 0 },
    };
    const seed = `test:${fightCount.current}:${JSON.stringify(build.parts)}`;
    const result = simulateBattle({ build, tax }, { build: dummy, tax, mods: { passive: true, hp: 1.4 } }, arena, seed);
    setFight({
      result,
      builds: [build, dummy],
      labels: ['test fire', 'never shoots back'],
      tags: ['YOU', 'DUMMY'],
      arena,
      key: seed,
      back: 'garage',
    });
    setScreen('battle');
  };

  const replayShared = (f: SharedFight) => {
    const ar = getArena(f.arenaId);
    const result =
      f.kind === 'raid' && f.day
        ? simulateRaid(f.day, ar, f.tax, f.a, f.seed)
        : simulateBattle({ build: f.a, tax: f.tax }, { build: f.b, tax: f.tax }, ar, f.seed);
    const me = data?.username ? `u/${data.username}` : null;
    setFight({
      result,
      builds: [f.a, f.b],
      labels: [f.aLabel, f.bLabel],
      tags: [f.aLabel === me ? 'YOU' : 'A', f.kind === 'raid' ? 'BOSS' : f.bLabel === me ? 'YOU' : 'B'],
      arena: ar,
      key: `reel:${f.id}`,
      ...(f.kind === 'raid' ? { bossSide: 1 as const } : {}),
      back: 'home',
    });
    setScreen('battle');
  };

  const startTutorial = () => {
    const t = tutorialFight(build);
    setFight({
      result: t.result,
      builds: t.builds,
      labels: ['your mech', 'training bot'],
      tags: ['YOU', 'FOE'],
      arena: t.arena,
      key: `tutorial:${fightCount.current++}`,
      back: 'garage',
      tips: t.tips,
      footer: (
        <>
          <div className="font-display text-2xl leading-none stamp" style={{ color: '#2f7d1f' }}>
            That's the whole game.
          </div>
          <div className="text-sm mt-2">
            Now build your own. Every part changes how your mech fights. Enter before midnight UTC and watch the
            bracket.
          </div>
        </>
      ),
    });
    setScreen('battle');
  };

  const shareFight = async (req: ShareRequest) => {
    const r = await api.share(req);
    if (data) setData({ ...data, reel: [r.fight, ...data.reel] });
    showToast(`Posted to the comments · ${r.left} share${r.left === 1 ? '' : 's'} left today`);
  };

  const watchChallenge = (c: ChallengeRecord) => {
    const ar = getArena(c.arenaId);
    const result = simulateBattle({ build: c.aBuild, tax }, { build: c.bBuild, tax }, ar, c.seed);
    const me = data?.username;
    setFight({
      result,
      builds: [c.aBuild, c.bBuild],
      labels: [`u/${c.aPilot}`, `u/${c.bPilot}`],
      tags: [c.aPilot === me ? 'YOU' : 'A', c.bPilot === me ? 'YOU' : 'B'],
      arena: ar,
      key: c.seed,
      back: 'challenge',
      share: {
        kind: 'duel',
        a: c.aBuild,
        b: c.bBuild,
        aLabel: `u/${c.aPilot}`,
        bLabel: `u/${c.bPilot}`,
        arenaId: c.arenaId,
        seed: c.seed,
        tax,
      },
    });
    setScreen('battle');
  };

  const openChallenges = async (prefill?: string) => {
    if (prefill !== undefined) setRival(prefill);
    setScreen('challenge');
    try {
      setChals((await api.challenges()).list);
    } catch {
      setChals([]);
    }
  };

  const sendChallenge = async () => {
    if (!rival.trim()) return;
    setBusy(true);
    try {
      const r = await api.challenge(rival, build);
      setChals((prev) => [r.record, ...(prev ?? [])]);
      showToast(`${r.left} challenge${r.left === 1 ? '' : 's'} left today`);
      watchChallenge(r.record);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Challenge failed');
    } finally {
      setBusy(false);
    }
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

        {screen === 'intro' && (
          <Intro
            onWatch={startTutorial}
            onSkip={() => {
              markIntroDone();
              setScreen('home');
            }}
          />
        )}

        {screen === 'home' && (
          <>
            <Header data={data} />

            {isOldPost && (
              <div className="sticker p-3 bg-sun flex flex-col gap-2" style={{ background: '#ffe08a' }}>
                <div className="text-sm">This is Day {data.postDayNumber}'s post. Its bracket is done.</div>
                <div className="flex gap-2">
                  <button className="btn bg-card flex-1 text-sm" onClick={() => void openBracket(data.postDay)}>
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
                <div className="text-[11px] font-semibold text-mute">TODAY'S ARENA</div>
                <div className="text-[11px]">bracket in {countdown(data.nextRolloverIso)}</div>
              </div>
              <div className="font-display font-black text-2xl leading-none mt-1">{arena.name}</div>
              <div className="text-sm mt-1">{arena.blurb}</div>
              {Object.keys(tax).length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-mute mb-1">TOO POPULAR YESTERDAY — HEAVIER TODAY</div>
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
                  <div className="font-display font-black text-xl leading-none truncate">{build.name}</div>
                  <div className="text-[11px] text-mute">
                    {getPart(build.parts.chip).name} pilot · {getPart(build.parts.legs).name} legs
                  </div>
                </div>
                <button className="btn bg-card text-sm" onClick={() => setScreen('garage')}>
                  Garage
                </button>
                <button className="btn bg-teal text-sm" onClick={() => setScreen('practice')}>
                  Practice fight
                </button>
                <button className="btn bg-sun text-sm" onClick={() => void openChallenges()}>
                  Challenge a redditor
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
                🔥 {data.profile.streak}-day streak · {data.profile.wins} match wins total
                {data.profile.titles > 0 ? ` · 🏆×${data.profile.titles}` : ''}
              </div>
            )}

            {!isOldPost && (
              <RaidCard
                raid={data.raid}
                day={data.day}
                canAttack={!!data.username}
                busy={busy}
                onAttack={() => void attackBoss()}
              />
            )}

            {data.reel.length > 0 && <FightReel reel={data.reel} onWatch={replayShared} />}

            {data.last && (
              <div className="sticker p-3">
                <div className="text-[11px] font-semibold text-mute">DAY {data.last.dayNumber} RESULT</div>
                <div className="font-display font-black text-xl leading-none mt-1">🏆 {data.last.championName}</div>
                <div className="text-xs">
                  {data.last.championPilot ? `piloted by u/${data.last.championPilot}` : 'a house bot took it'}
                </div>
                {data.last.mine && (
                  <div className="text-sm mt-2">
                    {data.last.mine.champion
                      ? 'That was you. Champion!'
                      : `You won ${data.last.mine.wins} match${data.last.mine.wins === 1 ? '' : 'es'} out of ${data.last.mine.rounds} rounds.`}
                  </div>
                )}
                <button className="btn bg-card text-sm w-full mt-2" onClick={() => void openBracket(data.last!.day)}>
                  Watch the bracket
                </button>
              </div>
            )}

            <button className="sticker p-3 text-left" onClick={() => void openFactions()}>
              <div className="flex justify-between text-[11px] font-semibold text-mute mb-2">
                <span>FACTION WAR</span>
                <span>leaderboard →</span>
              </div>
              <FactionBars totals={data.factionTotals} />
            </button>

            <details className="sticker p-3 text-xs">
              <summary className="font-display font-black text-lg cursor-pointer">How it works</summary>
              <ol className="list-decimal pl-4 mt-2 flex flex-col gap-1">
                <li>Build a mech in the garage. 10 slots, every part has a trade-off.</li>
                <li>Check today's arena. Fog, mud, heat… the best build changes daily.</li>
                <li>Practice against sparring bots and past champions.</li>
                <li>Enter. At 00:00 UTC every entry fights in an automatic bracket.</li>
                <li>Parts that were too popular get heavier the next day. Don't copy the meta.</li>
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
            onBack={leaveGarage}
            onTestFire={testFire}
          />
        )}

        {screen === 'practice' && (
          <>
            <div className="flex items-center gap-2">
              <button className="btn bg-card text-sm" onClick={() => setScreen('home')}>
                ← Back
              </button>
              <div className="font-display font-black text-2xl">Practice</div>
            </div>
            <div className="text-xs">Fights happen in today's arena: {arena.name}. Nothing here counts.</div>
            <div className="text-[11px] font-semibold text-mute">SPARRING BOTS</div>
            {sparring.map((b, i) => (
              <button
                key={i}
                className="sticker p-2 flex items-center gap-3 text-left"
                onClick={() => practice(b, 'sparring bot')}
              >
                <PixelMech build={b} size={56} />
                <div className="flex-1">
                  <div className="font-display font-black text-lg leading-none">{b.name}</div>
                  <div className="text-[11px] text-mute">
                    {getPart(b.parts.chip).name} · {getPart(b.parts.weaponR).name} + {getPart(b.parts.back).name}
                  </div>
                </div>
                <span className="font-display font-black">FIGHT →</span>
              </button>
            ))}
            {data.champions.length > 0 && (
              <div className="text-[11px] font-semibold text-mute mt-2">PAST CHAMPIONS</div>
            )}
            {data.champions.slice(0, 5).map((c) => (
              <button
                key={c.day}
                className="sticker p-2 flex items-center gap-3 text-left"
                onClick={() => practice(c.build, `Day ${c.dayNumber} champ`)}
              >
                <PixelMech build={c.build} size={56} />
                <div className="flex-1">
                  <div className="font-display font-black text-lg leading-none">🏆 {c.name}</div>
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
            bossSide={fight.bossSide ?? null}
            footer={fight.footer}
            tips={fight.tips}
            actions={fight.share && data.username ? <ShareButton req={fight.share} onShare={shareFight} /> : null}
            onDone={() => {
              if (fight.tips) markIntroDone();
              setScreen(fight.back);
            }}
          />
        )}

        {screen === 'bracket' && (
          <>
            <div className="flex items-center gap-2">
              <button className="btn bg-card text-sm" onClick={() => setScreen('home')}>
                ← Back
              </button>
              <div className="font-display font-black text-2xl">
                {results ? `Day ${results.dayNumber} bracket` : 'Loading…'}
              </div>
            </div>
            {results && (
              <Bracket res={results} username={data.username} onWatch={setFight} onShow={() => setScreen('battle')} />
            )}
          </>
        )}

        {screen === 'challenge' && (
          <>
            <div className="flex items-center gap-2">
              <button className="btn bg-card text-sm" onClick={() => setScreen('home')}>
                ← Back
              </button>
              <div className="font-display text-2xl">Challenges</div>
            </div>
            <div className="sticker p-3 flex flex-col gap-2">
              <div className="text-xs">
                Fight another pilot's mech in today's arena ({arena.name}). The result gets posted in the comments so
                they'll see it. 5 per day.
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 border-ink bg-white px-2 py-1 text-sm"
                  style={{ borderWidth: 3, borderStyle: 'solid' }}
                  placeholder="u/username"
                  value={rival}
                  onChange={(e) => setRival(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendChallenge();
                  }}
                  aria-label="Username to challenge"
                />
                <button
                  className="btn bg-rust text-white text-sm"
                  disabled={busy || !data.username || !rival.trim()}
                  onClick={() => void sendChallenge()}
                >
                  Fight
                </button>
              </div>
              {(data.profile.chalWins > 0 || data.profile.chalLosses > 0) && (
                <div className="text-[11px] text-mute">
                  Your record: {data.profile.chalWins}W – {data.profile.chalLosses}L
                </div>
              )}
            </div>
            <div className="text-[11px] font-semibold text-mute">TODAY'S CHALLENGES</div>
            {!chals && <div className="text-xs">Loading…</div>}
            {chals && chals.length === 0 && <div className="text-xs">No challenges yet today. Start some drama.</div>}
            {chals?.map((c) => (
              <button
                key={c.seed}
                className="sticker px-2 py-1.5 flex items-center gap-2 text-left text-sm"
                onClick={() => watchChallenge(c)}
              >
                <PixelMech build={c.aBuild} size={34} />
                <span className={`flex-1 truncate ${c.winner === 0 ? 'font-semibold' : 'text-mute'}`}>
                  u/{c.aPilot}
                </span>
                <span className="text-[10px]">vs</span>
                <span className={`flex-1 truncate text-right ${c.winner === 1 ? 'font-semibold' : 'text-mute'}`}>
                  u/{c.bPilot}
                </span>
                <PixelMech build={c.bBuild} size={34} flip />
                <span className="font-display">▶</span>
              </button>
            ))}
          </>
        )}

        {screen === 'factions' && (
          <>
            <div className="flex items-center gap-2">
              <button className="btn bg-card text-sm" onClick={() => setScreen('home')}>
                ← Back
              </button>
              <div className="font-display font-black text-2xl">Faction war</div>
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">ALL-TIME POINTS</div>
              <FactionBars totals={data.factionTotals} />
              <div className="text-[11px] text-mute mt-2">+1 for entering, +2 per match won, +5 for the champion.</div>
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">ENTERED TODAY</div>
              <FactionBars totals={data.factionToday} />
            </div>
            <div className="sticker p-3">
              <div className="text-[11px] font-semibold text-mute mb-2">TOP PILOTS (MATCH WINS)</div>
              {!board && <div className="text-xs">Loading…</div>}
              {board && board.pilots.length === 0 && <div className="text-xs">No winners yet. Be the first.</div>}
              {board?.pilots.map((p, i) => (
                <div key={p.username} className="flex justify-between items-center gap-2 text-sm py-0.5">
                  <span className="flex-1 truncate">
                    {i + 1}. u/{p.username}
                  </span>
                  <span className="font-semibold">{p.wins}</span>
                  {p.username !== data.username && (
                    <button className="tag bg-sun py-0.5" onClick={() => void openChallenges(p.username)}>
                      ⚔ fight
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ShareButton = ({ req, onShare }: { req: ShareRequest; onShare: (r: ShareRequest) => Promise<void> }) => {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <button
      className="btn bg-teal mt-3 w-full"
      disabled={state !== 'idle'}
      onClick={() => {
        setState('busy');
        onShare(req)
          .then(() => setState('done'))
          .catch((e: unknown) => {
            showToast(e instanceof Error ? e.message : 'Could not share');
            setState('idle');
          });
      }}
    >
      {state === 'done'
        ? '✓ Shared to comments'
        : state === 'busy'
          ? 'Posting…'
          : '🎬 Share this fight to the comments'}
    </button>
  );
};

const FightReel = ({ reel, onWatch }: { reel: SharedFight[]; onWatch: (f: SharedFight) => void }) => (
  <div className="sticker p-3">
    <div className="text-[11px] font-semibold text-mute mb-2">🎬 FIGHT REEL · shared by redditors</div>
    <div className="flex flex-col gap-1.5">
      {reel.slice(0, 6).map((f) => (
        <button
          key={f.id}
          className="sticker px-2 py-1.5 flex items-center gap-2 text-left text-sm"
          onClick={() => onWatch(f)}
        >
          <PixelMech build={f.a} size={28} />
          <span className="flex-1 min-w-0">
            <span className="block truncate font-semibold">{f.headline}</span>
            <span className="block text-[10px] text-mute">shared by u/{f.by}</span>
          </span>
          <span className="font-display font-black">▶</span>
        </button>
      ))}
    </div>
  </div>
);

const ROUND_NAME = (fromEnd: number, total: number) =>
  fromEnd === 0 ? 'Final' : fromEnd === 1 ? 'Semifinals' : fromEnd === 2 ? 'Quarterfinals' : `Round ${total - fromEnd}`;

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
    const result = simulateBattle({ build: ea.build, tax: t.tax }, { build: eb.build, tax: t.tax }, arena, seed);
    onWatch({
      result,
      builds: [ea.build, eb.build],
      labels: [label(a), label(b)],
      tags: ['A', 'B'],
      arena,
      key: seed,
      back: 'bracket',
      share: {
        kind: 'duel',
        a: ea.build,
        b: eb.build,
        aLabel: label(a),
        bLabel: label(b),
        arenaId: arena.id,
        seed,
        tax: t.tax,
      },
    });
    onShow();
  };
  const humans = t.entrants.filter((e) => !e.bot).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="sticker p-3 flex gap-3 items-center">
        <PixelMech build={champ.build} size={90} />
        <div>
          <div className="text-[11px] font-semibold text-mute">CHAMPION · {arena.name.toUpperCase()}</div>
          <div className="font-display font-black text-2xl leading-none">🏆 {champ.build.name}</div>
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
        const shown = round.filter((m) => fromEnd <= 2 || m.a === me || m.b === me);
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
                  <span className={`flex-1 truncate ${m.w === m.a ? 'font-semibold' : 'text-mute line-through'}`}>
                    {t.entrants[m.a]!.build.name}
                    {!t.entrants[m.a]!.bot && (
                      <span className="block text-[10px] font-normal no-underline">u/{t.entrants[m.a]!.pilot}</span>
                    )}
                  </span>
                  <span className="text-[10px]">vs</span>
                  <span
                    className={`flex-1 truncate text-right ${m.w === m.b ? 'font-semibold' : 'text-mute line-through'}`}
                  >
                    {t.entrants[m.b]!.build.name}
                    {!t.entrants[m.b]!.bot && (
                      <span className="block text-[10px] font-normal no-underline">u/{t.entrants[m.b]!.pilot}</span>
                    )}
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
