# Research notes: privacy, mobile inputs, and interaction measurements

This dashboard exposes observations and descriptive statistics. It does not contain a trained demographic, identity, or behavioral authentication classifier. The methods below do not establish a visitor's gender, age, health, personality, or Tor usage.

## Tor / privacy review

[Tor Project: fingerprinting protections](https://support.torproject.org/tor-browser/features/fingerprinting-protections/) describes defenses including letterboxing and standardization of browser-reported values. The privacy preset observes the reported timezone, viewport dimensions, input capabilities and API availability. It skips rendering extraction and all external diagnostics and produces no profile digest.

The 200-by-100 viewport grid observation is a limited comparison with one documented bucket size, not a Tor or letterboxing detector. Other applications can produce the same dimensions, and a negative result does not establish that letterboxing is absent. UTC and unavailable APIs have many explanations. JavaScript-disabled browsers show a static explanation instead of running probes. Do not interpret a missing or standardized signal as a protection to defeat.

The review does not inspect browser configuration, establish a Tor network connection, inspect exit-relay lists, or claim to identify Tor Browser. Test fixtures simulate restricted interfaces; they are not a substitute for testing a current Tor release at each security level.

## Mobile capabilities

The [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents3/) defines input handling for mouse, pen and touch. Browser-advertised input capabilities describe available interfaces, not physical identity. A hybrid device can advertise both coarse and fine pointers; desktop emulation and privacy normalization can also change reported values.

The mobile preset retains rendering and media probes and adds touch counts, primary/secondary pointer queries, hover, screen orientation, visual/layout viewport sizes, safe-area CSS values, inline-video support and selected interface availability. It omits the longer font and voice inventories and the math, SVG and Wasm probes. No accelerometer, gyroscope, camera, microphone, pressure, contact-size or calibration readings are taken. Safe-area values depend on viewport configuration and do not establish the presence or shape of a hardware cutout.

## Interaction study

[Frank et al., Touchalytics (2012/2013)](https://arxiv.org/abs/1207.6231) studies touchscreen features for authentication under an enrollment and evaluation protocol. Its results motivate studying stroke dynamics, but do not transfer to this dashboard: we have no enrollment data, classifier, evaluation population or validation of authentication accuracy. The study does not provide evidence for demographic inference.

[US9589120B2, Behavior based authentication for touch screen devices](https://patents.google.com/patent/US9589120B2/en) describes gesture-feature and authentication concepts, including duration and velocity. We reviewed it as a description of possible feature categories. Patent claims are not experimental validation, and this dashboard implements descriptive measurements rather than the patent's authentication procedure. No claim is made about patent novelty, claim coverage, licensing, or legal status.

The optional study requires a visitor to check consent and start a visible test-area session. Collection ends on Stop, Clear, tab hiding, the 30-second deadline, or a sample limit. Listeners are attached to the test area, never to the page's keyboard or general navigation. Each session accepts at most 1,200 relevant pointer events, 64 completed gestures and four simultaneous contacts. A pointer capture can finish a gesture that leaves the area's bounds. Hover events without a started gesture are ignored.

For each completed stroke, we compute:

- **Duration:** release time minus press time, with timestamps quantized down to an 8 ms grid. Existing browser timer coarsening is not reversed.
- **Path distance:** the sum of observed segment distances in CSS pixels.
- **Mean speed:** path distance divided by duration in seconds; omitted when duration is zero.
- **Path efficiency:** endpoint displacement divided by path distance, clamped to `[0, 1]`; omitted for a stationary gesture. A straight observed path has efficiency one, while detours generally reduce it.

Exports contain counts and distributions (`n`, median, 25th/75th percentiles, minimum and maximum), not per-event coordinates, individual gesture features or exact event timestamps. Quantiles use linear interpolation between sorted observations. Incomplete/cancelled gestures contribute only to their count. The current gesture's endpoints are held transiently to calculate the features and discarded at session end. Completed scalar features are reduced to distributions; they are not included in exports. The summary can be exported separately or appended to a scan export and is always excluded from the profile digest.

These features describe the task performed in that session. Zoom, device configuration, input hardware, sample rate, event coalescing, timer precision, practice and the chosen task affect them. Small samples and controlled demonstrations do not justify stable personal-trait or identity conclusions. No match probability, gender prediction, bot verdict, or confidence score is computed.

## Validation scope

Unit tests verify known synthetic paths, quantiles, zero-duration behavior, cancellation, bounds and preset exclusions. Chrome integration tests exercise consent, touch emulation, listener removal, exports, restricted APIs and preset selection. Mobile emulation is not physical Android/iOS validation. No current Tor release, real handset, population uniqueness, demographic inference or authentication benchmark has been validated by these checks.
