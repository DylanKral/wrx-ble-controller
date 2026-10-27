# Mobile UI review — 2026-10-26

Remote `DylanKral/wrx-ble-controller` main was checked through the GitHub connector at `666ea55b297de5f1333f8bb10ea240176362ab06`, matching the implementation's base. Existing speed-position, native-overlap and Basic-repeat calibration work was reviewed and retained. The user authorized deployment on 2026-10-26 after reviewing the completed local changes.

## Main layout

The latest requested order is: compact left/right connection actions, **simulation at the top**, Basic/Custom tabs, animation speed, two-column presets, solid color and output settings. The preview uses the existing dual-taillight SVG and calibrated frames with only an animation name and small output/playback indicator. The 8 Basic and 10 bundled Custom buttons retain their labels and behavior, with a selected state and necessary Rainbow Chase starting-color control.

Exact byte controls, timing corrections, frame inspection, scrub/play/pause controls and numbered LEDs remain in Development/Calibration. Main includes global/independent speed scope under Advanced Settings. Reconnect/auto-connect tools remain in the detailed connection panels. The shared color state keeps solid RGB and Modes 4/10 synchronized. Combined remains the default unless a saved output preference specifies otherwise.

## Automatic speed

Nine stops map to native bytes `1, 39, 78, 116, 129, 154, 192, 230, 255`; 50% is exactly 129. Percentages represent slider position. A 180ms coalescer commits stable input, with immediate release/keyboard commit. Active modes rebase through the existing scheduler. Color/Wait steps continue uninterrupted; idle edits never start a mode. Global scope reaches subsequent Mode commands, while Independent retains per-mode values and corrections. Rendering and navigation do not rewrite existing exact saved bytes. Full details: [speed behavior](../MAIN_SPEED_CONTROLS.md).

WebKit testing found that manually calling `setPointerCapture` prevented its native range thumb from dragging. Removing explicit capture restores browser-native dragging. Keyboard navigation also accounts for native-byte quantization, avoiding repeated selection of the same 15% stop.

## Playback bar investigation and fix

The original bar already used `position: fixed; bottom: 0`. No transformed fixed-position ancestor was found in App/root/main. Root scrolling remains native document scrolling; no fixed `100vh` shell or nested page scroller was added. The original page clearance was inconsistent: Main reserved a hard-coded 114px, while Development and Calibration only had their normal 30px bottom padding. Body and bar also each applied bottom safe-area padding.

