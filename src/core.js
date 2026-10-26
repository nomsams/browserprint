export const SCHEMA_VERSION = 4;

// Type tags preserve special numbers without colliding with literal strings.
export function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (Object.is(value, -0)) return 'number:-0';
    return `number:${value}`;
  }
  if (typeof value === 'undefined') return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

export async function digest(value) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export class Unavailable extends Error {
  constructor(message, status = 'unsupported') { super(message); this.status = status; }
}

// Each probe has its own deadline and cleanup stack. Late results never reach UI.
export function runProbe(probe, { signal, timeoutMs = 6000 } = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const cleanups = [];
  return new Promise(resolve => {
    let finished = false;
    let timer;
    const finish = (status, data = null, error = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
      for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch { /* Best effort. */ } }
      resolve({ id: probe.id, title: probe.title, profile: Boolean(probe.profile), status, data,
        error, durationMs: Math.round(performance.now() - started) });
    };
    const cancel = () => finish('cancelled', null, 'Scan stopped');
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => finish('timeout', null, 'Probe exceeded its deadline'), timeoutMs);
    Promise.resolve().then(() => {
      if (finished) return;
      return probe.collect({ signal: controller.signal, cleanup(fn) {
        if (finished) { try { fn(); } catch { /* Already ended. */ } }
        else cleanups.push(fn);
      } });
    }).then(data => finish('ok', data), error => {
      const status = error instanceof Unavailable ? error.status :
        ['NotAllowedError', 'SecurityError'].includes(error?.name) ? 'denied' : 'error';
      finish(status, null, String(error?.message || error).slice(0, 300));
    });
  });
}

export function profilePayload(results) {
  return { schemaVersion: SCHEMA_VERSION, signals: Object.fromEntries(results
    .filter(r => r.profile && r.status === 'ok' && r.data?.repeatable !== false)
    .map(r => [r.id, r.data])) };
}

export function compareReports(previous, current) {
  const old = new Map(previous.results.map(r => [r.id, r]));
  const next = new Map(current.results.map(r => [r.id, r]));
  return [...new Set([...old.keys(), ...next.keys()])].sort().filter(id => {
    const a = old.get(id), b = next.get(id);
    return !a || !b || a.status !== b.status || canonical(a.data) !== canonical(b.data);
  });
}
