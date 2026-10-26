import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionSession, distribution } from '../src/interactions.js';
import { selectProbes } from '../src/presets.js';

test('straight stroke has unit efficiency and expected speed; exports no trace or identity', () => {
  const session = new InteractionSession();
  session.record({ type: 'down', pointerId: 1, pointerType: 'touch', x: 10, y: 20, time: 0 });
  session.record({ type: 'move', pointerId: 1, x: 40, y: 60, time: 40 });
  session.record({ type: 'up', pointerId: 1, x: 70, y: 100, time: 80 });
  const result = session.finish(80);
  assert.equal(result.completedGestures, 1);
  assert.equal(result.pathCssPx.median, 100);
  assert.equal(result.speedCssPxPerSec.median, 1250);
  assert.equal(result.pathEfficiency.median, 1);
  assert.deepEqual(result.pointerTypes, ['touch']);
  assert.equal(session.active.size, 0);
  assert.equal('gestures' in result, false);
  assert.equal('gender' in result, false);
  assert.equal('x' in result, false);
  assert.equal('identity' in result, false);
});

test('curved strokes reduce efficiency and simultaneous contacts stay separate', () => {
  const session = new InteractionSession();
  for (const pointerId of [1, 2]) session.record({ type: 'down', pointerId, pointerType: 'pen', x: 0, y: 0, time: 0 });
  session.record({ type: 'move', pointerId: 1, x: 3, y: 4, time: 8 });
  session.record({ type: 'up', pointerId: 1, x: 6, y: 0, time: 16 });
  session.record({ type: 'cancel', pointerId: 2, x: 0, y: 0, time: 16 });
  const result = session.finish(20);
  assert.equal(result.pathEfficiency.median, .6);
  assert.equal(result.completedGestures, 1); assert.equal(result.cancelledGestures, 1);
});

test('zero-duration and stationary gestures do not create infinite speed or false efficiency', () => {
  const session = new InteractionSession();
  session.record({ type: 'down', pointerId: 1, x: 0, y: 0, time: 0 });
  session.record({ type: 'up', pointerId: 1, x: 0, y: 0, time: 1 });
  const result = session.finish(2);
  assert.equal(result.speedCssPxPerSec.n, 0);
  assert.equal(result.pathEfficiency.n, 0);
  assert.equal(result.durationMs.median, 0);
});

test('sampling is bounded, ignores unrelated hover events and stops accepting events after finish', () => {
  const session = new InteractionSession({ maxEvents: 2 });
  session.record({ type: 'move', pointerId: 99, x: 0, y: 0, time: 0 });
  assert.equal(session.events, 0);
  session.record({ type: 'down', pointerId: 1, x: 0, y: 0, time: 0 });
  session.record({ type: 'move', pointerId: 1, x: 5, y: 0, time: 8 });
  assert.equal(session.record({ type: 'up', pointerId: 1, x: 10, y: 0, time: 16 }), false);
  const result = session.finish(16);
  assert.equal(result.events, 2); assert.equal(result.sampleLimitReached, true);
  assert.equal(result.cancelledGestures, 1);
  assert.equal(session.record({ type: 'down', pointerId: 2, x: 0, y: 0, time: 24 }), false);
});

test('quantiles expose sample size and exclude non-finite or missing samples', () => {
  assert.deepEqual(distribution([1, 2, 3, 4, NaN, Infinity, null]),
    { n: 4, median: 2.5, p25: 1.75, p75: 3.25, min: 1, max: 4 });
  assert.equal(distribution([]).median, null);
});

test('privacy preset suppresses extraction and networking even if network is requested', () => {
  const probes = ['navigator', 'canvas', 'audio', 'fonts', 'webgl', 'webgpu', 'state', 'mobile', 'privacy', 'network', 'webrtc']
    .map(id => ({ id, profile: true }));
  const chosen = selectProbes(probes, { mode: 'privacy', network: true });
  assert.deepEqual(chosen.map(p => p.id), ['navigator', 'state', 'mobile', 'privacy']);
  assert.ok(chosen.every(p => p.profile === false));
  assert.equal(probes[0].profile, true, 'Preset does not mutate original collectors');
  assert.throws(() => selectProbes(probes, { mode: 'unknown' }), /Unknown scan preset/);
});

test('mobile preset retains rendering/media and excludes long font and voice inventories', () => {
  const probes = ['canvas', 'audio', 'webgl', 'webgpu', 'media', 'mobile', 'fonts', 'voices', 'network'].map(id => ({ id }));
  assert.deepEqual(selectProbes(probes, { mode: 'mobile' }).map(p => p.id), ['canvas', 'audio', 'webgl', 'webgpu', 'media', 'mobile']);
});
