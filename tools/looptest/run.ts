import { api } from '../../src/server/routes/api';
import { menu } from '../../src/server/routes/menu';
import { context, log, failures } from '@devvit/web/server';
import { DEFAULT_BUILD } from '../../src/shared/game/mech';

let fails = 0;
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) fails++;
};
const as = (u: string | null, post?: string) => {
  context.userId = u ? `t2_${u}` : undefined;
  context.username = u ?? undefined;
  context.postId = post;
};
const req = async (path: string, body?: unknown) => {
  const r = await api.request(
    path,
    body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
  );
  return { status: r.status, json: (await r.json()) as any };
};
const build = (name: string, over: Record<string, string> = {}) => ({
  ...DEFAULT_BUILD,
  name,
  parts: { ...DEFAULT_BUILD.parts, ...over },
});

// 1. mod creates today's post
as('joani');
const mc = await menu.request('/post-create', { method: 'POST' });
const mcj: any = await mc.json();
check(
  mc.status === 200 && /comments\/t3_post1/.test(mcj.navigateTo),
  `mod menu creates post (${mcj.navigateTo ?? mcj.showToast})`
);
const post1 = 't3_post1';

// 2. three players: init, faction, save, enter, raid, challenge
const players = [
  ['joani', 'foundry', { weaponR: 'r-lance', weaponL: 'lw-flamer' }],
  ['friend1', 'tide', { weaponR: 'r-rail' }],
  ['friend2', 'static', {}],
] as const;
for (const [u, f, over] of players) {
  as(u, post1);
  const init = await req('/init');
  check(init.status === 200 && init.json.dayNumber === 1, `${u}: init day 1 (status ${init.status})`);
  check((await req('/faction', { faction: f })).status === 200, `${u}: joins ${f}`);
  const b = build(`${u}'s mech`, over);
  check((await req('/save', { build: b })).status === 200, `${u}: saves build`);
  const e = await req('/enter', { build: b });
  check(e.status === 200, `${u}: enters (entries now ${e.json.entryCount})`);
  const r = await req('/raid', { build: b });
  check(r.status === 200 && r.json.damage >= 0, `${u}: hits boss for ${r.json.damage} (hp ${r.json.hp}/${r.json.max})`);
}
as('friend1', post1);
const ch = await req('/challenge', { build: build("friend1's mech", { weaponR: 'r-rail' }), username: 'u/joani' });
check(ch.status === 200, `friend1 challenges joani (${ch.json.record?.winner ?? ch.json.message})`);
check(
  log.some((l) => l.startsWith(`COMMENT on ${post1}`)),
  "challenge comment posted on today's post"
);
const chs = await req('/challenges');
check(chs.json.list?.length === 1, `challenges list has 1 entry`);
// sharing: server re-simulates and comments
const sh = await req('/share', {
  kind: 'duel',
  a: build('Share A'),
  b: build('Share B', { weaponR: 'r-rail' }),
  aLabel: 'u/friend1',
  bLabel: 'u/someoneelse',
  arenaId: 'yard',
  seed: 'share-1',
  tax: {},
});
check(
  sh.status === 200 && /beat/.test(sh.json.fight?.headline),
  `friend1 shares a fight: "${sh.json.fight?.headline ?? sh.json.message}"`
);
const shareComment = log.find((l) => l.includes('shared a fight'));
check(shareComment && !shareComment.includes('u/someoneelse'), 'share comment posted, no stray u/ pings');
check(
  (await req('/share', { kind: 'duel', a: { junk: 1 }, b: build('x'), arenaId: 'yard', seed: 's', tax: {} })).status ===
    400,
  'junk share rejected'
);
const sr = await req('/share', {
  kind: 'raid',
  a: build('Raider'),
  aLabel: 'u/friend1',
  arenaId: 'yard',
  seed: 'raid-share',
  tax: {},
  day: '2026-11-26',
});
check(
  sr.status === 200 && /damage/.test(sr.json.fight?.headline),
  `raid share: "${sr.json.fight?.headline ?? sr.json.message}"`
);
check((await req('/init')).json.reel?.length === 2, 'fight reel shows both shares');
// hidden synergies: first to equip gets credit + a comment, second gets nothing new
as('joani', post1);
const hunter = build('Hunter', { weaponR: 'r-bow', weaponL: 'lw-knuckle' });
const d1 = await req('/save', { build: hunter });
check(
  JSON.stringify(d1.json.discovered) === '["hunter"]',
  `joani discovers Hunter (${JSON.stringify(d1.json.discovered)})`
);
check(
  log.some((l) => l.includes('Hidden synergy discovered') && l.includes('u/joani') && l.includes('Hunter')),
  'discovery announced in comments'
);
as('friend2', post1);
const d2 = await req('/save', { build: hunter });
check(d2.json.discovered?.length === 0, 'second finder gets no credit');
check((await req('/init')).json.synergiesFound?.hunter?.by === 'joani', 'init shows Hunter found by joani');
const d3 = await req('/enter', { build: build('Knight', { weaponR: 'r-lance', weaponL: 'lw-door' }) });
check(JSON.stringify(d3.json.discovered) === '["knight"]', 'entering with a new combo also discovers it');
as('joani', post1);
const re = await req('/enter', { build: build('joani v2') });
check(
  re.status === 200 && re.json.entryCount === 3,
  `re-entering updates, doesn't duplicate (count ${re.json.entryCount})`
);
as(null, post1);
check((await req('/enter', { build: build('x') })).status === 401, 'logged-out user cannot enter');
check((await req('/init')).status === 200, 'logged-out user can still load');

