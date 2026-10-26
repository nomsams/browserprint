import { canonical, digest, Unavailable } from './core.js';
import { selectProbes } from './presets.js';

const probe = (id, title, profile, collect) => ({ id, title, profile, collect });
const requireAPI = (condition, message) => { if (!condition) throw new Unavailable(message); };
const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key] ?? null]));

function environment() {
  return { userAgent: navigator.userAgent, language: navigator.language,
    languages: [...navigator.languages], platform: navigator.platform,
    cores: navigator.hardwareConcurrency ?? null, memoryGiB: navigator.deviceMemory ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

function paint(canvas) {
  canvas.width = 300; canvas.height = 100;
  // Prefer a consistent readback backend rather than triggering GPU/CPU switches.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  requireAPI(ctx, '2D canvas unavailable');
  ctx.fillStyle = '#f0c'; ctx.fillRect(3, 5, 160, 55);
  ctx.fillStyle = '#0cc'; ctx.font = '18px Arial';
  ctx.fillText('Browserprint 🧠 Ω العربية', 12, 30);
  ctx.globalCompositeOperation = 'multiply';
  for (const [x, color] of [[70, '#ff0'], [100, '#0ff'], [130, '#f0f']]) {
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, 55, 32, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.rect(200, 15, 60, 60); ctx.rect(215, 30, 30, 30);
  ctx.fill('evenodd');
  return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

async function canvasProbe() {
  // Pixel hashes avoid conflating PNG encoder differences with rendering.
  const canvas = document.createElement('canvas');
  const reads = await Promise.all([paint(canvas), paint(canvas), paint(document.createElement('canvas'))].map(digest));
  requireAPI(reads.every(Boolean), 'SHA-256 requires HTTPS or localhost');
  return { pixelHash: reads[0], samples: reads, repeatable: new Set(reads).size === 1,
    sampleCount: 3, note: 'Repeated redraws and a fresh canvas; differences can have multiple causes.' };
}

function webglProbe({ cleanup }) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  requireAPI(gl, 'WebGL unavailable or blocked');
  cleanup(() => gl.getExtension('WEBGL_lose_context')?.loseContext());
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const precision = {};
  for (const stage of ['VERTEX_SHADER', 'FRAGMENT_SHADER']) {
    precision[stage] = {};
    for (const kind of ['LOW_FLOAT', 'MEDIUM_FLOAT', 'HIGH_FLOAT', 'HIGH_INT']) {
      const value = gl.getShaderPrecisionFormat(gl[stage], gl[kind]);
      precision[stage][kind] = value ? pick(value, ['rangeMin', 'rangeMax', 'precision']) : null;
    }
  }
  const limits = Object.fromEntries(['MAX_TEXTURE_SIZE', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE',
    'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VARYING_VECTORS']
    .map(name => [name, gl.getParameter(gl[name])]));
  return { version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    extensions: (gl.getSupportedExtensions() || []).sort(), precision, limits };
}

async function audioProbe({ cleanup, signal }) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  requireAPI(AC, 'Offline audio unavailable');
  const render = async () => {
    signal.throwIfAborted();
    const ctx = new AC(1, 5000, 44100);
    const osc = ctx.createOscillator(), compressor = ctx.createDynamicsCompressor();
    cleanup(() => { osc.disconnect(); compressor.disconnect(); });
    osc.type = 'triangle'; osc.frequency.value = 10000;
    for (const [name, value] of Object.entries({ threshold: -50, knee: 40, ratio: 12, attack: 0, release: .25 })) {
      compressor[name].value = value;
    }
    osc.connect(compressor); compressor.connect(ctx.destination); osc.start(); osc.stop(5000 / 44100);
    const buffer = await ctx.startRendering();
    signal.throwIfAborted();
    const samples = buffer.getChannelData(0).slice(4500);
    const sum = samples.reduce((a, b) => a + Math.abs(b), 0);
    return { hash: await digest(Array.from(samples)), sum };
  };
  const samples = [await render(), await render()];
  requireAPI(samples.every(s => s.hash), 'SHA-256 requires HTTPS or localhost');
  return { sampleRate: 44100, samples, repeatable: canonical(samples[0]) === canonical(samples[1]) };
}

function fontsProbe({ cleanup }) {
  const names = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS',
    'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Georgia', 'Impact', 'Segoe UI',
    'Segoe UI Emoji', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
    'American Typewriter', 'Andale Mono', 'Apple Color Emoji', 'Baskerville', 'Chalkduster',
    'Futura', 'Geneva', 'Gill Sans', 'Helvetica Neue', 'Menlo', 'Monaco', 'Optima', 'Papyrus',
    'PingFang SC', 'Hiragino Sans', 'Ubuntu', 'Cantarell', 'DejaVu Sans', 'Liberation Sans',
    'Noto Sans', 'Noto Color Emoji', 'Roboto', 'Droid Sans', 'Yu Gothic', 'Malgun Gothic', 'Microsoft YaHei',
    'Cambria Math', 'Courier', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'HoloLens MDL2 Assets',
    'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode', 'Marlett',
    'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue', 'Microsoft PhagsPa',
    'Microsoft Sans Serif', 'Microsoft Tai Le', 'Microsoft Yi Baiti', 'MingLiU-ExtB', 'Mongolian Baiti',
    'MS Gothic', 'MV Boli', 'Myanmar Text', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets',
    'Segoe Print', 'Segoe Script', 'Segoe UI Historic', 'Segoe UI Symbol', 'SimSun', 'Sitka', 'Sylfaen',
    'Symbol', 'Times', 'Webdings', 'Apple Chancery', 'Arial Narrow', 'Ayuthaya', 'Big Caslon',
    'Brush Script MT', 'Chalkboard', 'Charter', 'Cochin', 'Copperplate', 'Didot', 'Helvetica',
    'Herculanum', 'Hoefler Text', 'Keyboard', 'Lucida Grande', 'Luminari', 'Marker Felt', 'Noteworthy',
    'Osaka', 'Phosphate', 'PingFang HK', 'PlantinMT', 'Savoye LET', 'SignPainter', 'Skia',
    'Snell Roundhand', 'Trattatello', 'Zapfino'];
  const span = document.createElement('span');
  span.textContent = 'mmmmmmmmmmlliWW0123456789';
  span.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:nowrap;font-size:72px;line-height:normal';
  document.body.append(span); cleanup(() => span.remove());
  const measure = family => {
    span.style.fontFamily = family;
    const r = span.getBoundingClientRect(); return [r.width, r.height];
  };
  const bases = ['monospace', 'sans-serif', 'serif'];
  const baseline = Object.fromEntries(bases.map(b => [b, measure(b)]));
  const detected = names.filter(name => bases.some(base => canonical(measure(`"${name}",${base}`)) !== canonical(baseline[base])));
  return { candidates: names.length, detected: detected.sort(),
    method: 'Fallback geometry; matching metrics can conceal installed fonts. This is not a full font inventory.' };
}

function textGeometry({ cleanup }) {
  const ctx = document.createElement('canvas').getContext('2d');
  requireAPI(ctx, 'Canvas text metrics unavailable');
  const texts = ['mmmmWW 0123', '🧠👩‍💻🏳️‍🌈', 'العربية', '漢字かな', 'a\u0301 fi ﬃ Ω'];
  const metrics = {};
  for (const font of ['serif', 'sans-serif', 'monospace', 'system-ui']) {
    ctx.font = `19.25px ${font}`;
    metrics[font] = texts.map(text => ({ text, ...pick(ctx.measureText(text),
      ['width', 'actualBoundingBoxLeft', 'actualBoundingBoxRight', 'actualBoundingBoxAscent', 'actualBoundingBoxDescent']) }));
  }
  const target = document.createElement('div');
  target.style.cssText = 'position:absolute;left:-10000px;top:0;width:213.375px;font:19.25px serif;line-height:1.3;transform:skewX(10deg) rotate(5deg) scale(1.123);visibility:hidden';
  target.textContent = texts.join(' '); document.body.append(target); cleanup(() => target.remove());
  const rect = target.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(target);
  const lines = Array.from(range.getClientRects(), r => pick(r, ['width', 'height']));
  return { metrics, transformedRect: pick(rect, ['width', 'height']), lines };
}

function localeProbe() {
  const date = new Date('2020-11-22T13:14:15.123Z');
  const locales = ['en-US', 'sv-SE', 'ar-EG', 'ja-JP', 'hi-IN'];
  return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaults: { date: Intl.DateTimeFormat().resolvedOptions(), number: Intl.NumberFormat().resolvedOptions() },
    matrix: Object.fromEntries(locales.map(locale => [locale, {
      number: new Intl.NumberFormat(locale, { notation: 'compact' }).format(1234567.89),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long', timeZone: 'UTC' }).format(date),
      sorted: ['ä', 'z', 'å', 'a', 'Ö', 'o', '10', '2'].sort(new Intl.Collator(locale, { numeric: true }).compare),
      plural: [0, 1, 2, 3, 11, 101].map(n => new Intl.PluralRules(locale).select(n)),
    }])),
    segments: typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' })
      .segment('👩‍💻a\u0301🇸🇪'), s => s.segment) : null };
}

