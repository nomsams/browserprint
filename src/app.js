import { SCHEMA_VERSION, compareReports, digest, profilePayload, runProbe } from './core.js';
import { getProbes, inspectDevices } from './probes.js';
import { downloadJSON } from './download.js';
import { mountInteractionStudy } from './interaction-ui.js';

const $ = id => document.getElementById(id);
let report = null;
let controller = null;
const cards = new Map();
const study = mountInteractionStudy();

function updateMode() {
  const mode = $('mode').value;
  const privacy = mode === 'privacy';
  if (privacy) $('network').checked = false;
  $('network').disabled = privacy;
  $('mode-note').textContent = privacy ?
    '6 observational probes. Skips pixel, font, audio and GPU extraction, disables external diagnostics, and creates no profile digest. This does not identify Tor users.' :
    mode === 'mobile' ? '15 probes focused on touch, viewport, rendering and media. No sensor permission is requested.' :
      '20 local probes, including mobile and privacy observations.';
}
$('mode').addEventListener('change', updateMode);
updateMode();

function makeCard(probe) {
  const panel = document.createElement('article'); panel.className = 'panel';
  const header = document.createElement('div'); header.className = 'panel-header';
  const heading = document.createElement('h2'); heading.textContent = probe.title;
  const status = document.createElement('span'); status.className = 'status'; status.textContent = 'Pending';
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = probe.profile ? 'Profile candidate · changes can affect the digest' : 'Context only · excluded from profile digest';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Inspect observations';
  const pre = document.createElement('pre'); pre.textContent = 'Waiting…';
  header.append(heading, status); details.append(summary, pre); panel.append(header, note, details);
  $('results').append(panel); cards.set(probe.id, { status, pre, note });
}

function renderResult(result) {
  const card = cards.get(result.id);
  card.status.textContent = `${result.status} · ${result.durationMs} ms`;
  card.status.className = `status ${result.status}`;
  card.pre.textContent = JSON.stringify(result.data ?? { reason: result.error }, null, 2);
  if (result.data?.repeatable === false) card.note.textContent = 'Varied within this scan · excluded from profile digest';
}

async function start() {
  if (controller) return;
  controller = new AbortController();
  const signal = controller.signal;
  const previous = report;
  report = null;
  $('start').disabled = true; $('stop').disabled = false; $('export').disabled = true; $('network').disabled = true;
  $('mode').disabled = true;
  $('digest').textContent = 'Collecting…';
  $('comparison').textContent = 'Waiting for all probes to settle.';
  $('results').replaceChildren(); cards.clear();
  try {
    const options = { mode: $('mode').value, network: $('mode').value !== 'privacy' && $('network').checked };
    const probes = getProbes(options);
    probes.forEach(makeCard);
    let completed = 0;
    const updateProgress = () => { $('progress').textContent = `${completed} / ${probes.length} probes complete`; };
    updateProgress();
    const results = await Promise.all(probes.map(async probe => {
      const result = await runProbe(probe, { signal });
      renderResult(result); completed++; updateProgress(); return result;
    }));
    const payload = profilePayload(results);
    const included = Object.keys(payload.signals);
    const hash = !signal.aborted && included.length ? await digest(payload) : null;
    const stopped = signal.aborted;
    report = { schemaVersion: SCHEMA_VERSION, collectedAt: new Date().toISOString(), options,
      complete: !stopped, profile: { algorithm: 'SHA-256', digest: stopped ? null : hash,
        included, excluded: results.filter(r => !included.includes(r.id)).map(r => r.id) }, results };
    $('digest').textContent = stopped ? 'Scan stopped — no profile digest' : options.mode === 'privacy' ?
      'Privacy review — no profile digest collected' :
      report.profile.digest || 'Digest unavailable — use HTTPS or localhost and collect at least one profile signal';
    const ok = results.filter(r => r.status === 'ok').length;
    $('progress').textContent = `${stopped ? 'Stopped' : 'Complete'} · ${ok}/${results.length} probes returned observations · ${included.length} profile signals`;
    if (previous && previous.options.mode !== options.mode) {
      $('comparison').textContent = 'Preset changed; run the same preset again for a comparable scan.';
    } else if (previous) {
      const changed = compareReports(previous, report);
      $('comparison').textContent = changed.length ? `Changed observations: ${changed.join(', ')}. Timings and timestamps are ignored.` :
        'All observations match the previous scan. Timings and timestamps are ignored.';
    } else $('comparison').textContent = 'Run again to compare observations in this tab.';
    $('export').disabled = false;
  } catch (error) {
    $('progress').textContent = `Scan could not finish: ${error.message}`;
    $('digest').textContent = 'Unavailable';
    report = previous;
    $('export').disabled = !report;
  } finally {
    controller = null;
    $('start').disabled = false; $('stop').disabled = true; $('mode').disabled = false; updateMode();
    $('start').textContent = 'Run again';
  }
}

$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => controller?.abort());
$('export').addEventListener('click', () => {
  if (!report) return;
  downloadJSON({ ...report, interactionStudy: study.getSummary() }, 'browserprint-report.json');
});
$('devices').addEventListener('click', async () => {
  $('devices').disabled = true;
  $('device-result').textContent = 'Inspecting permission-limited counts…';
  try {
    const result = await runProbe({ id: 'devices', title: 'Media device counts', collect: inspectDevices });
    $('device-result').textContent = result.status === 'ok' ?
      `${result.data.microphones} microphone(s), ${result.data.cameras} camera(s), ${result.data.speakers} speaker(s). ${result.data.note}` : result.error;
  } finally { $('devices').disabled = false; }
});
