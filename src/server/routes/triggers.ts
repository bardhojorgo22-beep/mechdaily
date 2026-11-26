import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { createDailyPost, dayPost, ensureState } from '../core/state';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const { day, dayNumber } = await ensureState();
    if (!(await dayPost(day))) await createDailyPost(day, dayNumber);
    return c.json<TriggerResponse>({
      status: 'success',
      message: 'Mech Daily installed',
    });
  } catch (error) {
    console.error(`install failed: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});
