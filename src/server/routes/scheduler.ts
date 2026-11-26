import { Hono } from 'hono';
import { runRollover } from '../core/state';

export const scheduler = new Hono();

scheduler.post('/daily-rollover', async (c) => {
  try {
    const msg = await runRollover();
    console.log(msg);
    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('scheduled rollover failed', error);
    return c.json({ status: 'error' }, 500);
  }
});