The likely iPhone-specific positioning mechanism is a mismatch between the layout and visual viewport during toolbar or keyboard changes. This is an inference: the referenced iPhone screenshot was not present in the attachment, and no physical phone was connected. Browser UI and keyboards can change the visual viewport independently of layout, as documented by [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) and [Apple's Safari layout guidance](https://developer.apple.com/videos/play/wwdc2021/10029/).

The bar is now portaled directly into `document.body`. A small lifecycle helper measures the actual bar rectangle against `visualViewport.offsetTop + visualViewport.height`, applying only the observed difference. This avoids double-correcting engines that already reposition fixed bars. Updates run on viewport/window resize and scroll, page show, visibility and focus events, coalesced with requestAnimationFrame. Pinch zoom retains native behavior. ResizeObserver measures the bar, and all three pages reserve its measured height plus any obscured viewport region. Safe-area padding belongs to the bar; duplicated body padding is removed. Inputs use 16px text to avoid common iPhone focus zoom.

The bar shows one compact animation/status caption and Stop + Red, plus Play test in Development. Detailed delivery errors and messages are in Main's Connection status disclosure and Development's delivery/activity components. Returning to a visible page updates the current browser status without restarting stopped hardware sequences. Existing Stop + Red cancellation and BLE serialization remain intact.

## Before/after screenshots

Before captures reflect the original working tree, including the user's pending calibration work. After captures show the requested top simulation. All use an 844px viewport height and clean browser storage, without real Bluetooth connections.

| Width | Before | After | Full-page after |
| --- | --- | --- | --- |
| 320px | [top](before/main-320-top.png) | [top](after/main-320-top.png) | [full](after/main-320-full.png) |
| 375px | [top](before/main-375-top.png) | [top](after/main-375-top.png) | [full](after/main-375-full.png) |
| 390px | [top](before/main-390-top.png) | [top](after/main-390-top.png) | [full](after/main-390-full.png) |
| 430px | [top](before/main-430-top.png) | [top](after/main-430-top.png) | [full](after/main-430-full.png) |
| 768px | [top](before/main-768-top.png) | [top](after/main-768-top.png) | [full](after/main-768-full.png) |

The [after directory](after/) also contains top, middle and bottom captures of Main, Development and Calibration at every width. Browser tests additionally capture the same scroll matrix in Chromium and WebKit under `test-results/`. Reproduce the permanent screenshot set with `node scripts/capture-mobile.mjs after` while the local server runs on port 4173.

## Validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: 104 unit tests passed, including mapping/reference-byte, native-speed models, stale scheduler generations, BLE isolation, storage, calibration and approved rendering.
- `WRX_TEST_WEBKIT=1 npm run test:e2e`: 70 browser tests passed (47 Chromium + 23 WebKit). In PowerShell, set `$env:WRX_TEST_WEBKIT='1'` before the command.
- `npm.cmd run build`: passed; Vite retains its existing large-chunk advisory (about 507kB JavaScript before gzip).
- `git diff --check`: passed.

After adding the final assistive-technology adjustment handling, all 22 Chromium/WebKit speed tests passed again, as did typecheck and the production build.

Browser coverage includes all five requested widths, top/middle/bottom scrolling on all three pages, portrait/landscape, resized browser viewport, synthetic visual-viewport toolbar/keyboard changes with nonzero offsetTop, no horizontal overflow, last-content clearance, Stop + Red access, visibility restoration, actual range dragging and held keys, rapid coalescing, duplicate commits, native-loop single dispatch, current-step targeting, Custom cut timing, Color/Wait behavior, exact preference retention, all output modes, and Mode 4/10 rendering against the approved reference.

Default `npm run test:e2e` remains Chromium. WebKit is explicitly opt-in so the existing Pages workflow and its Chromium-only browser installation stay unchanged. Install it with `npx playwright install webkit` before opting in.

## Files changed in this UI pass

- `src/pages/MainPage.tsx`: layout, settings and compact controls.
- `src/components/ConnectionPanel.tsx`, `Navigation.tsx`, `PresetButton.tsx`: compact per-side actions, navigation and selected preset buttons.
- `src/components/NativeSpeedControls.tsx`, `src/context/AppContext.tsx`: automatic discrete commits, safe scheduler targeting, RGB synchronization and visibility status.
- `src/components/SimulatorPanel.tsx`: compact Main rendering; full inspector retained in Development/Calibration.
- `src/components/StatusBar.tsx`, `src/layout/playbackBar.ts`: concise body-level bar, visible-viewport positioning and measured clearance.
- `src/main.tsx`, `src/styles/controller.css`: shared navy design system, responsive spacing, safe areas and page clearance.
- `tests/browser/app.spec.ts`, `mainSpeed.spec.ts`, `nativeSpeed.spec.ts`, `simulation.spec.ts`, `basicRepeat.spec.ts`, `mobileLayout.spec.ts`: updated regressions and mobile coverage.
- `playwright.config.ts`: named Chromium and optional WebKit projects.
- `scripts/capture-mobile.mjs`, this screenshot set, `README.md`, `docs/MAIN_SPEED_CONTROLS.md`, `docs/NATIVE_SPEED.md`: capture tooling and current behavior documentation.

The earlier working-tree animation/model, storage and calibration changes remain in place. This pass did not edit reference durations, calibrated assets, LED mapping, the scheduler implementation, BLE packets, GitHub Pages routes or deployment configuration.

## Physical-device limitations

Windows Playwright WebKit is useful engine coverage, but it does not emulate iPhone Safari/Bluefy browser chrome, real software-keyboard animation, every safe-area configuration, or actual Bluetooth radios. The viewport-change tests inject representative visual-viewport events and dimensions; physical iPhone portrait/landscape toolbar collapse/expansion and keyboard dismissal still need confirmation. [WebKit issue 292603](https://bugs.webkit.org/show_bug.cgi?id=292603) also documents platform-specific root/safe-area keyboard behavior that desktop tests cannot establish on a particular installed iOS version. No claim is made that the original phone-only cause has been reproduced. Mode 10's partial capture is unchanged and no frames were fabricated.
