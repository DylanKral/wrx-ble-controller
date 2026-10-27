# Basic Overlap video review and adjustable retriggers

The subsequent [native HappyLighting analysis](NATIVE_OVERLAP_SPEED.md) uses different recordings (IMG_1602/1603) to improve speed factors. It preserves the independent Basic reference intervals and conclusions below; native phase durations are not substituted for Basic retrigger defaults.

Reviewed latest `origin/main` at `666ea55`, including synchronized timing and the already completed Main speed-control relocation. This work was prepared on `feature/overlap-video-calibration`. The user subsequently authorized deployment of the integrated controller update on 2026-10-26; see the [mobile UI review](ux-review/README.md).

## Recording comparison

Both files were found in the supplied external `videos/Calibration Videos` folder. Every frame was decoded: 429 in IMG_1600 and 347 in IMG_1601, totaling 776. Both are 512×910 at 30 fps. The user confirmed native speed 129 in both; neither recording itself shows a speed readout, app build identifier or synchronized command log.

| Recording    | Duration | Direction in steady segment, compared with approved tracks                                | Identification                               |
| ------------ | -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| IMG_1600.mp4 | 14.300 s | Lower inner end (zone 19), around the lower/outside corner, toward top inner end (zone 1) | Mode 7 / Overlap in its steady later segment |
| IMG_1601.mp4 | 11.567 s | Top inner end (zone 1), around the top/outside corner, toward lower inner end (zone 19)   | Mode 8 / Reverse Overlap                     |

The identification uses the direction of traveling color fronts, not filename order. IMG_1600's opening ~3.8 seconds contains multiple fronts and stronger white clipping; it is unsuitable as a clean steady-repeat reference. The footage does not establish whether a mode switch or another event caused that opening behavior. Its later red fronts consistently travel in the Mode 7 direction. IMG_1601 consistently follows Mode 8's opposite direction.

Evidence: [Mode 7 front frames](analysis/overlap/IMG_1600-fronts.png), [Mode 8 front frames](analysis/overlap/IMG_1601-fronts.png), and [all-frame zone timelines compared with the approved tracks](analysis/overlap/zone-timelines.png). The numbered end points identify the same logical path in both clips. Analysis-only sample points do not replace the production 19-zone mapping.

## What can be timed

| Recording | Comparable optical landmarks                                                   | Visible return interval           |
| --------- | ------------------------------------------------------------------------------ | --------------------------------- |
| IMG_1600  | Lower-inner red onset ~3.867 → 10.233 s; top-inner red onset ~4.467 → 10.800 s | ~6.37 s and ~6.33 s, respectively |
| IMG_1601  | Top-inner red onset ~2.200 → 7.167 s; lower-inner red onset ~2.767 → 7.733 s   | ~4.97 s in each case              |

These are **matching color-front returns**, not app repeat intervals, complete native animation durations, or Bluetooth dispatch timestamps. Across the 19 sampled zones at the central threshold, the matched returns range ~6.33–6.60 seconds in IMG_1600 and ~4.93–5.00 seconds in IMG_1601. Some first-clip crossings are less clean because of its mixed opening. The full-path red front travels for roughly 0.57–0.60 seconds; that is also not the whole animation duration.

Each clip supplies only one clean homologous return interval in the selected steady segment. Sampling many zones of that same wave does not create independent repeat observations. At 30 fps each frame is ~33 ms; allow at least two frames (~67 ms) uncertainty in an interval, with additional uncertainty from exposure/clipping, point registration and threshold choice. No uncertainty bound turns an optical landmark into a dispatch measurement.

The app-controlled Basic command schedule must be distinguished from the color motion produced by the controller. The observed returns do not identify every reissued command or reveal whether a reissue restarted its internal phase. They therefore do not establish a reliable shorter preferred retrigger value. This review neither interprets the clips as uninterrupted HappyLighting selections nor treats app retriggering as a new LED pattern uploaded to hardware.

## Decision and exact implementation

**Do not shorten either 3,500 ms default based on these clips alone.** The current value remains an app reference, not a newly measured native duration. The approved Mode 7/8 captures remain 3.50 seconds and 105 frames each; the clips do not justify replacing those frames or assuming that their observation window proves the complete native duration.

Instead, each Basic effect now has an independent adjustable retrigger reference:

