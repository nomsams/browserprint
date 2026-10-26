import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, compareReports, profilePayload, runProbe, Unavailable } from '../src/core.js';

test('canonical hashes ignore property insertion order and preserve value distinctions', async () => {
  assert.equal(await digest({ b: 2, a: [1, 3] }), await digest({ a: [1, 3], b: 2 }));
  assert.match(await digest({ a: 1 }), /^[0-9a-f]{64}$/);
  const values = [null, undefined, NaN, Infinity, -Infinity, -0, 0, 'NaN', 'number:NaN', [], {}];
  assert.equal(new Set(values.map(canonical)).size, values.length);
  assert.notEqual(await digest([1, 2]), await digest([2, 1]));
});

test('probe returns structured failures without preventing other collectors', async () => {
  const outcomes = await Promise.all([
    runProbe({ id: 'ok', collect: () => ({ value: 1 }) }),
    runProbe({ id: 'unsupported', collect: () => { throw new Unavailable('Missing API'); } }),
    runProbe({ id: 'denied', collect: () => { throw new DOMException('Policy blocked', 'SecurityError'); } }),
    runProbe({ id: 'error', collect: () => { throw new Error('Failure'); } }),
  ]);
  assert.deepEqual(outcomes.map(r => r.status), ['ok', 'unsupported', 'denied', 'error']);
  assert.equal(outcomes[0].data.value, 1);
});

test('timeout aborts work and cleans resources once, ignoring late resolution', async () => {
  let cleaned = 0, aborted = false, late;
  const result = await runProbe({ id: 'slow', collect: ({ signal, cleanup }) => {
    cleanup(() => cleaned++);
    signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(resolve => { late = resolve; });
  } }, { timeoutMs: 10 });
  assert.equal(result.status, 'timeout');
  assert.equal(cleaned, 1); assert.equal(aborted, true);
  late({ changed: true }); await Promise.resolve();
  assert.equal(result.status, 'timeout'); assert.equal(result.data, null); assert.equal(cleaned, 1);
});

test('cancellation before launch prevents execution, cancellation during work cleans up', async () => {
  const early = new AbortController(); early.abort();
  const result = await runProbe({ id: 'never', collect: () => assert.fail('Must not run') }, { signal: early.signal });
  assert.equal(result.status, 'cancelled');
  const active = new AbortController();
  let cleaned = false;
  const pending = runProbe({ id: 'active', collect: ({ cleanup }) => {
    cleanup(() => { cleaned = true; }); return new Promise(() => {});
  } }, { signal: active.signal });
  await Promise.resolve(); active.abort();
  assert.equal((await pending).status, 'cancelled'); assert.equal(cleaned, true);
});

test('cleanup registered after timeout runs immediately', async () => {
  let register, cleaned = false;
  await runProbe({ id: 'late', collect: ({ cleanup }) => {
    register = cleanup; return new Promise(() => {});
  } }, { timeoutMs: 5 });
  register(() => { cleaned = true; }); assert.equal(cleaned, true);
});

test('profile excludes errors, volatile state and rendering that varied', () => {
  const results = [
    { id: 'stable', profile: true, status: 'ok', data: { hash: 'a' } },
    { id: 'noise', profile: true, status: 'ok', data: { repeatable: false } },
    { id: 'ip', profile: false, status: 'ok', data: { ip: '127.0.0.1' } },
    { id: 'timeout', profile: true, status: 'timeout', data: null },
  ];
  assert.deepEqual(Object.keys(profilePayload(results).signals), ['stable']);
});

test('comparisons ignore timing but include status changes and added/removed signals', () => {
  const old = { results: [{ id: 'a', status: 'ok', data: { b: 2, a: 1 }, durationMs: 1 },
    { id: 'removed', status: 'ok', data: {} }] };
  const next = { results: [{ id: 'a', status: 'ok', data: { a: 1, b: 2 }, durationMs: 99 },
    { id: 'new', status: 'unsupported', data: null }] };
  assert.deepEqual(compareReports(old, next), ['new', 'removed']);
  next.results[0].status = 'error';
  assert.deepEqual(compareReports(old, next), ['a', 'new', 'removed']);
});
