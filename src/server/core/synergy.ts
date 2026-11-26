import { context, reddit, redis } from '@devvit/web/server';
import type { Build } from '../../shared/game/mech';
import { getPart } from '../../shared/game/parts';
import { SYNERGIES, SYNERGY_IDS, synergiesOf, type SynergyId } from '../../shared/game/synergies';
import { dayPost, parseJson } from './state';

export type FoundSynergy = { by: string; day: string };
const KEY = 'syn:found'; // hash: synergy id -> {by, day}

export const getFound = async (): Promise<Partial<Record<SynergyId, FoundSynergy>>> => {
  const raw = await redis.hGetAll(KEY);
  const out: Partial<Record<SynergyId, FoundSynergy>> = {};
  for (const id of SYNERGY_IDS) {
    const v = parseJson(raw[id]);
    if (typeof v !== 'object' || v === null) continue;
    const by = Reflect.get(v, 'by');
    const day = Reflect.get(v, 'day');
    if (typeof by === 'string' && typeof day === 'string') out[id] = { by, day };
  }
  return out;
};

/** First redditor in this sub to equip a combo gets the credit, announced in the comments. */
export const discover = async (build: Build, username: string, day: string): Promise<SynergyId[]> => {
  const fresh: SynergyId[] = [];
  for (const id of synergiesOf(build.parts)) {
    const won = await redis.hSetNX(KEY, id, JSON.stringify({ by: username, day }));
    if (won) fresh.push(id);
  }
  if (fresh.length === 0) return fresh;
  const total = Object.keys(await redis.hGetAll(KEY)).length;
  const target = context.postId ?? (await dayPost(day));
  if (target && target.startsWith('t3_')) {
    for (const id of fresh) {
      const s = SYNERGIES[id];
      const text = [
        `🔓 **Hidden synergy discovered!**`,
        ``,
        `u/${username} found **${s.name}**: ${s.parts.map((p) => getPart(p).name).join(' + ')}.`,
        ``,
        `> ${s.effect}`,
        ``,
        `${total} of ${SYNERGY_IDS.length} synergies found in r/${context.subredditName ?? 'this sub'}. The rest are still hidden. Check the garage for hints.`,
      ].join('\n');
      try {
        const tid: `t3_${string}` = `t3_${target.slice(3)}`;
        await reddit.submitComment({ id: tid, text });
      } catch (e) {
        console.error('synergy comment failed', e);
      }
    }
  }
  return fresh;
};