function mathProbe() {
  const inputs = [1e-300, .1, .5, 1, Math.PI, 1e20];
  const values = {};
  for (const name of ['sin', 'cos', 'tan', 'atan', 'sinh', 'cosh', 'tanh', 'expm1', 'log1p', 'cbrt']) {
    // Strings preserve Infinity and full floating-point output in JSON exports.
    values[name] = inputs.map(n => String(Math[name](n)));
  }
  return { inputs, values, constants: { hypot: String(Math.hypot(Math.PI, Math.E)),
    pow: String(Math.pow(Math.PI, -100)), fround: String(Math.fround(Math.PI)) } };
}

function svgProbe({ cleanup }) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;width:300px;height:150px';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3.125 7.75 C35.5 -20.25 88.125 125.75 155.5 23.125 Q200.375 90.125 277.875 11.5 A13.25 22.75 37 0 1 290 60');
  const text = document.createElementNS(ns, 'text');
  text.style.font = '19.25px serif'; text.textContent = 'Browserprint Ω 漢字';
  text.setAttribute('x', '5.25'); text.setAttribute('y', '110.5');
  svg.append(path, text); document.body.append(svg); cleanup(() => svg.remove());
  requireAPI(typeof path.getTotalLength === 'function', 'SVG geometry unavailable');
  const length = path.getTotalLength();
  return { pathLength: length, pathBounds: pick(path.getBBox(), ['x', 'y', 'width', 'height']),
    points: [0, .125, .333, .5, .875, 1].map(fraction => {
      const point = path.getPointAtLength(length * fraction); return [point.x, point.y];
    }), textLength: text.getComputedTextLength(), textBounds: pick(text.getBBox(), ['width', 'height']) };
}

