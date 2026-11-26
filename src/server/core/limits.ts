import { context } from '@devvit/web/server';
import { RAID_ATTEMPTS } from '../../shared/game/boss';

/** Playtest subs (r/<name>_dev) get loose limits so friends can test freely. */
const TEST_LIMIT = 50;
const isTestSub = (): boolean => (context.subredditName ?? '').toLowerCase().endsWith('_dev');

export const challengesPerDay = (): number => (isTestSub() ? TEST_LIMIT : 5);
export const raidAttempts = (): number => (isTestSub() ? TEST_LIMIT : RAID_ATTEMPTS);
export const sharesPerDay = (): number => (isTestSub() ? TEST_LIMIT : 5);
