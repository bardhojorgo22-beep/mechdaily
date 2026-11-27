# Mech Daily

**Build a mech. It fights on its own. Every midnight the whole subreddit's mechs battle in one bracket.**

Mech Daily is a daily auto-battler for Reddit, built on Devvit Web. You never control your mech in a fight. You design it in the garage from 10 parts, and its pilot decides the rest: what range to fight at, when to dodge, when to charge. The game is in the building, and the fun is watching what you built pull it off.

## How to play

1. **Open today's post** and build a mech in the garage. There are 10 slots (head, core, arms, legs, booster, generator, right hand, left hand, back, pilot chip) and 78 parts. Every part is a trade-off: weight, power, heat, range, armor.
2. **Check today's arena.** It rotates daily (Fog Bank, Mudflats, Narrow Alley, Low Gravity…), and each one changes what works.
3. **Practice** against Easy, Medium and Hard bots, or past champions. Use **🎯 Test fire** to see what a weapon actually does.
4. **Enter the bracket.** At 00:00 UTC every entry fights in an automatic single-elimination tournament. The results get posted in the comments, the champion gets flair, and a new day starts with a new post.
5. **Hit the daily boss** with everyone in the sub. Your faction gets credit for the damage.
6. **Challenge another redditor** by name. The fight is posted in the comments so they see it.

## What makes it different

- **Hidden synergies.** 31 odd part combos secretly work together: 21 pairs, 5 pilot-chip combos and 5 legendary 3-part combos. **The first redditor in each subreddit to equip one gets credited by name in the comments.** The garage shows riddle hints for the ones nobody has found yet.
- **No fixed meta.** Parts that were too popular yesterday get heavier today. The arena changes daily. Every part sits between roughly 45% and 55% win rate (checked with tens of thousands of simulated fights).
- **Fights worth watching.** Weighty mech movement (circle-strafing, quick-boost dodges, overboost charges), visible wind-ups, per-weapon sounds, hit-stop, slow-mo highlights, a Last Stand where a mech can survive a killing blow at 1 HP, and Sudden Death so stalemates end.
- **Built for a subreddit.** Three factions compete every day. The Fight Reel lets anyone share a great fight to the comments. Build titles ("Hunter Hit & Run", "Magnetic Tank") show up everywhere, so unusual builds get noticed.
- **Fair replays.** Battles are deterministic: the server stores only seeds and results, and every client replays exactly the same fight.

## Tech

- **Devvit Web**: React 19 + Tailwind 4 client, Hono server, Redis per subreddit, a scheduler cron for the daily rollover, comments, flair and custom posts through the Reddit API.
- **Deterministic battle sim** in `src/shared/game/battle.ts`, shared by client and server.
- **Pixel-art renderer** in `src/client/lib/arenaRenderer.ts`: SVG mech parts rasterized to layered low-res sprites, a canvas arena with particles, camera and highlights. WebAudio synth for all sounds (no audio files).

## Development

Requires Node 24+.

```
npm install
npm run dev        # playtest on your dev subreddit
npm run test:unit  # sim tests
npm run test:loop  # full daily loop against a mocked Reddit + Redis
npm run audit      # balance audit: part win rates, meta search, degenerate fights
npm run deploy     # upload a new version
```

Moderators get two menu items on the subreddit: **Mech Daily: open today's post** and **Mech Daily: run tournament now** (ends the current day early, handy for testing).
