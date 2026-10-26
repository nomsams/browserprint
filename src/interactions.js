const rounded = n => Number(n.toFixed(3));
const quantile = (sorted, q) => {
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index), fraction = index - low;
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * fraction;
};

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, median: null, p25: null, p75: null, min: null, max: null };
  return { n: sorted.length, median: rounded(quantile(sorted, .5)), p25: rounded(quantile(sorted, .25)),
    p75: rounded(quantile(sorted, .75)), min: rounded(sorted[0]), max: rounded(sorted.at(-1)) };
}

// Retain only the current endpoints and completed scalar features, never traces.
export class InteractionSession {
  constructor({ maxEvents = 1200, maxGestures = 64 } = {}) {
    this.maxEvents = maxEvents; this.maxGestures = maxGestures;
    this.events = 0; this.gestures = []; this.active = new Map(); this.pointerTypes = new Set();
    this.cancelled = 0; this.limited = false; this.finished = false;
  }

  record({ type, pointerId, pointerType, x, y, time }) {
    if (this.finished) return false;
    if (this.events >= this.maxEvents || this.gestures.length >= this.maxGestures) { this.limited = true; return false; }
    if (![x, y, time].every(Number.isFinite) || time < 0) return true;
    if (!['down', 'move', 'up', 'cancel'].includes(type)) return true;
    if (type === 'down' && this.active.size >= 4) return true;
    const current = this.active.get(pointerId);
    if (type !== 'down' && !current) return true;
    this.events++;
    if (type === 'down') {
      this.pointerTypes.add(['mouse', 'touch', 'pen'].includes(pointerType) ? pointerType : 'unknown');
      // Time is quantized to 8 ms; existing browser coarsening is preserved.
      this.active.set(pointerId, { start: [x, y], last: [x, y], started: Math.floor(time / 8) * 8, path: 0 });
    } else if (type === 'cancel') {
      this.active.delete(pointerId); this.cancelled++;
    } else {
      current.path += Math.hypot(x - current.last[0], y - current.last[1]); current.last = [x, y];
      if (type === 'up') {
        const durationMs = Math.max(0, Math.floor(time / 8) * 8 - current.started);
        const displacement = Math.hypot(x - current.start[0], y - current.start[1]);
        this.gestures.push({ durationMs, pathCssPx: current.path,
          speedCssPxPerSec: durationMs > 0 ? current.path / (durationMs / 1000) : null,
          pathEfficiency: current.path > 0 ? Math.min(1, displacement / current.path) : null });
        this.active.delete(pointerId);
      }
    }
    return true;
  }

  finish(elapsedMs) {
    this.finished = true;
    this.cancelled += this.active.size; this.active.clear();
    return { schemaVersion: 1, consent: 'explicit test-area session', elapsedMs: Math.max(0, Math.round(elapsedMs / 8) * 8),
      events: this.events, completedGestures: this.gestures.length, cancelledGestures: this.cancelled,
      sampleLimitReached: this.limited, pointerTypes: [...this.pointerTypes].sort(),
      durationMs: distribution(this.gestures.map(g => g.durationMs)),
      pathCssPx: distribution(this.gestures.map(g => g.pathCssPx)),
      speedCssPxPerSec: distribution(this.gestures.map(g => g.speedCssPxPerSec)),
      pathEfficiency: distribution(this.gestures.map(g => g.pathEfficiency)),
      interpretation: 'Descriptive session statistics only. No identity, gender, age, health, personality or demographic prediction. Input hardware, zoom, task and timing restrictions affect results.' };
  }
}