async function wasmProbe() {
  requireAPI(globalThis.WebAssembly, 'WebAssembly unavailable');
  // A self-contained (f64, f64) -> f64 addition module; no fetched executable.
  const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,124,124,1,124,
    3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,160,11]);
  const { instance } = await WebAssembly.instantiate(bytes);
  const repr = n => Object.is(n, -0) ? '-0' : String(n);
  const cases = [[Math.PI, 1e-16], [-0, -0], [1e308, 1e308],
    [Number.MIN_VALUE, Number.MIN_VALUE], [Infinity, -Infinity], [2 ** 53, 1]];
  const results = cases.map(([a, b]) => ({ inputs: [repr(a), repr(b)],
    js: repr(a + b), wasm: repr(instance.exports.add(a, b)) }));
  return { results, consistent: results.every(r => r.js === r.wasm),
    note: 'Cross-runtime consistency control, not a CPU identifier. IEEE-754 results normally agree.' };
}

function cssProbe() {
  requireAPI(globalThis.CSS?.supports && globalThis.matchMedia, 'CSS feature queries unavailable');
  const supports = ['selector(:has(*))', '(container-type: inline-size)', '(color: oklch(50% 0.2 30))',
    '(color: color(display-p3 1 0 0))', 'font-tech(color-COLRv1)', '(text-wrap: balance)',
    '(anchor-name: --test)', '(animation-timeline: scroll())', '(backdrop-filter: blur(1px))', '(grid-template-columns: subgrid)'];
  const media = ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)',
    '(forced-colors: active)', '(inverted-colors: inverted)', '(color-gamut: p3)', '(color-gamut: rec2020)',
    '(dynamic-range: high)', '(pointer: fine)', '(pointer: coarse)', '(any-pointer: fine)', '(hover: hover)',
    '(any-hover: hover)', '(monochrome)', '(update: fast)'];
  return { supports: Object.fromEntries(supports.map(s => [s, CSS.supports(s)])),
    media: Object.fromEntries(media.map(q => [q, matchMedia(q).matches])) };
}

