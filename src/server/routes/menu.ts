import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDailyPost, dayPost, ensureState, runRollover } from '../core/state';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const { day, dayNumber } = await ensureState();
    const existing = await dayPost(day);
    const post = existing ? { id: existing } : await createDailyPost(day, dayNumber);
    return c.json<UiResponse>({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

/** Mod-only: end today's day early. Handy for testing. */
menu.post('/run-tournament', async (c) => {
  try {
    const msg = await runRollover();
    return c.json<UiResponse>({ showToast: msg.slice(0, 120) });
  } catch (error) {
    console.error('manual rollover failed', error);
    return c.json<UiResponse>({ showToast: 'Tournament failed, check logs' }, 400);
  }
});
