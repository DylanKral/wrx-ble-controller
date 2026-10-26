# Shared native speed and sequence timing

The synchronization changes were developed on `feature/synchronized-timing`, based on `origin/main` (`568a5ee`). After reviewing the completed implementation and local validation, the user approved publication for real-light testing. Publishing uses the existing GitHub Pages workflow, including its required validation before deployment.

## Timing architecture

`src/animations/timing.ts` is the shared timing service. A request resolves its speed byte and animation factor once. `effectiveMs = referenceMs × factor` is evaluated at playback, without rounding or modifying the stored cut. Byte 129 is exactly 1×. Basic profiles opt into timing; bundled Custom profiles inherit the saved bundled-follow preference, initially enabled. Personal profiles without `followAnimationSpeed: true` retain their existing fixed intervals. With Follow enabled, RGB and Wait delays still remain fixed unless a step explicitly stores `timingMode` identifying its speed source. Disabling Follow keeps all step times fixed, retaining any saved source links for later use. A fixed cut still plays the animation at its chosen native speed; it simply retains its manual transition deadline.

`Scheduler` accepts a timing resolver, so replacing a mode's curve does not require scheduler changes. The default resolver uses video-derived relative Mode 4/10 curves from `nativeSpeed.ts`; source frames, timestamps, brightness and selected-color rendering are untouched. For unmeasured modes, provisional slow/fast endpoint factors are the geometric mean of the observed Mode 4/10 ratios:

- Slow: `sqrt((3.79 / 1.69) × (6.30 / 3.54))`.
- Reference: exactly `1`.
- Fast: `sqrt((0.60 / 1.69) × (0.54 / 3.54))`.

Duration is interpolated logarithmically on tentative bytes 1/129/255. These are estimated responses for unmeasured modes, not physical measurements. The existing observed curves remain unchanged at correction 1. A per-mode correction exponent in 0.25–4 adjusts response strength while preserving the reference: `factor = clamp(rawFactor ** correction, 0.05, 10)`. Finite, positive bounds protect both clocks. Future calibrated curves can replace mode response selection in this service. The UI distinguishes video-derived provisional curves from unmeasured estimates; the byte assignments remain tentative for both.

`nativeSpeedPreferences.ts` loads version 2 at the existing storage key. Fresh settings use global 129. Valid version 1 per-mode speeds select independent scope on migration, retaining the values and prior preview flags. Switching scope preserves both the linked value and independent values. Initialization never overwrites old/malformed settings. Existing studio reference values remain unchanged; optional profile/step timing fields are validated and retained through import/export. A duplicated fixed preset explicitly retains the follow policy selected when copied. Complete backups include speed preferences through the existing raw-key export.

## Scheduling, dispatch and speed edits

`Scheduler` owns one runner using `performance.now()`. Each Mode step captures its native byte, animation factor, cut factor and effective duration together. `DispatchOptions` carries the captured animation factor into `PlaybackOutput` and `Simulator`, including while waiting in a BLE queue. A future preference/correction edit cannot retime the already-issued command or give the preview a different clock from its deadline.

BLEManager reports the first per-controller browser write dispatch. That event starts the preview and anchors the step deadline. Subsequent side dispatches and completion/failure are reported separately; the first side's timestamp does not imply simultaneous activation of both lamps. With no hardware in Combined, or in Simulation Only, the local preview dispatch anchors the deadline instead. Browser write completion is not optical confirmation.

Changing a saved speed prepares future steps. Apply during playback requires selecting the current Mode step, invalidates the old command generation, wakes the runner, reissues that mode, and starts a fresh effective interval from its dispatch. It also resets the preview intentionally. Color/Wait steps cannot be bypassed by an independent Apply command. Applying with no active sequence requests the selected mode once. Native continuous Basic playback can be restarted through the same scheduler. Profile definitions are captured at sequence start; editing a personal profile's follow policy applies to its next run.

The BLE queue checks generation/output validity immediately before each side's write; stale queued requests cannot dispatch. Stop, output changes, foreground loss and new playback invalidate applicable pending work. Stop + Red cancels the scheduler before requesting static red. A write already submitted to the browser cannot be recalled. Per-side exclusion prevents overlap with calibration writes; a stalled hardware request is bounded by the existing six-second timeout. Waiting for a slow write can still make a transition late; the scheduler records lateness and never sends a burst to catch up. This is best-effort browser scheduling, not real-time firmware control.

## Basic Chase and Breathe

Mode 4 retriggers after `2200 × durationFactor(4, byte)` milliseconds. The 1.69-second illuminated transition measurement supplies only relative ratios; it never replaces the 2.20-second approved calibration. Intentional retriggers restart the preview even at the same byte; redundant legacy continuous requests remain suppressed.

Reviewed [existing video analysis and evidence](NATIVE_SPEED.md), including the original IMG_1573 capture, contact frames, minima CSVs and IMG_1586/1587 breathing intervals. Consecutive cycles appear without repeated visible mode selections: IMG_1586 minima 2.10/5.633/9.20/12.733 seconds; original IMG_1573 candidate minima 4.133/7.667/11.233 seconds. This supports inferring native continuous Breathe, but no synchronized HCI recording excludes unseen repeated commands. Basic Mode 10 now requests the mode once and stays active until stopped; its reference full period is documented as ~3.54 seconds. Physically confirm this single-command behavior.