function screenProbe() {
  return { screen: pick(screen, ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth']),
    dpr: devicePixelRatio, orientation: screen.orientation?.type ?? null,
    viewport: { width: innerWidth, height: innerHeight },
    visualViewport: window.visualViewport ? pick(visualViewport, ['width', 'height', 'scale']) : null,
    maxTouchPoints: navigator.maxTouchPoints };
}

function mobileProbe({ cleanup }) {
  const query = q => typeof matchMedia === 'function' ? matchMedia(q).matches : null;
  const target = document.createElement('div');
  target.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(target); cleanup(() => target.remove());
  const style = getComputedStyle(target);
  const video = document.createElement('video');
  return { input: { maxTouchPoints: navigator.maxTouchPoints ?? null,
    pointerEvents: 'PointerEvent' in window, touchEvents: 'TouchEvent' in window,
    primaryCoarse: query('(pointer: coarse)'), primaryFine: query('(pointer: fine)'),
    anyCoarse: query('(any-pointer: coarse)'), anyFine: query('(any-pointer: fine)'),
    hover: query('(hover: hover)'), anyHover: query('(any-hover: hover)') },
    mobileClientHint: navigator.userAgentData?.mobile ?? null,
    viewport: { layoutWidth: document.documentElement.clientWidth, layoutHeight: document.documentElement.clientHeight,
      visual: window.visualViewport ? pick(visualViewport, ['width', 'height', 'scale']) : null },
    orientation: screen.orientation ? pick(screen.orientation, ['type', 'angle']) : null,
    safeAreaCssPx: Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].map(side => [side.toLowerCase(), parseFloat(style['padding' + side]) || 0])),
    capabilities: { inlineVideo: 'playsInline' in video, virtualKeyboard: 'virtualKeyboard' in navigator,
      deviceMotionInterface: 'DeviceMotionEvent' in window, deviceOrientationInterface: 'DeviceOrientationEvent' in window,
      standaloneDisplay: query('(display-mode: standalone)'), dynamicViewportUnits: globalThis.CSS?.supports?.('height', '100dvh') ?? null },
    note: 'Advertised capabilities and current viewport, not a device-model or user classifier. No sensor readings are requested. Touch and fine pointers can coexist.' };
}

function privacyProbe() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { timezone: { reported: timezone, reportsUTC: ['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT'].includes(timezone) },
    viewport: { width: innerWidth, height: innerHeight,
      alignsWith200x100Grid: innerWidth > 0 && innerHeight > 0 && innerWidth % 200 === 0 && innerHeight % 100 === 0 },
    exposedInterfaces: { clientHints: Boolean(navigator.userAgentData), webRTC: 'RTCPeerConnection' in window,
      webGPU: Boolean(navigator.gpu), deviceMemory: typeof navigator.deviceMemory === 'number',
      hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' },
    preferences: { doNotTrack: navigator.doNotTrack ?? null, globalPrivacyControl: navigator.globalPrivacyControl ?? null },
    torBrowser: 'undetermined', torNetwork: 'not tested',
    note: 'UTC, unavailable APIs and viewport buckets occur in many environments. None confirms Tor, letterboxing, private browsing or a protection setting. No active rendering extraction is performed by this probe.',
    source: 'https://support.torproject.org/tor-browser/features/fingerprinting-protections/' };
}

async function hintsProbe() {
  requireAPI(navigator.userAgentData, 'User-Agent Client Hints unavailable');
  const data = navigator.userAgentData;
  const high = await data.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion',
    'fullVersionList', 'wow64', 'formFactors']);
  const result = { brands: data.brands, mobile: data.mobile, platform: data.platform, ...high };
  // Brand ordering can be deliberately shuffled by the browser.
  for (const field of ['brands', 'fullVersionList']) {
    if (result[field]) result[field] = [...result[field]].sort((a, b) => a.brand.localeCompare(b.brand));
  }
  return result;
}

