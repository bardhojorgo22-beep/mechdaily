import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENAS, arenaForDay } from '../src/shared/game/arenas';
import { simulateBattle } from '../src/shared/game/battle';
import {
  DEFAULT_BUILD,
  validateBuild,
  type Build,
} from '../src/shared/game/mech';

const heavy: Build = {
  ...DEFAULT_BUILD,
  name: 'Brick',
  parts: {
    ...DEFAULT_BUILD.parts,
    core: 'c-vault',
    legs: 'l-tread',
    back: 'bk-howitzer',
    chip: 'p-turtle',
  },
};

test('battles are deterministic', () => {
  for (const arena of ARENAS) {
    const a = simulateBattle(
      { build: DEFAULT_BUILD },
      { build: heavy },
      arena,
      'seed-1'
    );
    const b = simulateBattle(
      { build: DEFAULT_BUILD },
      { build: heavy },
      arena,
      'seed-1'
    );
    assert.deepEqual(a, b);
  }
});

test('battles always end with a winner inside the time limit', () => {
  const r = simulateBattle(
    { build: DEFAULT_BUILD },
    { build: DEFAULT_BUILD },
    ARENAS[0]!,
    'mirror'
  );
  assert.ok(r.winner === 0 || r.winner === 1);
  assert.ok(r.ticks <= 900);
});

test('validateBuild rejects parts in the wrong slot', () => {
  assert.equal(
    validateBuild({
      ...DEFAULT_BUILD,
      parts: { ...DEFAULT_BUILD.parts, head: 'c-vault' },
    }),
    null
  );
  assert.equal(validateBuild('nope'), null);
  assert.ok(validateBuild(DEFAULT_BUILD));
});

test('arena never repeats two days running', () => {
  const d = new Date('2026-12-01T00:00:00Z');
  let prev = '';
  for (let i = 0; i < 60; i++) {
    const day = d.toISOString().slice(0, 10);
    const a = arenaForDay(day).id;
    assert.notEqual(a, prev);
    prev = a;
    d.setUTCDate(d.getUTCDate() + 1);
  }
});