The approved 75-frame capture spans 8.584–11.084 seconds of IMG_1573, only 2.50 seconds. It cannot supply a complete ~3.54-second waveform. The preview plays this window at the shared factor and holds its final approved frame; repeat is disabled for Mode 10, including the inspector API. No missing frames or intensities are synthesized. Selected RGB inheritance and the approved enhanced 100% fade remain intact. The displayed full-cycle estimate is separate from captured-window duration.

## Independent delivery and interface

The later [Main speed control update](MAIN_SPEED_CONTROLS.md) relocates everyday speed selection below the Presets tabs and moves scope/calibration controls under Advanced Settings outside the simulator. It preserves the timing architecture and preferences documented here.

`PlaybackOutput.send()` returns whether playback may continue, not proof of hardware delivery. Its subscribed status reports simulator update separately from left/right queued, writing, sent, error, disabled and disconnected states. Combined continues its valid preview on failed/disconnected hardware. Static/apply notifications include those independent results instead of interpreting Combined's continuation boolean as successful delivery. Physical calibration retains its existing per-side recorder and exact offsets.

The existing navy Native animation speed section contains scope, slider/byte entry, bundled Follow Animation Speed, reference/effective capture durations, current active cut, and per-mode curve correction. Profile Studio shows each Original Cut and Effective Cut or an unchanged fixed time; personal opt-in and explicit RGB/Wait timing links are stored separately from reference values. The main preset grid and deployment configuration remain unchanged. Combined stays the default output when no valid saved output choice exists.

## Validation and remaining physical checks

Local validation: `npm.cmd run typecheck`, all 85 unit tests, all 28 Chromium browser tests, `npm.cmd run build`, and `git diff --check` passed. Browser coverage includes expanded speed/Studio controls at 320px and the existing 320/390/768px layouts. Breathe's exact 3.54-second favorite reference saves and survives refresh despite the manual 50ms grid; existing legacy Mode 10 manual durations are preserved. The build reports its standard chunk-size advisory for the ~501 kB application bundle (~140 kB gzip); there are no build errors. No physical hardware test was performed.

Automated validation covers all reference/slow/fast factors, every byte's bounded monotonic response, two mathematical intermediate values per observed mode, bundled and personal fixed/follow behavior, per-mode sequence factors, fixed RGB/Wait gaps, preference migration/import/export, Mode 4 retriggers, Mode 10 native-once/partial-window behavior, dispatch anchoring, factor snapshots, rapid active-speed cancellation, Stop + Red, Simulation Only isolation, independent Combined failures, and matching speed packets to both controllers. The existing calibration, BLE, storage, favorites, playlist and approved-pixel comparisons remain in place.

Physical testing still required, parked with normal vehicle lighting preserved:

1. Log exact bytes alongside video for 1/129/255 and at least two intermediate values per mode. The current intermediate tests validate interpolation mathematics only.
2. Verify Mode 4 finishes without premature retriggers at slower bytes, and compare fast/slow early cuts. Calibrate unmeasured modes instead of assuming the fallback is accurate.
3. Send Mode 10 once and observe several cycles without further app commands. Record a complete spatial breathing waveform before adding a full visual loop.
4. Verify whether same-mode/speed reissue and active speed Apply reset hardware phase. Compare browser dispatch logs with visible activation and left/right latency.
5. Exercise active Apply, Stop + Red, disconnected/failed sides and background recovery. A disconnected lamp may retain its previous effect; a sent write does not prove its visible color.

No phase-locked synchronization, exact optical activation time or complete 255-byte physical transfer curve is established.

## File inventory

- Timing/playback: new `src/animations/timing.ts`, new `src/animations/dispatch.ts`, and updated `src/animations/scheduler.ts`, `factoryModes.ts`, `types.ts`, `src/context/AppContext.tsx`, `src/simulation/Simulator.ts`, `PlaybackOutput.ts`, `src/bluetooth/BLEManager.ts`.
- Persistence: `src/storage/nativeSpeedPreferences.ts`, `src/storage/migrations.ts`, `src/storage/legacy.ts` (measured favorite reference validation and legacy Mode 10 timing preservation).
- Interface: `src/components/NativeSpeedControls.tsx`, `ProfileStudio.tsx`, `SimulatorPanel.tsx`, `StatusBar.tsx`, `Favorites.tsx` (accept exact measured references), `src/pages/MainPage.tsx`, `src/styles/simulator.css`.
- Regression coverage: new `tests/timing.test.ts`, updated `tests/nativeSpeed.test.ts`, `tests/baseline.test.ts`, `tests/browser/nativeSpeed.spec.ts`, `tests/browser/mockBluetooth.ts`. The baseline oracle allows only the intentional Basic timing/Mode 10 changes while retaining exact bundled Custom and calibration-command comparisons.
- Documentation: `README.md`, `docs/NATIVE_SPEED.md`, `docs/CALIBRATED_PREVIEWS.md`, this report.

`Animations/*`, bundled Custom reference definitions, protocol command generation, calibration definitions, dependency manifests, the original HTML fixture and GitHub Pages configuration are unchanged.