async function gpuProbe() {
  requireAPI(navigator.gpu, 'WebGPU unavailable; HTTPS and browser support required');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  requireAPI(adapter, 'No WebGPU adapter exposed');
  const names = ['maxTextureDimension1D', 'maxTextureDimension2D', 'maxTextureDimension3D', 'maxTextureArrayLayers',
    'maxBindGroups', 'maxBindingsPerBindGroup', 'maxBufferSize', 'maxStorageBufferBindingSize',
    'maxUniformBufferBindingSize', 'minUniformBufferOffsetAlignment', 'minStorageBufferOffsetAlignment',
    'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupSizeX'];
  return { features: [...adapter.features].sort(), limits: pick(adapter.limits, names),
    info: adapter.info ? pick(adapter.info, ['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter']) : null };
}

async function mediaProbe({ signal }) {
  const video = document.createElement('video');
  const codecs = ['video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="av01.0.05M.08"',
    'video/webm; codecs="vp8"', 'video/webm; codecs="vp09.00.10.08"',
    'audio/ogg; codecs="opus"', 'audio/mp4; codecs="mp4a.40.2"', 'audio/flac'];
  const playback = Object.fromEntries(codecs.map(type => [type, video.canPlayType(type)]));
  const decoding = {};
  if (navigator.mediaCapabilities?.decodingInfo) {
    for (const type of codecs.slice(0, 4)) {
      signal.throwIfAborted();
      try {
        const result = await navigator.mediaCapabilities.decodingInfo({ type: 'file', video: {
          contentType: type, width: 1920, height: 1080, bitrate: 5000000, framerate: 30 } });
        decoding[type] = pick(result, ['supported', 'smooth', 'powerEfficient']);
      } catch (error) { decoding[type] = { error: error.name }; }
    }
  }
  return { playback, decoding, note: 'Smoothness and efficiency are environment-dependent estimates.' };
}

function voicesProbe({ cleanup }) {
  requireAPI(window.speechSynthesis, 'Speech synthesis unavailable');
  return new Promise(resolve => {
    const read = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return;
      resolve({ voices: voices.map(v => pick(v, ['name', 'lang', 'localService', 'default']))
        .sort((a, b) => canonical(a).localeCompare(canonical(b))) });
    };
    speechSynthesis.addEventListener('voiceschanged', read);
    cleanup(() => speechSynthesis.removeEventListener('voiceschanged', read));
    read(); // A browser that never delivers voices is bounded by the probe deadline.
  });
}

function workerProbe({ cleanup }) {
  requireAPI(globalThis.Worker, 'Dedicated workers unavailable');
  const main = environment();
  const source = `onmessage = () => {
    try { postMessage({ userAgent: navigator.userAgent, language: navigator.language,
      languages: [...navigator.languages], platform: navigator.platform,
      cores: navigator.hardwareConcurrency ?? null, memoryGiB: navigator.deviceMemory ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }
    catch (error) { postMessage({ error: error.message }); }
  };`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  cleanup(() => URL.revokeObjectURL(url));
  const worker = new Worker(url); cleanup(() => worker.terminate());
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.error) { reject(new Error(data.error)); return; }
      resolve({ main, worker: data, differences: Object.keys(main).filter(k => canonical(main[k]) !== canonical(data[k])),
        note: 'Context differences are not proof of tampering.' });
    };
    worker.onerror = () => reject(new Error('Worker failed to execute'));
    worker.postMessage('collect');
  });
}

async function stateProbe() {
  const storage = {};
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    try { storage[name] = Boolean(window[name]); } catch (e) { storage[name] = e.name; }
  }
  const permissions = {};
  if (navigator.permissions?.query) {
    await Promise.all(['camera', 'microphone', 'geolocation', 'notifications'].map(async name => {
      try { permissions[name] = (await navigator.permissions.query({ name })).state; }
      catch { permissions[name] = 'unsupported'; }
    }));
  }
  return { storage, permissions, cookieEnabled: navigator.cookieEnabled,
    secureContext: isSecureContext, crossOriginIsolated,
    doNotTrack: navigator.doNotTrack ?? null, globalPrivacyControl: navigator.globalPrivacyControl ?? null,
    hardwareAPIs: Object.fromEntries(['bluetooth', 'usb', 'hid', 'serial', 'xr', 'getBattery', 'getGamepads']
      .map(key => [key, key in navigator])),
    note: 'API presence does not imply access. No persistent identifiers are written.' };
}

