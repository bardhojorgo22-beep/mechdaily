import { DEFAULT_BUILD } from '../../src/shared/game/mech';
import { botsForDay } from '../../src/shared/game/bots';
import { runTournament } from '../../src/shared/game/tournament';
import { getArena } from '../../src/shared/game/arenas';

const day = '2026-11-27';
const champs = botsForDay('champs', 3);
const t = runTournament('2026-11-26', getArena('fog'), {}, [
  {
    id: 'u1',
    pilot: 'DunhillGri',
    faction: 'tide',
    build: { ...DEFAULT_BUILD, name: 'Kettle Prime' },
    bot: false,
  },
]);
const init = {
  type: 'init',
  username: 'DunhillGri',
  day,
  dayNumber: 2,
  postDay: day,
  postDayNumber: 2,
  todayPostId: 't3_abc',
  arenaId: 'mud',
  nextRolloverIso: new Date(Date.now() + 5 * 3600e3).toISOString(),
  tax: { 'r-scatter': 0.4, 'l-hopper': 0.25, 'p-rush': 0.2 },
  myBuild: null,
  myEntry: null,
  entryCount: 14,
  faction: new URLSearchParams(location.search).has('nofaction') ? null : 'tide',
  factionTotals: { foundry: 42, tide: 57, static: 31 },
  factionToday: { foundry: 5, tide: 6, static: 3 },
  profile: {
    entries: new URLSearchParams(location.search).has('new') ? 0 : 3,
    wins: 5,
    titles: 0,
    streak: 3,
    bestStreak: 3,
    chalWins: 2,
    chalLosses: 1,
  },
  champions: champs.map((b, i) => ({
    day: `2026-11-2${i}`,
    dayNumber: 1 - i,
    name: b.name,
    pilot: i ? '' : 'someone',
    build: b,
  })),
  raid: {
    bossId: 'x',
    hp: 61200,
    max: 88000,
    killedBy: null,
    attemptsLeft: 2,
    myDamage: 4120,
    top: [
      { username: 'DunhillGri', damage: 4120 },
      { username: 'other', damage: 3300 },
    ],
    factions: { foundry: 1000, tide: 4120, static: 0 },
  },
  hangar: [],
  synergiesFound: { hunter: { by: 'DunhillGri', day: '2026-11-26' }, ghost: { by: 'someone', day: '2026-11-25' } },
  reel: [
    {
      id: '2',
      kind: 'duel',
      a: { ...DEFAULT_BUILD, name: 'Kettle Prime' },
      b: champs[0],
      aLabel: 'u/DunhillGri',
      bLabel: 'bot',
      arenaId: 'mud',
      seed: 'reel-a',
      tax: {},
      by: 'DunhillGri',
      at: 1,
      headline: 'Kettle Prime beat ' + champs[0]!.name + ' FROM 1 HP',
    },
    {
      id: '1',
      kind: 'duel',
      a: champs[1],
      b: champs[2],
      aLabel: 'u/someone',
      bLabel: 'bot',
      arenaId: 'yard',
      seed: 'reel-b',
      tax: {},
      by: 'someone',
      at: 0,
      headline: champs[1]!.name + ' beat ' + champs[2]!.name + ' FLAWLESS',
    },
  ],
  last: {
    day: '2026-11-26',
    dayNumber: 1,
    postId: 't3_old',
    championName: t.entrants[t.champion]!.build.name,
    championPilot: '',
    mine: { wins: 1, rounds: 3, champion: false },
  },
};
const realFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, initArg?: RequestInit) => {
  const url = String(input);
  const json = (d: unknown) =>
    new Response(JSON.stringify(d), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url.startsWith('/api/init')) return json(init);
  if (url.startsWith('/api/results')) return json({ type: 'results', dayNumber: 1, result: t });
  if (url.startsWith('/api/leaderboard'))
    return json({
      type: 'leaderboard',
      pilots: [
        { username: 'DunhillGri', wins: 5 },
        { username: 'other', wins: 3 },
      ],
    });
  if (url.startsWith('/api/challenges'))
    return json({
      type: 'challenges',
      list: [
        {
          seed: 'c1',
          arenaId: 'mud',
          aPilot: 'DunhillGri',
          bPilot: 'other',
          aBuild: { ...DEFAULT_BUILD, name: 'Kettle Prime' },
          bBuild: champs[0],
          winner: 0,
          at: 1,
        },
        {
          seed: 'c2',
          arenaId: 'mud',
          aPilot: 'someone',
          bPilot: 'DunhillGri',
          aBuild: champs[1],
          bBuild: { ...DEFAULT_BUILD, name: 'Kettle Prime' },
          winner: 0,
          at: 2,
        },
      ],
    });
  if (url.startsWith('/api/hangar')) {
    const body: unknown = JSON.parse(typeof initArg?.body === 'string' ? initArg.body : '{}');
    const hangar: unknown = body && typeof body === 'object' ? Reflect.get(body, 'hangar') : [];
    return json({ type: 'hangar', hangar });
  }
  if (url.startsWith('/api/share'))
    return json({ type: 'share', left: 4, fight: { ...init.reel[0], id: '3', headline: 'just shared' } });
  if (url.startsWith('/api/raid'))
    return json({
      type: 'raid',
      seed: 'raid:2026-11-27:u1:2',
      attempt: 2,
      damage: 3870,
      hp: 57330,
      max: 88000,
      lastHit: false,
    });
  if (url.startsWith('/api/')) return json({ ok: true, entryCount: 15, streak: 4, faction: 'tide', discovered: [] });
  return realFetch(input, initArg);
};
