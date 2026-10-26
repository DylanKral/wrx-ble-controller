# Local calibrated preview integration

This document records the original preview integration. The subsequent [synchronization update](SYNCHRONIZED_TIMING.md) supersedes its fixed-dwell and Mode 10 loop behavior: timing is now shared, bundled cuts follow speed, and Breathe requests a native loop once while its partial visual capture holds at the end. Approved source assets remain unchanged.

## Review and file plan

Reviewed all six files in `Animations/`, including README_FOR_CODEX.md, all eight records and every frame's timing/color shape, the full SVG's IDs/mirroring, the supplied TypeScript sampler/renderer, validation_report.json, and the approved Mode 4/10 HTML. The package remains unchanged and is imported directly. Mode 4: 66 frames, 2.20 s, brightness floor 70. Mode 10: revised 75 frames, 2.50 s, per-LED blue-channel normalization, enhanced fade on at 100%. All other modes retain recorded RGB.

This checkout has no previous simulator or Simulation Only/Hardware Only/Combined selector. The integration adds those capabilities without replacing the existing BLE manager, command generation, scheduler, or preset definitions.

Files to reuse unchanged: `Animations/*`, `src/animations/scheduler.ts`, `src/animations/customPresets.ts`, `src/animations/factoryModes.ts`, Bluetooth manager/commands/connections, profile migrations, SVG geometry, and saved profile formats.

Files to add: `src/simulation/` modules for calibration access, shared LED mapping, monotonic visual playback, and output routing; shared React simulator panel/styles; focused unit and browser regression tests.

Files to modify: application context to route normal commands through the output mode; Favorites to use that same route for single-mode commands; Main/Development/Calibration pages to show the shared preview; CalibrationEngine to accept the output adapter and observe each calibration request once; playlist availability and preference keys; README and this integration record.

## Behavior

Combined is the default when there is no valid saved output preference. Explicitly saved Simulation Only, Hardware Only, or Combined choices are restored. Simulation Only plays without connections and never calls the BLE writer. Combined previews commands and also sends them to connected controllers; a missing/failed hardware connection is reported without stopping the preview. Switching outputs cancels active experiments and invalidates queued commands. Calibration's physical timing tests require a hardware output; their request logging and scheduling remain unchanged.

Main and Development share one simulator state and the exact same imported tracks. A static color selection and any issued RGB command update the remembered preview color; only Modes 4 and 10 use it to tint captured brightness. Color steps interrupt an active factory animation, wait steps let it continue, different mode commands interrupt immediately, and native loops follow the existing factory classification. Individual Custom step durations are unchanged.

Preview play/pause, scrubbing and frame stepping only inspect visual data; they never send BLE packets or alter the hardware scheduler. Numbered indicators and both SVG assemblies use the same logical mapping and same 19-color array. Only one visible SVG is mounted, keeping approved IDs unique. The original viewBox, housing paths and right-side mirroring remain intact.

Source timestamps are sampled as supplied, without regularizing gaps, trimming frames or stretching cycles. In particular Mode 5 contains samples beyond its declared 4.10-second cycle, and Mode 6's last sample precedes its 4.00-second cycle end. The supplied sampler's wrap/clamp behavior is retained. Mode 10's 2.50-second capture window is not presented as a verified firmware loop period. Other six tracks have not all received the same visual approval as Modes 4 and 10.

## Local validation

Strict TypeScript checks and the Vite production build pass. The unit suite has 58 passing cases, including all existing BLE/storage/scheduler regressions, all eight calibration records, exact approved Mode 4/10 data, 19-pixel mapping per side, frame selection, native loops versus one-shots, paused scrubbing/stepping, selected colors, Custom cuts/waits/loops and no-write output routing. All 20 Chromium browser tests pass, including 18 direct color comparisons against the approved HTML (Modes 4/10 × red/blue/green × three times), both SVG assemblies and numbered indicators, output isolation with connected mocks, offline playback, navigation, saved preferences/profiles, mobile layout and the complete existing workflows.

No physical hardware testing was performed. Preview-only controls do not pause or seek physical effects. Modes outside 3–10 have no supplied calibration and are explicitly identified instead of inventing a pattern.

## Native-speed extension

The initial native-speed work extended mode packet generation with an optional speed byte, retaining default 0x81, and passed 68 unit tests and 23 browser tests. The current shared timing resolver scales effective steps from preserved reference durations. Source-video findings and the distinction between Mode 10's capture window and full breathing cycle are documented in [NATIVE_SPEED.md](NATIVE_SPEED.md); the latest architecture and validation are in [SYNCHRONIZED_TIMING.md](SYNCHRONIZED_TIMING.md).

## Publication

Local validation is complete. The user explicitly approved publishing this integration for real-light testing. Deployment uses the existing GitHub Pages workflow and URL, preserving the site origin, browser storage and Bluetooth permission continuity. Physical measurements and phase behavior remain subject to the limitations documented above.
