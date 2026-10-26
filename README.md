# Browserprint

A browser fingerprint research dashboard with 20 local probes, Tor/privacy and mobile presets, repeatability checks, an optional interaction study, and structured JSON reports. Runs as a static site with no runtime dependencies or build step.

[Hosted version](https://nomsams.github.io/browserprint/) · [Entry point](index.html)

## Run locally

Use Node.js 20 or newer:

```sh
npm start
```

Open `http://127.0.0.1:4173`, then select **Start scan**. Set the `PORT` environment variable to choose another port. Serve the files over HTTP rather than opening `index.html` directly; ES modules require it. HTTPS or localhost is necessary for secure-context APIs, including SHA-256 and WebGPU. GitHub Pages can serve these files directly.

## Signals

| Probe | Observations | Profile candidate |
| --- | --- | --- |
| Navigator | UA, platform, cores, memory, languages, automation flags | Yes |
| Client Hints | Architecture, bitness, platform version, model, full browser versions, form factors when exposed | Yes |
| Canvas | Pixel SHA-256 across three redraws, including a fresh canvas | If repeatable |
| WebGL | Renderer, sorted extensions, limits, vertex/fragment shader precision | Yes |
| Offline audio | Two oscillator/compressor renders, sample hashes and sums | If repeatable |
| Fonts | Over 110 candidate fonts measured against three generic fallbacks | Yes |
| Text geometry | Multiscript and emoji TextMetrics, transformed DOMRect, line fragments | Yes |
| Intl | Fixed-date formatting, compact numbers, collation, plurals, grapheme segmentation | Yes |
| Math | Transcendental function outputs at fixed inputs | Yes |
| SVG | Curve length, points, bounding boxes, SVG text metrics | Yes |
| JavaScript / WebAssembly | IEEE-754 edge-case agreement across runtimes | Yes |
| CSS | Syntax support, input capabilities, gamut, contrast and other preferences | Yes |
| Screen | Display, viewport, orientation, pixel ratio, touch points | No |
| WebGPU | Adapter features, exposed limits and adapter info; no device requested | Yes |
| Media | Codec playback and 1080p decoding support/smoothness/efficiency estimates | No |
| Speech | Sorted voice names, languages, defaults, local/remote flags | Yes |
| Worker | Navigator and timezone comparisons with the main thread | Yes |
| State | Storage/API availability, existing permission states, privacy preferences | No |
| Mobile | Touch/pointer/hover combinations, visual/layout viewport, orientation, safe area and interface capabilities | No |
| Privacy | Reported UTC, viewport grid observation, exposed interfaces and privacy preferences | No |

The combined geometry, locale behavior, rendering repeatability, and cross-runtime/context controls provide complementary observations. These additions are experimental combinations of public APIs, not claims of newly discovered fingerprinting primitives or measured identifying entropy. The Wasm check normally agrees across devices; it is a consistency control. No benchmark currently establishes uniqueness, population entropy, or long-term stability for any combination.

**Inspect media device counts** separately returns only permission-filtered counts. It does not open devices, request access, or retain labels, device IDs, or group IDs.

## Tor/privacy and mobile presets

- **Full local scan:** all 20 local probes, with two additional network diagnostics if explicitly selected.
- **Tor / privacy review:** six observational probes. Skips canvas/font/audio/GPU extraction, disables external networking, and creates no profile digest. It works with restricted interfaces and shows a static explanation when JavaScript is disabled. It does not identify Tor Browser or determine Tor network usage.
- **Mobile browser review:** 15 probes focused on input, viewport, rendering and media capabilities; excludes the longer font and voice inventories and the math/SVG/Wasm probes. It does not request device motion or orientation sensor data.

Privacy observations have multiple explanations. A viewport aligned to a documented bucket, UTC timezone, or unavailable API is not proof of Tor, letterboxing or private browsing. No normalization bypass is attempted. See [research notes](research.md) for source citations, methods and limits.

## Optional interaction study

Check consent and select **Start study** to record gestures only in the visible test area. Draw straight and curved strokes with touch, pen or mouse, then stop to inspect aggregate duration, distance, mean speed and path-efficiency distributions. Recording automatically stops after 30 seconds, when the tab is hidden, or on a sample limit. **Clear study** removes the summary from memory. Pointer capture allows a gesture started inside the area to finish outside its bounds.

No typing, pressure, contact size, raw event traces, demographic inference or trained identity model is included. The summary contains sample counts and quantiles; hardware, task, zoom and browser restrictions affect these measurements. It is excluded from the profile digest, can be exported separately, and is appended as `interactionStudy` to scan exports only after a study has finished. The initial value is `null`. Study data is not automatically saved or transmitted.

[Research notes](research.md) explain the connection to Touchalytics and the reviewed touchscreen-authentication patent. Those sources motivate descriptive features; they do not validate gender prediction or establish this dashboard as an authentication system.

## Network diagnostics

External network diagnostics are off by default. Enabling the checkbox adds two independent probes:

- A request to `https://ipapi.co/json/` for public IP, network and approximate location. The service receives the visitor's IP address; its availability, limits and privacy terms apply.
- ICE gathering using `stun:stun.l.google.com:19302`. The STUN service receives the visitor's IP address. Candidate addresses can be hidden by mDNS or browser policy. Gathering returns available candidates after at most 3.5 seconds and records whether it completed.

Local scans do not send reports to a backend. No cookies, localStorage identifiers, service workers, or other persistent identifiers are created. Results and the previous scan are held in tab memory. Exporting JSON saves observations locally, including IP and approximate location if network diagnostics were enabled. Treat exported reports as potentially identifying data.

Permission and privacy protections are respected. This project does not attempt history sniffing, extension or local-service scanning, permission bypass, or identifier restoration. A timezone mismatch does not identify Tor or a proxy; context differences do not prove tampering; automation flags do not establish whether a visitor is human.

## Reports and comparisons

Each probe returns `id`, `title`, `profile`, `status`, `data`, `error`, and `durationMs`. Status is one of `ok`, `unsupported`, `denied`, `error`, `timeout`, or `cancelled`. A missing API and a failing API are distinct outcomes. Per-probe async deadlines are six seconds; JavaScript synchronous work cannot be preempted by a timer. Workers, object URLs, GL contexts, listeners, timers and RTC connections are cleaned up on settlement. Offline audio rendering cannot always be interrupted by the browser; late results are ignored.

The profile hashes a canonical, versioned payload containing successful profile candidates. Screen/viewport, decoding estimates, permission state, network data, timings and timestamps are excluded. Canvas/audio results that vary within a scan are excluded. The report lists the exact included and excluded probes; if support changes, coverage and the digest can change. Stopped scans have no profile digest. SHA-256 unavailability is reported explicitly.

The digest is a **profile comparison key, not a unique device identifier**. Browser versions, fonts, language settings, accessibility preferences, permissions and privacy tools can affect results. Equal profiles can occur on different devices. Even a repeated rendering sample cannot establish future stability. Repeat scans compare all probe data and statuses while ignoring durations and timestamps. Previous results disappear on reload.

## Tests

```sh
npm test
```

The Node test suite exercises canonical serialization, hashing, independent failures, deadlines, cancellation, cleanup, profile selection and comparisons.

For the optional Chrome integration check, install Playwright in your development environment, start the server, and run:

```sh
npm run test:browser
```

Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is installed elsewhere. `BROWSERPRINT_URL` selects another development URL, and `BROWSER_CHANNEL=msedge` selects Edge. `BROWSERPRINT_OFFLINE=1` serves repository files through Playwright route fixtures, allowing the same browser checks without a listening server. The browser check covers user-triggered collection, repeat scans, exports, blocked APIs, Stop, preset exclusions, mobile touch emulation, study consent/cleanup and absence of external requests during local scans. Screenshots are saved to the ignored `artifacts/` directory. Tests use automation; this affects the reported WebDriver flag and does not measure real-world fingerprint uniqueness. Tor Browser and physical Android/iOS devices have not been validated by these tests.

## API references

- [Canvas text metrics](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/measureText)
- [Media decoding capabilities](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo)
- [WebGPU adapter selection](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
- [High-entropy Client Hints](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues)

