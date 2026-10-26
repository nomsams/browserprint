import { InteractionSession } from './interactions.js';
import { downloadJSON } from './download.js';

export function mountInteractionStudy() {
  const $ = id => document.getElementById(id);
  const pad = $('study-pad');
  let active = null, summary = null, timer = null;
  const stop = (reason = 'Stopped') => {
    if (!active) return;
    const current = active; active = null;
    current.controller.abort(); clearTimeout(timer);
    for (const id of current.session.active.keys()) {
      try { if (pad.hasPointerCapture(id)) pad.releasePointerCapture(id); } catch { /* Pointer may have ended. */ }
    }
    summary = current.session.finish(performance.now() - current.started);
    delete pad.dataset.active;
    $('study-stop').disabled = true; $('study-start').disabled = !$('study-consent').checked;
    $('study-consent').disabled = false; $('study-export').disabled = false;
    $('study-status').textContent = `${reason}. ${summary.completedGestures} completed gesture(s). Descriptive statistics only.`;
    $('study-result').textContent = JSON.stringify(summary, null, 2);
  };
  const clear = () => {
    stop(); summary = null;
    $('study-export').disabled = true;
    $('study-result').textContent = 'No interaction data.';
    $('study-status').textContent = 'Not recording. Study data cleared.';
  };
  $('study-consent').addEventListener('change', () => {
    if (!$('study-consent').checked) clear();
    $('study-start').disabled = !$('study-consent').checked;
  });
  $('study-start').addEventListener('click', () => {
    if (active || !$('study-consent').checked) return;
    if (!('PointerEvent' in window)) { $('study-status').textContent = 'Pointer Events are unavailable.'; return; }
    summary = null;
    active = { controller: new AbortController(), session: new InteractionSession(), started: performance.now() };
    const current = active;
    const options = { signal: current.controller.signal };
    $('study-start').disabled = true; $('study-stop').disabled = false;
    $('study-export').disabled = true;
    $('study-result').textContent = 'Recording aggregate features…';
    $('study-status').textContent = 'Recording only inside the test area. Automatically stops after 30 seconds.';
    pad.dataset.active = '';
    const record = type => event => {
      if (!active) return;
      if (type === 'down') { try { pad.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ } }
      const allowed = current.session.record({ type, pointerId: event.pointerId, pointerType: event.pointerType,
        x: event.clientX, y: event.clientY, time: performance.now() - current.started });
      if (!allowed) stop('Sample limit reached');
    };
    for (const [event, type] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'],
      ['pointercancel', 'cancel'], ['lostpointercapture', 'cancel']]) pad.addEventListener(event, record(type), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Tab hidden'); }, options);
    timer = setTimeout(() => stop('30-second session completed'), 30000);
  });
  $('study-stop').addEventListener('click', () => stop());
  $('study-clear').addEventListener('click', clear);
  $('study-export').addEventListener('click', () => {
    if (summary) downloadJSON(summary, 'browserprint-interaction-study.json');
  });
  return { getSummary: () => summary };
}