// 3. mod runs the tournament
as('joani', post1);
const rt = await menu.request('/run-tournament', { method: 'POST' });
const rtj: any = await rt.json();
check(rt.status === 200, `run tournament: ${rtj.showToast}`);
check(
  log.some((l) => l.startsWith('POST t3_post2')),
  'Day 2 post created'
);
const results = log.find((l) => l.startsWith(`COMMENT on ${post1}`) && l.includes('results'));
check(results, 'results comment on Day 1 post');
check(log.includes('  (distinguished)'), 'results comment distinguished');

// 4. day 2 state
as('friend2', 't3_post2');
const i2 = await req('/init');
check(i2.json.dayNumber === 2 && i2.json.postDay === i2.json.day, `day 2 loads on new post (day ${i2.json.dayNumber})`);
check(i2.json.myEntry === null, 'nobody entered day 2 yet');
check(
  i2.json.champions?.length === 1,
  `champion recorded: ${i2.json.champions?.[0]?.name} by u/${i2.json.champions?.[0]?.pilot}`
);
check(i2.json.last, `friend2 sees yesterday's result: ${JSON.stringify(i2.json.last)?.slice(0, 120)}`);
check(i2.json.raid?.attemptsLeft > 0, `boss reset for day 2 (${i2.json.raid?.bossId}, hp ${i2.json.raid?.hp})`);
const yday = await req(`/results/${i2.json.champions[0].day}`);
check(
  yday.status === 200 && yday.json.result?.rounds?.length > 0,
  `bracket replay data for day 1 (${yday.json.result?.rounds?.length} rounds, ${yday.json.result?.entrants?.length} entrants)`
);
as('friend2', post1);
const old = await req('/init');
check(
  old.json.postDay !== old.json.day && old.json.postDayNumber === 1,
  'opening the old Day 1 post knows it is day 1'
);
const lb = await req('/leaderboard');
check(lb.status === 200, `leaderboard: ${JSON.stringify(lb.json.pilots).slice(0, 100)}`);

// 5. pressing the mod button again ends day 2 (it always ends the *current* day)
as('joani', 't3_post2');
const again: any = await (await menu.request('/run-tournament', { method: 'POST' })).json();
check(/Day 2 done/.test(again.showToast), `second press ends day 2: ${again.showToast}`);
check(
  log.some((l) => l.startsWith('POST t3_post3')),
  'Day 3 post created'
);

// 6. a stray post opened on a day that already has a post just shows today, without stealing it
as('joani', 't3_orphan');
const orphan = await req('/init');
check(
  orphan.json.postDay === orphan.json.day && orphan.json.todayPostId === 't3_post3',
  'stray post shows today, real post kept'
);

// 7. Reddit refuses the new day's post: the day still advances, and the post gets made on the next visit
as('joani', 't3_post3');
failures.post = 1;
const rl: any = await (await menu.request('/run-tournament', { method: 'POST' })).json();
check(/New post failed/.test(rl.showToast), `rollover survives a refused post: ${rl.showToast}`);
const posts = log.filter((l) => l.startsWith('POST ')).length;
as('friend1', 't3_post3');
await req('/init');
check(
  log.filter((l) => l.startsWith('POST ')).length === posts + 1,
  'missing post is created when someone opens the game'
);

// 8. a crash mid-tournament must not lock the day forever
failures.setKeyPrefix = 'results:';
const crash: any = await (await menu.request('/run-tournament', { method: 'POST' })).json();
check(/failed/i.test(crash.showToast), `crash reported: ${crash.showToast}`);
const retry: any = await (await menu.request('/run-tournament', { method: 'POST' })).json();
check(
  /done/.test(retry.showToast) && !/already/.test(retry.showToast),
  `pressing again works after a crash: ${retry.showToast}`
);

console.log('\n── what Reddit would see ──');
for (const l of log) console.log(l);
console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASSED'}`);
process.exit(fails ? 1 : 0);