- In **Advanced Settings**, choose Mode 7 or 8 and expand **Basic repeat calibration**.
- Enter a reference interval at speed 129, from 0.50 to 10.00 seconds in 0.05-second increments. Both defaults remain 3.50 seconds; reset restores that default.
- Changes save for subsequent Basic retriggers. The current step keeps its captured deadline. To restart/rebase it immediately, deliberately use the existing reissue action for that current Mode step.
- `effective interval = chosen reference × existing durationFactor(mode, selected byte)`. At 129 the factor is exactly one. Other-speed Mode 7/8 response remains estimated; these two reference-speed videos do not calibrate a full speed curve.
- The same request carries its resolved factor into simulator playback. Intentional retriggers restart the approved track at actual browser dispatch via the existing scheduler/output route. No extra gap, independent timer, crossfade or synthetic frame loop is added. Physical phase-reset behavior still needs confirmation.

Implementation files:

- `src/animations/basicRepeatTiming.ts`: explicit defaults, bounds and Basic-only reference substitution. `factoryModes.ts` marks just the two Basic profiles with an internal policy. `CAL`, other Basic intervals, favorites and all fixed Custom definitions are unchanged.
- `src/storage/basicRepeatPreferences.ts` and the `wrx-basic-repeat-calibration-v1` key: separate versioned preferences, validated without initialization writes. Complete backup/import already includes the key. Native-speed preferences and old profile data are not rewritten.
- `src/context/AppContext.tsx`: feeds the Basic reference through the existing shared timing resolver. Scheduler, protocol commands and simulator rendering are unchanged.
- `src/components/NativeSpeedControls.tsx`: advanced calibration fields, reference/effective interval and capture-duration distinction. The compact Main slider, understandable scope labels, Custom checkbox, explicit Apply, mobile layout and output modes remain in place.
- `tests/basicRepeat.test.ts`, `tests/browser/basicRepeat.spec.ts`, and the baseline oracle: cover configurable references, both controllers, slow/reference/fast scaling, dispatch-aligned preview restart, rebase/cancellation, saved settings/backups, unchanged captures, and unchanged 1.30-second Custom cuts. Test overrides 3.00/3.15 seconds are arbitrary regression inputs, not measured preferred values.

Personal/imported profiles cannot acquire the internal Basic policy through normalization. They retain their own timing. No unrelated Custom time is automatically changed or proposed for change. The original video files, approved animation package, BLE commands, per-LED brightness/colors and Pages configuration remain untouched.

## Reproducible analysis

[review.json](analysis/overlap/review.json) contains source hashes, decoded metadata, point locations, registration quality, all detected red events and threshold-sensitivity checks. The two `*-zones.csv` files retain RGB samples and presentation timestamps for every frame. Representative registered point overlays and front frames are included for inspection.

```powershell
py -m pip install --target test-results/video-tools numpy opencv-python-headless pillow
py scripts/analyze-overlap-videos.py --videos "C:\Users\Dylank\Downloads\WRX_LED_STUDIO_V4_SMALL\videos\Calibration Videos"
```

The analysis tracks stable features outside the illuminated area using optical flow and RANSAC, samples 5×5 RGB medians at 19 analysis points, and checks sustained red onset at three color-ratio thresholds. Homologous wave windows were selected by visual inspection and are recorded explicitly. It does not automatically infer hidden commands from the waveform. Playwright clears `test-results`, so reinstall the temporary analysis libraries before reproducing the review after browser tests. These tools are not application dependencies.

## Additional capture needed

Record Mode 7 and Mode 8 separately, with the phone screen and lamps visible together. Show the selected mode, byte 129, chosen Basic repeat reference and a common timing cue. Keep the page foregrounded and capture at least 8–10 repetitions without changing mode or speed. Include synchronized browser write-dispatch timestamps or an HCI log of `9E 00 06/07 81 98 00 E9` requests. A visible cue ties those timestamps to video; the first LED response will still have optical startup latency.

Also record an uninterrupted single mode request through the advanced test/reissue action to distinguish native animation progression from app-controlled repeats. Compare shorter candidate intervals against 3.50 seconds in separate labeled runs. That evidence can support a preferred default and test whether same-mode reissue resets phase, rather than inferring either from color returns alone.

Local validation: TypeScript, 94 unit tests, 37 Chromium browser tests and the production Vite build passed. The build retains the existing bundle-size advisory. No physical controller testing was performed in this session.
