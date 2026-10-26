# Main animation speed controls

Reviewed the latest `origin/main` at `a450723` (including synchronized timing) before working on `feature/main-speed-controls`. The user requested publication once implementation and validation are complete.

Main has one Animation speed control immediately below the Basic/Custom tabs and above the active-step cue and animation buttons. Its selected value is visible, with 129 marked as the reference. The Custom tab adds the labeled checkbox “Automatically adjust preset cut timing,” wired directly to the existing bundled-follow preference. Basic omits the checkbox. The navy layout fits 320px screens and supports keyboard adjustment.

The slider prepares a local selection. A deliberate **Apply speed** action saves it and calls the existing safe `applyNativeSpeed` route for the Mode step playing at the time of that action. A Custom sequence may advance while the slider is being adjusted; Apply resolves the runner's current step instead of sending a command for the mode at the start of the gesture. The existing scheduler handles generation cancellation, restart, dispatch anchoring, and deadline rebasing. The slider sends no commands on input, pointer release, or keyboard movement.

While idle or in a Color/Wait step, **Save speed** stores the selection for future Mode steps without interrupting playback or starting an unrelated effect. Unsaved slider selections do not overwrite saved speeds. This avoids changing several per-mode preferences when a fast sequence advances during a drag. In individual-speed mode, Apply changes only the current animation's saved byte; when idle, Save targets the animation selected under Advanced Settings. The label identifies the target mode. The global setting continues to affect every animation normally.

Advanced Settings is collapsed initially. It contains the scope options **Same speed for all animations** and **Individual speed per animation**, animation selector, exact byte entry, explicit test/reissue action, timing model/capture information, and per-mode corrections. Advanced byte edits retain their existing save-for-future behavior. The advanced reissue action retains its current-mode guard during playback. Switching scope keeps global and independent saved values intact. Existing per-mode users retain their saved scope; the interface does not silently switch them to global.

`SimulatorPanel` contains no speed controls. Development and Calibration mount the same shared controls outside their preview, with only the active page mounting them, so no hidden duplicate sliders exist. Calibration locks all speed editing as before. Preview output and delivery reporting are unchanged.

No changes were made to the timing resolver, scheduler, BLE protocol/output router, storage schema, calibrated animation assets, or preset reference definitions/durations. Simulation Only, Hardware Only and Combined continue to use the same resolved native byte, factors and safe scheduler mechanisms. Personal profile timing policies remain unchanged.

Modified files:

- `src/components/NativeSpeedControls.tsx`: compact shared control and Advanced Settings.
- `src/styles/native-speed.css`: navy layout and mobile sizing.
- `src/components/SimulatorPanel.tsx`: removes speed controls from the preview.
- `src/pages/MainPage.tsx`, `CustomTestingPage.tsx`, `CalibrationPage.tsx`: place a single control on the active page.
- `tests/browser/mainSpeed.spec.ts`: placement, keyboard/reference value, preference persistence, per-mode targeting, deliberate Apply, rebase and Stop + Red across all three output modes.
- `tests/browser/nativeSpeed.spec.ts`: relocates existing advanced-control coverage and verifies calibration locks the primary slider.
- README and native-speed/timing documentation: current control location and behavior.

Validation includes the existing animation/storage/calibration regressions and new browser coverage for visible placement, a single slider, accessible Custom checkbox, exact scope labels, no commands during slider changes, safe current-step Apply, saved preferences/corrections, and the mobile layout. Physical speed-model accuracy and controller restart semantics remain subject to the existing calibration limitations.

Local validation passed: TypeScript, all 85 unit tests, all 36 Chromium browser tests, the production Vite build, and `git diff --check`. Screenshots and layout checks cover the compact 320px controls and existing 320/390/768px views. The build retains the existing bundle-size advisory; no build errors occurred.