async function networkProbe({ signal }) {
  const response = await fetch('https://ipapi.co/json/', { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`IP lookup HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(String(data.reason || 'IP lookup refused'));
  return { ...pick(data, ['ip', 'version', 'org', 'asn', 'city', 'region', 'country_code', 'timezone']),
    browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneMatches: data.timezone ? data.timezone === Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    note: 'IP location is approximate. A timezone mismatch does not identify a proxy or Tor.' };
}

async function rtcProbe({ cleanup }) {
  requireAPI(globalThis.RTCPeerConnection, 'WebRTC unavailable');
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  cleanup(() => pc.close());
  const candidates = new Map();
  let complete = false;
  const gathered = new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 3500);
    cleanup(() => clearTimeout(timer));
    pc.onicecandidate = event => {
      if (!event.candidate) { complete = true; resolve(); return; }
      const c = event.candidate;
      const value = pick(c, ['type', 'protocol', 'address', 'port', 'relatedAddress', 'relatedPort']);
      candidates.set(canonical(value), value);
    };
    pc.onicecandidateerror = event => {
      // Other ICE paths may still succeed; keep the diagnostic alongside results.
      errors.add(event.errorCode);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') reject(new Error('ICE connection failed')); };
  });
  const errors = new Set();
  pc.createDataChannel('diagnostic');
  await pc.setLocalDescription(await pc.createOffer());
  await gathered;
  return { gatheringComplete: complete, candidates: [...candidates.values()].sort((a, b) => canonical(a).localeCompare(canonical(b))),
    errors: [...errors].sort(), note: 'Addresses may be hidden by mDNS or browser policy. No bypass is attempted.' };
}

export function getProbes({ network = false, mode = 'standard' } = {}) {
  const probes = [
    probe('navigator', 'Navigator & automation flags', true, () => ({ ...environment(),
      vendor: navigator.vendor ?? null, productSub: navigator.productSub ?? null, webdriver: navigator.webdriver ?? null,
      headlessUserAgent: /HeadlessChrome|PhantomJS/.test(navigator.userAgent),
      note: 'These flags are observations; absence does not prove a human visitor.' })),
    probe('clientHints', 'User-Agent Client Hints', true, hintsProbe),
    probe('canvas', 'Canvas redraw consistency', true, canvasProbe),
    probe('webgl', 'WebGL limits & shader precision', true, webglProbe),
    probe('audio', 'Offline audio repeatability', true, audioProbe),
    probe('fonts', 'Font fallback geometry', true, fontsProbe),
    probe('textGeometry', 'Multiscript text & layout geometry', true, textGeometry),
    probe('locale', 'Intl behavior matrix', true, localeProbe),
    probe('math', 'Floating-point behavior', true, mathProbe),
    probe('svg', 'SVG curve & text geometry', true, svgProbe),
    probe('wasm', 'JavaScript / WebAssembly consistency', true, wasmProbe),
    probe('css', 'CSS capabilities & preferences', true, cssProbe),
    probe('screen', 'Screen & viewport state', false, screenProbe),
    probe('webgpu', 'WebGPU adapter capabilities', true, gpuProbe),
    probe('media', 'Codec & decoding matrix', false, mediaProbe),
    probe('voices', 'Speech voice inventory', true, voicesProbe),
    probe('worker', 'Main / worker consistency', true, workerProbe),
    probe('state', 'Storage, permissions & API surface', false, stateProbe),
    probe('mobile', 'Mobile input & viewport capabilities', false, mobileProbe),
    probe('privacy', 'Tor / privacy surface observations', false, privacyProbe),
  ];
  probes.push(probe('network', 'Public IP diagnostics', false, networkProbe),
    probe('webrtc', 'WebRTC candidate diagnostics', false, rtcProbe));
  return selectProbes(probes, { network, mode });
}

export async function inspectDevices() {
  requireAPI(navigator.mediaDevices?.enumerateDevices, 'Media device enumeration unavailable');
  const devices = await navigator.mediaDevices.enumerateDevices();
  return { microphones: devices.filter(d => d.kind === 'audioinput').length,
    cameras: devices.filter(d => d.kind === 'videoinput').length,
    speakers: devices.filter(d => d.kind === 'audiooutput').length,
    note: 'Counts may be filtered by permission, visibility, or browser policy.' };
}
