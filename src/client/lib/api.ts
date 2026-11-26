import type {
  ChallengeResponse,
  ChallengesResponse,
  EnterResponse,
  InitResponse,
  LeaderboardResponse,
  RaidResponse,
  ResultsResponse,
} from '../../shared/api';
import type { FactionId } from '../../shared/game/factions';
import type { Build } from '../../shared/game/mech';

const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && typeof data === 'object' ? Reflect.get(data, 'message') : null;
    throw new Error(typeof msg === 'string' ? msg : `Request failed (${res.status})`);
  }
  // Server and client share these types; the server is the only writer.
  const typed: T = JSON.parse(JSON.stringify(data));
  return typed;
};

export const api = {
  init: () => call<InitResponse>('/api/init'),
  save: (build: Build) =>
    call<{ ok: boolean }>('/api/save', {
      method: 'POST',
      body: JSON.stringify({ build }),
    }),
  enter: (build: Build) =>
    call<EnterResponse>('/api/enter', {
      method: 'POST',
      body: JSON.stringify({ build }),
    }),
  faction: (faction: FactionId) =>
    call<{ faction: FactionId }>('/api/faction', {
      method: 'POST',
      body: JSON.stringify({ faction }),
    }),
  raid: (build: Build) => call<RaidResponse>('/api/raid', { method: 'POST', body: JSON.stringify({ build }) }),
  challenge: (username: string, build: Build) =>
    call<ChallengeResponse>('/api/challenge', { method: 'POST', body: JSON.stringify({ username, build }) }),
  challenges: () => call<ChallengesResponse>('/api/challenges'),
  results: (day: string) => call<ResultsResponse>(`/api/results/${day}`),
  leaderboard: () => call<LeaderboardResponse>('/api/leaderboard'),
};

export const countdown = (iso: string, now = Date.now()) => {
  const ms = Math.max(0, Date.parse(iso) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
