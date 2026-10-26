// Optional integration check: install Playwright separately or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BROWSERPRINT_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts/downloads', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true,
  downloadsPath: resolve('artifacts/downloads') });
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  const serveRoute = async route => {
    if (!route.request().url().startsWith(base + '/')) {
      external.push(route.request().url());
      if (route.request().url() === 'https://ipapi.co/json/') return route.fulfill({ json: {
        ip: '203.0.113.1', version: 'IPv4', timezone: 'Etc/UTC', org: 'Test fixture', country_code: 'SE' } });
      return route.abort();
    }
    if (process.env.BROWSERPRINT_OFFLINE === '1') {
      const path = new URL(route.request().url()).pathname;
      const files = { '/': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'],
        '/src/app.js': ['src/app.js', 'text/javascript'], '/src/core.js': ['src/core.js', 'text/javascript'],
        '/src/probes.js': ['src/probes.js', 'text/javascript'], '/src/presets.js': ['src/presets.js', 'text/javascript'],
        '/src/interactions.js': ['src/interactions.js', 'text/javascript'], '/src/interaction-ui.js': ['src/interaction-ui.js', 'text/javascript'],
        '/src/download.js': ['src/download.js', 'text/javascript'] };
      const file = files[path];
      if (!file) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ contentType: file[1], body: await readFile(new URL('../' + file[0], import.meta.url)) });
    }
    return route.continue();
  };
  await context.route('**/*', serveRoute);
  await page.goto(base);
  assert.equal(await page.locator('.panel').count(), 0, 'No collection before Start');
  const scan = async () => {
    await page.locator('#start').click();
    await page.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 20000 });
    const downloaded = page.waitForEvent('download');
    await page.locator('#export').click();
    return JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  };
  const first = await scan();
  assert.equal(first.results.length, 20);
  assert.equal(first.interactionStudy, null, 'Normal scan must not collect interactions');
  assert.equal(first.complete, true);
  assert.match(first.profile.digest, /^[0-9a-f]{64}$/);
  assert.equal(first.results.filter(r => r.status === 'error').length, 0,
    JSON.stringify(first.results.filter(r => r.status === 'error')));
  assert.deepEqual(external, [], 'Local scan must not contact external services');
  const second = await scan();
  assert.equal(second.profile.digest, first.profile.digest, 'Profile should repeat in this unchanged browser');
  assert.match(await page.locator('#comparison').innerText(), /All observations match/);
  await page.locator('#devices').click();
  await page.waitForFunction(() => !document.getElementById('devices').disabled);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile viewport must not overflow');
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });

  // Keep one probe pending, then verify Stop reliably settles all work.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: {
      brands: [], mobile: false, platform: 'test', getHighEntropyValues: () => new Promise(() => {}) } });
  });
  await page.evaluate(async () => {
    document.getElementById('start').click();
    await Promise.resolve(); // Let collectors start before stopping.
    document.getElementById('stop').click();
  });
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  assert.match(await page.locator('#digest').innerText(), /Scan stopped/);

  const optional = await context.newPage();
  optional.on('pageerror', e => errors.push(e.message));
  await optional.addInitScript(() => {
    window.__rtcClosed = false;
    window.RTCPeerConnection = class {
      createDataChannel() {}
      async createOffer() { return {}; }
      async setLocalDescription() {
        setTimeout(() => {
          this.onicecandidate?.({ candidate: { type: 'host', protocol: 'udp', address: 'test.local', port: 1234 } });
          this.onicecandidate?.({ candidate: null });
        }, 0);
      }
      close() { window.__rtcClosed = true; }
    };
  });
  await optional.goto(base);
  await optional.locator('#network').check();
  await optional.locator('#start').click();
  await optional.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 20000 });
  assert.equal(await optional.locator('.panel').count(), 22);
  for (const title of ['Public IP diagnostics', 'WebRTC candidate diagnostics']) {
    assert.match(await optional.locator('.panel').filter({ hasText: title }).locator('.status').innerText(), /^ok/i);
  }
  assert.equal(await optional.evaluate(() => window.__rtcClosed), true, 'RTC connection must be closed');
  assert.equal(external.filter(url => url === 'https://ipapi.co/json/').length, 1);

  // Simulate browser restrictions and hanging APIs without external requests.
  const restricted = await context.newPage();
  restricted.on('pageerror', e => errors.push(e.message));
  await restricted.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    Object.defineProperty(window, 'Worker', { value: undefined });
    HTMLCanvasElement.prototype.getContext = () => null;
    Object.defineProperty(navigator, 'userAgentData', { value: {
      brands: [], mobile: false, platform: 'test', getHighEntropyValues: () => new Promise(() => {}) } });
    Object.defineProperty(window, 'OfflineAudioContext', { value: undefined });
  });
  await restricted.goto(base);
  await restricted.locator('#start').click();
  await restricted.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 20000 });
  assert.match(await restricted.locator('#progress').innerText(), /Complete/);
  const statuses = await restricted.locator('.status').allTextContents();
  assert.ok(statuses.filter(s => s.startsWith('unsupported')).length >= 4);
  assert.ok(statuses.some(s => s.startsWith('timeout')), 'Hanging API must reach a deadline');

  // Tor/privacy review must work without invoking rendering, ICE or external fetch.
  const privacy = await context.newPage();
  privacy.on('pageerror', e => errors.push(e.message));
  await privacy.addInitScript(() => {
    window.__extractionCalls = 0;
    HTMLCanvasElement.prototype.getContext = () => { window.__extractionCalls++; throw new Error('Extraction must not run'); };
    window.RTCPeerConnection = class { constructor() { throw new Error('RTC must not run'); } };
  });
  await privacy.goto(base);
  await privacy.locator('#network').check();
  await privacy.locator('#mode').selectOption('privacy');
  assert.equal(await privacy.locator('#network').isChecked(), false);
  assert.equal(await privacy.locator('#network').isDisabled(), true);
  await privacy.locator('#start').click();
  await privacy.waitForFunction(() => !document.getElementById('start').disabled);
  assert.equal(await privacy.locator('.panel').count(), 6);
  assert.equal(await privacy.evaluate(() => window.__extractionCalls), 0);
  assert.match(await privacy.locator('#digest').innerText(), /Privacy review/);
  const noJSContext = await browser.newContext({ javaScriptEnabled: false });
  await noJSContext.route('**/*', serveRoute);
  const noJS = await noJSContext.newPage();
  await noJS.goto(base);
  assert.match(await noJS.locator('noscript').innerText(), /JavaScript is disabled/);
  assert.equal(await noJS.locator('.panel').count(), 0);

  // Real browser mobile emulation exercises pointer capabilities and a touch study.
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobileContext.route('**/*', serveRoute);
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(base);
  assert.equal(await mobile.locator('#study-start').isDisabled(), true);
  await mobile.locator('#mode').selectOption('mobile');
  await mobile.locator('#start').click();
  await mobile.waitForFunction(() => !document.getElementById('start').disabled, null, { timeout: 20000 });
  assert.equal(await mobile.locator('.panel').count(), 15);
  await mobile.locator('#study-consent').check();
  await mobile.locator('#study-start').click();
  await mobile.locator('#study-pad').tap();
  await mobile.locator('#study-stop').click();
  const study = JSON.parse(await mobile.locator('#study-result').textContent());
  assert.ok(study.completedGestures >= 1);
  assert.deepEqual(study.pointerTypes, ['touch']);
  const afterStop = await mobile.locator('#study-result').textContent();
  await mobile.locator('#study-pad').tap();
  assert.equal(await mobile.locator('#study-result').textContent(), afterStop, 'Stop must remove listeners');
  const studyDownload = mobile.waitForEvent('download');
  await mobile.locator('#study-export').click();
  const exportedStudy = JSON.parse(await readFile(await (await studyDownload).path(), 'utf8'));
  assert.equal(exportedStudy.completedGestures, study.completedGestures);
  await mobile.locator('#study-clear').click();
  assert.equal(await mobile.locator('#study-export').isDisabled(), true);
  assert.equal(await mobile.locator('#study-result').textContent(), 'No interaction data.');
  await mobile.locator('#study-start').click();
  await mobile.locator('#study-consent').uncheck();
  assert.equal(await mobile.locator('#study-stop').isDisabled(), true, 'Withdrawing consent stops recording');
  assert.equal(await mobile.locator('#study-start').isDisabled(), true);
  assert.equal(await mobile.locator('#study-result').textContent(), 'No interaction data.');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  assert.equal(external.filter(url => url === 'https://ipapi.co/json/').length, 1, 'No additional external requests');
  assert.deepEqual(errors, [], 'No unhandled browser errors');
  console.log(JSON.stringify({ profile: first.profile.digest,
    results: first.results.map(r => ({ id: r.id, status: r.status })),
    repeated: true, stop: true, restrictedAPIs: true, mobileEmulation: true, privacyPreset: true,
    interactionConsentAndCleanup: true, mockedNetwork: true,
    externalRequests: external }, null, 2));
} finally { await browser.close(); }
