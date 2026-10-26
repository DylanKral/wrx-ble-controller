# Native speed calibration and local integration

Mode packets now accept a native speed byte: `9E 00 [mode−1] [speed] 98 00 E9`, speed 1–255, default `81` (129). With no new settings the verified Mode 4 packet remains `9E0003819800E9`. RGB packets, custom step durations, early cuts, fixed profiles and recorded LED colors/brightness are unchanged.

## Evidence and uncertainty

The user supplied measurements from IMG_1585(1).mp4 (45.2333 s), IMG_1586(1).mp4 (14.3667 s), and IMG_1587(1).mp4 (28.3667 s), all 512×910 at 30 fps. The reported method tracked red intensity/hot pixels in roughly x=205..500, y=425..615. The individual observations are preserved in [native-speed-measurements.csv](analysis/native-speed-measurements.csv).

| Mode | Metric                                        | Slow   | Reference | Fast   |
| ---- | --------------------------------------------- | ------ | --------- | ------ |
| 4    | Illuminated transition, not complete one-shot | 3.79 s | 1.69 s    | 0.60 s |
| 10   | Full breathing cycle                          | 6.30 s | 3.54 s    | 0.54 s |

These videos were not synchronized with logged speed bytes. Assigning slow/reference/fast to bytes 01/81/FF is tentative. Measurements are limited by frame granularity, threshold selection, rolling shutter and exposure. The slow Mode 10 estimate has only one unambiguous cycle and lower confidence. Fast pulses may be affected by camera sampling. These estimates do not measure startup latency, prove restart semantics, or establish a full transfer curve or synchronization between independent controllers.

## Original source video review

The supplied reference folder now contains `Calibration Videos` and `Speed Videos`, with the eight original clips IMG_1563–IMG_1573 and all three newer IMG_1585–IMG_1587 speed recordings. Metadata for all eleven confirms 512×910 at 30 fps; [reference-video-review.json](analysis/reference-video-review.json) records their lengths. The newer clips' decoded durations match the supplied 45.2333/14.3667/28.3667 seconds.

The approved Mode 10 calibration identifies IMG_1573.mp4 and starts at 8.584 s. Its 75 frames cover a 2.50-second window ending at 11.084 s. Exploratory median blue-channel samples at the calibration's 19 point locations, smoothed over five frames, find candidate minima near 4.133, 7.667 and 11.233 s (separations approximately 3.53/3.57 s). The approved window does not span a complete consecutive-minimum interval. This independently supports retaining it as a partial capture rather than declaring a 2.50-second breathing period. These candidates are not a new verified speed calibration or an exact byte assignment.

The original video and approved calibration remain unmodified. [Contact frames](analysis/mode10-original-capture-contact.png) show the original capture interval; [the intensity CSV](analysis/mode10-original-intensity.csv) retains the point-sampling trace. The revised approved brightness array is retained even where camera measurements, exposure or older source metadata differ.

## Direct check of the new speed recordings

All 2,639 frames of the three newer clips were decoded. The [speed-video contact frames](analysis/native-speed-video-contact.png), [review JSON](analysis/native-speed-video-review.json), and per-frame red-intensity CSVs in `docs/analysis` retain the checks. The method used the supplied ROI, a red-hot mask `R > 150, R > 1.3G, R > 1.3B`, and a three-frame moving average. Breathe minima were checked in local ±0.20-second windows around the supplied observations, rather than presented as a separate blind detection experiment.

For IMG_1586, the local minima occur at 2.100/5.633/9.200/12.733 seconds, giving 3.533/3.567/3.533-second intervals. For IMG_1587, the slow pair gives 6.300 seconds; the later fast run gives 0.533/0.567/0.533 seconds. Its locally selected phase is about 2–3 frames earlier than the supplied minima, but the inter-cycle timing is consistent. The gap between slow and fast groups is not interpreted as a cycle.

