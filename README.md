# WRX Dream BLE Controller

React + TypeScript + Vite migration of the existing two-controller WRX lighting app. Production URL: https://dylankral.github.io/wrx-ble-controller/ . The navy UI, 10 fixed Custom presets, Basic Modes 3–10, favorites/playlists, profile studio and complete calibration lab are retained. Overlap · 1.30s cut alternates Mode 7 and Mode 8 for 1.30 seconds each. Blue Overlap, standalone Chase, and standalone Flash have been removed from the fixed Custom library; Chase and Flash remain in Basic.

## Develop on Windows / VS Code

Install Node.js 24 LTS, open this repository folder in VS Code, then use a terminal:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the printed localhost URL including `/wrx-ble-controller/`. `npm.cmd` avoids PowerShell's script execution-policy restriction on `npm.ps1`; `npm` also works in Command Prompt and other configured shells.

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run preview
```

For optional WebKit mobile coverage, install `npx.cmd playwright install webkit`, then run `$env:WRX_TEST_WEBKIT='1'; npm.cmd run test:e2e` in PowerShell (or `WRX_TEST_WEBKIT=1 npm run test:e2e` on Unix). Default browser testing remains Chromium, preserving the existing Pages workflow.

`npm run test:watch` watches unit tests. Browser tests start/stop their own local server. `npm run preview` serves the compiled `dist` build. Dependencies are pinned by package-lock.json. No backend, account service, runtime environment variables, or service worker is required.

## Architecture

- `src/bluetooth`: real Web Bluetooth connection/recovery manager, exact packets, write fallbacks, shared serialization and per-controller exclusion.
- `src/animations`: baseline fixed preset/factory timing data, typed mode/color/wait steps, cancellable monotonic scheduler.
- `src/calibration`: original M02–M09, T01–T07 and C01 comparison definitions, timing recorder, CSV/JSON export.
- `src/storage`: versioned non-destructive studio migration, old favorites/playlists and complete configuration backups.
- `src/context`: shared Bluetooth manager and application state; navigation does not recreate connections.
- `src/components`, `src/pages`, `src/styles`: React views and the original organized navy stylesheet.
- `tests`: unit regressions, injected browser BLE mocks, and the original HTML fixture. Fixture and source TypeScript are excluded from production output.

[Migration checklist and complete behavior/storage audit](docs/MIGRATION.md). The archived HTML is the regression oracle, not a runtime dependency. `node scripts/extract-baseline.mjs` reproduces baseline data and the function/key inventory from that fixture; do not run it after editing extracted definitions unless intentionally resetting them to baseline.

## Calibrated animation previews

Animation preview is available on Main, Custom Testing, and Calibration Mode. **Combined** is the default: it previews requests while sending them to connected controllers. Choose **Simulation Only** to run Basic or Custom presets without Bluetooth commands, or **Hardware Only** to control the lights without a live preview. An explicitly saved output choice is restored on subsequent visits. The selected output and remembered RGB color are saved locally without changing existing profile keys.

The eight visual tracks, approved SVG and rendering helper are imported directly from `Animations/`. Mode 4 uses its approved 66 frames over 2.20 seconds. Mode 10 uses the revised 75 frames over a 2.50-second captured window, with approved enhanced fade on at 100%. Modes 4/10 use the latest selected or issued RGB color, including Custom color steps; other modes preserve recorded RGB. Basic Breathe requests its native loop once; the partial preview holds its final frame rather than inventing a full-cycle loop. Reference Custom step durations remain unchanged; effective playback times can follow speed.

In Development or Calibration, open **Preview controls and numbered LEDs** for visual-only play/pause, frame stepping, timeline scrubbing, RGB selection, and numbered indicators. These inspector controls never transmit commands or change the hardware scheduler. Physical calibration timing tests require Hardware Only or Combined. Combined can continue previewing if hardware is unavailable, with connection/write failures still reported.

See [integration review and validation](docs/CALIBRATED_PREVIEWS.md). The original package is preserved. Modes 4/10 match the approved reference; the other six tracks retain their source data and have not all been visually approved. Browser simulation does not establish physical LED response timing.

Main places the compact calibrated taillights at the top, below left/right connection actions and above Basic/Custom tabs. Speed sits immediately below the tabs, followed by the two-column presets, solid color and output settings. Solid color provides ten basic swatches and an expandable custom color wheel with hue, saturation and brightness adjustment; Apply color sends the chosen RGB to the lights. Technical inspection controls remain in Development/Calibration. The global Stop + Red bar follows the visual viewport and every page reserves its measured height. See [UI review, screenshots and validation](docs/ux-review/README.md).

## Native animation speed

The Main **Presets** section has one **Animation speed** slider directly below the Basic/Custom tabs. Its percentage indicates slider position, not measured physical speed. Stops are approximately 15% apart, with a dedicated **50% reference mapping exactly to byte 129 (`0x81`)**. Changes save/apply automatically after 180ms at a newly selected stop, or immediately on pointer/keyboard release, through the safe scheduler route. Rapid input is coalesced instead of sending a command for every movement. Cancellation, unchanged values and duplicate releases do not restart playback. Idle changes prepare future playback without starting an effect. On Custom, **Automatically adjust preset cut timing** controls the existing bundled Follow Animation Speed preference.

**Advanced Settings** on Main contains global/individual speed scope and the animation selector. Development and Calibration also provide full 1-255 byte entry/reissue and timing corrections. Saved per-mode preferences remain independent until explicitly changed; switching scope preserves both sets of values. Advanced byte edits still save for future steps, while **Apply speed and reissue mode** deliberately requests the selected animation through the existing safe playback route. The same speed tools are available outside the preview in Development and Calibration. Simulation Only never transmits BLE. See [control placement and behavior](docs/MAIN_SPEED_CONTROLS.md).

One timing resolver drives the preview and scheduler. Basic retriggers and the 10 bundled Custom presets follow native speed by default. **Follow Animation Speed** can be disabled for bundled cuts; personal profiles retain fixed timing unless explicitly enabled in Profile Studio. Mode steps scale their original cuts at playback time; RGB delays and independent Wait steps stay fixed unless explicitly linked to a mode. Studio displays original and calculated effective cuts without rewriting saved values.

Modes 4/10 retain their provisional video-derived ratios. Modes 7/8 now have independent optical phase-response measurements from the new native HappyLighting recordings, replacing their generic estimate. All 01/81/FF byte assignments remain tentative. Other unmeasured modes retain their existing adjustable estimate. Byte 129 always gives exactly 1×. Approved reference RGB frames/geometry are unchanged. Mode 4 scales its 2.20-second capture/retrigger interval, while Mode 10 keeps its 2.50-second capture separate from the measured ~3.54-second breathing period. Startup latency, intermediate response and restart/phase behavior still need physical validation. Calibration exports include the actual `native_speed` byte.

See [timing architecture, local validation and hardware test plan](docs/SYNCHRONIZED_TIMING.md) and [native speed evidence](docs/NATIVE_SPEED.md), including the original-video review and measurement CSV. Combined shows simulator updates and left/right sent, error or disconnected statuses independently; continuing the preview never establishes hardware delivery.

Basic Overlap and Reverse Overlap have separate **Basic repeat calibration** controls in Development/Calibration under Advanced Settings when Mode 7 or 8 is selected. Their 3.50-second defaults remain unchanged: the new app-recorded videos establish direction and visible color returns, but not a reliable shorter command interval. Adjustable Basic references scale through the existing native-speed model without changing the approved capture or Custom cuts. See the [new recording comparison and calibration notes](docs/OVERLAP_VIDEO_CALIBRATION.md).

The later **native HappyLighting** IMG_1602/1603 recordings are analyzed separately. They support per-mode red-to-cyan phase factors of approximately 2.356/1/0.356 (Mode 7 slow/reference/fast) and 2.397/1/0.362 (Mode 8). These are relative phase measurements, not full native cycles or Basic retrigger times. See [native speed findings and before/after SVG comparisons](docs/NATIVE_OVERLAP_SPEED.md).

## Browser data and backups

All data remains local to the browser. The old storage keys are retained, and data is never cleared on initialization. All 10 fixed profiles are compiled into the app independently of storage; personal profiles remain separate. Previous edited fixed slots become saved editable copies. Retired fixed slots and their direct buttons are omitted when reading old storage or backups, while personal copies and their assignments are retained. Favorite names, manual timing, playlist indices, button assignments/order, calibration logs, static color, Rainbow Chase Blue start color, tabs, and auto-restore preference are preserved.

Development → Custom Testing offers the original profiles JSON export/import plus **Export complete backup**. Complete backups include all WRX preferences, legacy data, calibration history and existing backup keys. Restore JSON backup accepts both formats. Back up before manually clearing site data. Localhost, another browser, and a different hostname have separate storage; the existing GitHub Pages origin remains unchanged for production access to old data.

Malformed saved data triggers a visible warning without overwriting its source. Export complete backup before repairing/importing. Storage quota failures are reported; do not close the page before exporting if changes cannot be saved.

## Physical Bluetooth testing

Use localhost or HTTPS with Android Chrome or Bluefy on iOS. Connect Left to **Dream-CF4B**, Right to **Dream-A90F**. Both are independently managed. Write service FFD5 / characteristic FFD9; known notification UUIDs FFD0 / FFD4 are exported but no animation-completion notifications are assumed.

Verified packets are unchanged: Mode 4 `9E0003819800E9`, blue `560000FF00F0AA`. Without-response writes are preferred with with-response and legacy fallbacks. Both connected lights receive each normal command. Previously authorized-device restore uses `navigator.bluetooth.getDevices()` when supported. Automatic retries are bounded and disabled after a manual disconnect or while the document is hidden. iOS can suspend timers and may require manual reconnect; keep the page foregrounded for sequences and calibration. Browser send/write timestamps are not physical LED response times.

For a hardware check, record the phone screen with both lamps. Check Mode 4, blue, red, one-pass versus internal-loop behavior, early cuts, custom colors, Stop + Red, disconnect/recovery, and background cancellation. Calibration provides visible cues and exports browser command timing for comparison to video. Mocks cannot establish physical compatibility.

Use this for parked show/testing control. Restore red and verify normal vehicle lighting before driving. A failed or disconnected device can retain its last effect; the app cannot confirm a lamp's physical color.

## GitHub Pages

Vite uses `base: '/wrx-ble-controller/'`. `.github/workflows/deploy.yml` installs dependencies, type-checks, runs Vitest and Playwright, builds, uploads **dist**, and deploys it with Pages Actions. Feature pushes/PRs validate without publishing. Main deploys only after validation succeeds. Set repository Settings → Pages → Source to **GitHub Actions**. The workflow needs `contents:read`, and its deploy job needs `pages:write` and `id-token:write`. The `github-pages` environment must allow main deployments.

The root index.html is a minimal Vite entry; production dist/index.html loads hashed compiled JS/CSS. Never publish source TSX directly. No custom domain or path change is made. Git history and the original fixture retain the previous implementation. To roll back, revert the migration on main and restore the previous Pages publishing configuration if returning to branch-based static hosting; export configuration before downgrading storage formats.