Chase threshold crossings are endpoint-sensitive: at a 75% local hot-pixel baseline threshold the reference windows are approximately 1.70/1.77 seconds, slow windows 3.90/3.87 seconds, and fast windows 0.63/0.63 seconds. Higher thresholds yield longer intervals and may include exposure/steady-state noise. This supports distinct timing groups and the transition-versus-complete-animation distinction; it does not justify silently replacing the user's 1.69/3.79/0.60-second grouped estimates or the approved 2.20-second frame calibration. The implementation retains the user-supplied ratios.

The visible app slider positions and lamp behavior support qualitative grouping. They do not supply independently logged native bytes, two verified intermediate speed samples per mode, or a controlled phase-reset test. The mapping remains opt-in and provisional after reviewing these videos.

To reproduce the optional video review from the repository root (these Python tools are not application dependencies):

```powershell
py -m pip install --target test-results/video-tools numpy opencv-python-headless pillow
py scripts/review-reference-videos.py --videos "C:\Users\Dylank\Downloads\WRX_LED_STUDIO_V4_SMALL\videos"
```

Playwright cleans `test-results`, so reinstall the temporary analysis tools if needed after a browser test run. The source videos remain outside the application and are never bundled for deployment.

## Provisional timing model

Each mode has an independent, opt-in preview-timing preference, off initially. Only Modes 4 and 10 have a model. Other modes accept native bytes but keep their original preview clock because speed-response measurements are unavailable.

For each modeled mode, interpolate observed **duration** logarithmically between tentative byte anchors 1/129/255, then divide by its observed reference duration. This yields a relative duration factor. Mode 4 uses ratios 3.79/1.69, 1 and 0.60/1.69; its approved 66-frame 2.20-second capture is preserved and played with that relative clock factor. The 1.69-second transition measurement never replaces its 2.20-second calibration.

Mode 10 uses ratios 6.30/3.54, 1 and 0.54/3.54. Those factors adjust playback of the existing 75-frame **capture window**. The separately displayed estimated full cycle is 3.54 seconds × factor. The capture is never stretched into a supposed complete breathing waveform or silently replaced with a 3.54-second loop. Existing factory loop classifications and Custom dwell times remain intact. Preview repetition explicitly repeats the captured window.

The simulator uses an absolute monotonic clock. Toggling the provisional mapping keeps the current frame position. A reissued mode with a different byte restarts the preview at frame zero as a stated assumption; whether hardware restarts is still unverified. Resending the same mode at the same byte keeps the existing same-mode behavior.

## Controls, persistence and logs

Open **Native animation speed** on Main or either Development view. Choose the mode and speed byte. Editing the value prepares future requests without sending anything. **Apply speed and reissue mode** issues one mode request at the selected byte; Simulation Only routes it solely to the preview. An active custom sequence retains its deadlines and continues independently. Its future mode requests use the saved per-mode byte. Speed controls are locked during a physical calibration run to avoid unintended mid-test changes.

Speeds and opt-in flags use the new `wrx-native-speed-preferences-v1` key; old profile/favorite/playlist data is untouched. Missing speeds use 129. Malformed settings are not overwritten on initialization. The complete existing configuration backup includes this key automatically.

Calibration tests use the chosen per-mode bytes and append `native_speed` to request/start/completion/skip/error events and CSV exports. Full HEX remains recorded, allowing exact native bytes to be matched with future footage. Existing timing offsets remain unchanged.

## Verification limits

Automated tests check defaults, all 255 legal bytes, anchor ratios, two intermediate bytes per modeled mode, monotonic interpolation, opt-in behavior, native-speed/dwell separation, preview phase assumptions, settings and actual mocked dispatch/logging. Numerical curve tests establish implementation consistency only. Physical measurements at intermediate values and synchronized byte/video captures are still needed before claiming close timing agreement. The user approved deployment of this integration for real-light testing after local validation.

Local validation passed: 68 unit tests, 23 Chromium browser tests, strict TypeScript checks, production Vite build, and `git diff --check`. The original video files and the supplied `Animations` package remain unchanged. The Pages workflow repeats validation before publishing the compiled application at the existing production URL.
