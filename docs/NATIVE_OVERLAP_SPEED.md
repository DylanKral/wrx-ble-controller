# Native Overlap / Reverse Overlap speed review

This work was prepared on `feature/overlap-video-calibration`, retaining the earlier Basic repeat settings and Main speed-control cleanup. The user subsequently authorized deployment of the integrated controller update on 2026-10-26; see the [mobile UI review](ux-review/README.md).

## Identification and evidence

Decoded all **1,669 frames** from the new HappyLighting recordings, independently of the older app-controlled IMG_1600/1601 footage.

| Recording    | Metadata                             | Direction compared with approved tracks          | Mode               |
| ------------ | ------------------------------------ | ------------------------------------------------ | ------------------ |
| IMG_1602.mp4 | 931 frames, 31.033s, 30 fps, 512×910 | Lower inner end → outside corner → top inner end | 7, Overlap         |
| IMG_1603.mp4 | 738 frames, 24.600s, 30 fps, 512×910 | Top inner end → outside corner → lower inner end | 8, Reverse Overlap |

Identification follows the traveling fronts, not filename order. The supplied chronological context establishes default → leftmost/slowest → rightmost/fastest demonstrations. The nominal byte assignments **129 / 1 / 255 remain provisional**: these videos do not contain synchronized byte logs or a visible speed readout. The earlier user confirmation of byte 129 for IMG_1600/1601 does not independently verify bytes in these new recordings.

[Mode 7 contact sheet](analysis/native-overlap/IMG_1602-contact.png), [Mode 8 contact sheet](analysis/native-overlap/IMG_1603-contact.png), [all-frame zone timelines](analysis/native-overlap/native-zone-timelines.png), and [measurement JSON](analysis/native-overlap/review.json) retain the evidence. The JSON includes source hashes, independent measurements, sensitivity checks, analysis windows, registration references and limitations. The original recordings are unchanged and remain outside the repository.

## Segment timing and what the numbers mean

The clips have steady holds between active demonstrations. They do not divide into equal thirds, and the exact moments the user moves the HappyLighting slider cannot be recovered during those holds. The analysis therefore records usable optical windows and bounds for setting changes, rather than inventing exact UI or BLE timestamps.

| Recording/mode | Default usable wave | Slow usable wave | Fast usable wave | Setting changes unobservable within these steady gaps |
| -------------- | ------------------- | ---------------- | ---------------- | ----------------------------------------------------- |
| IMG_1602 / 7   | 7.95–10.87s         | 15.55–22.80s     | 27.20–28.40s     | roughly 10.9–15.7s; 23.3–27.3s                        |
| IMG_1603 / 8   | 2.65–5.95s          | 10.45–18.85s     | 20.70–21.94s     | roughly 5.97–10.6s; 18.77–20.8s                       |

Mode 7 has earlier camera motion and mixed/clipped movement before the selected default wave; Mode 8 has an earlier partial wave before its selected complete default transition. Those frames are decoded and retained but are not substituted for clean homologous landmarks. The endpoints above are analysis-window bounds, not exact start/end times of physical speed settings.

There is one clean comparable sweep per speed. The reliable landmark is **red-front arrival to cyan-front arrival at the same lower LED zone**. It spans several color transitions but is **not a full repeat period, complete native one-shot duration or app retrigger interval**. Multiple zones of a single sweep are correlated observations, not multiple independent cycles.

| Mode | Default phase duration | Slow phase duration | Fast phase duration | Slow/default factor | Fast/default factor |
| ---- | ---------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| 7    | 59/30 ≈ 1.967s         | 139/30 ≈ 4.633s     | 21/30 = 0.700s      | 139/59 ≈ **2.356×** | 21/59 ≈ **0.356×**  |
| 8    | 58/30 ≈ 1.933s         | 139/30 ≈ 4.633s     | 21/30 = 0.700s      | 139/58 ≈ **2.397×** | 21/58 ≈ **0.362×**  |

These are medians across usable lower zones. At each reference speed the factor is exactly **1**. Mode 8's fast last-zone red onset is unusable at the chosen threshold and is excluded, leaving nine usable zones. Mode 7 has ten. Measurement samples, exclusions and alternate hue thresholds are explicit in the JSON/CSV rather than hidden behind a fitted curve.

Confidence is **moderate for these relative optical transitions**, lower for extrapolating to complete firmware timing. A conservative ±2 frames (67ms) at each measured interval gives rough frame-resolution factor bounds of 2.25–2.47 / 0.31–0.40 for Mode 7 and 2.28–2.52 / 0.32–0.41 for Mode 8. These are sensitivity bounds, not statistical confidence intervals, and do not include all camera/registration uncertainty. The small difference between the two fitted curves is not a claim that their firmware responses are statistically distinguishable at 30 fps.

## Spatial/RGB review and SVG result

The analysis compares corresponding normalized phases before treating speed as a clock change. Lower-zone red-front alignment with the approved reference has median absolute residuals around 0–33ms at reference, 6–8ms after slow normalization, and 20–25ms after fast normalization. Their progression follows the same 19-zone path. Red-to-yellow intermediate landmarks and the color order remain compatible with the existing reference. No usable observation demonstrates a speed-dependent spatial pattern requiring separate datasets.

IMG_1603 has substantially more ambient light and clipped white regions. Core RGB and less-clipped color-selected patch samples are retained separately. Neither clipped white nor background/car brightness is treated as an intentional white LED phase. Absolute brightness, subtle fades, and clipped upper-zone hue cannot be reliably recalibrated from these recordings. Long settled yellow holds also do not prove whether a mode internally settled or an unlogged command changed its state.

**No original RGB frames, reference timestamps, geometry or LED identifiers were edited.** All eight original datasets remain available, byte-for-byte, for comparison and rollback. The six other modes retain their original calibrations. The supported SVG improvement is the independent Mode 7/8 **time response**, replacing the generic estimate at non-reference speeds. At the reference setting the same approved frames play at the same reference timing.

Before/after artifacts use the real approved SVG with original frames at equal elapsed wall progression. They change only the duration factor:

- [Comparison gallery](analysis/native-overlap/comparison.html): physical crops alongside original generic timing and the new per-mode timing, for default/slow/fast in each mode.
- [Mode 7 fast comparison](analysis/native-overlap/mode-7-fast-comparison.png).
- [Mode 8 fast comparison](analysis/native-overlap/mode-8-fast-comparison.png).

At 0.8s into a fast sweep the old generic factor (~0.233×) has advanced substantially past the physical front. The new factors (~0.36×) place the SVG near the recorded cyan/yellow transition. These alignments use fitted optical origins, not Bluetooth dispatch times; they cannot establish phase lock or startup latency. The gallery is a static analysis artifact, not another runtime renderer or timing service.

## Shared timing, Basic repeats and Custom cuts

`src/animations/nativeSpeed.ts` now contains separate Mode 7 and Mode 8 observations, with the measured phase metric identified explicitly. `durationFactor` continues to perform the existing piecewise log-duration interpolation on tentative bytes 1/129/255. Mode-specific correction preferences still apply. Modes 4/10 observations and generic curves for 3/5/6/9 are unchanged. Intermediate values remain interpolated estimates until additional synchronized measurements are available.

The simulator, scheduler and hardware use the same resolved byte and captured factor. No SVG-only clock, competing rate calculation or duplicate frame dataset was introduced. Existing dispatch anchoring, generation cancellation, intentional preview restarts and Stop + Red behavior remain in place.

The earlier local **Basic repeat calibration** work is preserved. Its independent saved reference values and **3.50-second defaults are not replaced** by the 1.93/1.97-second phase measurement. Native visual progression and app-controlled command repetition remain separate durations using the same factor. Personal profiles and saved preferences remain intact. The **1.30-second Custom cuts** and all bundled definitions are unchanged; Follow Animation Speed scales each cut with its own mode's new factor, while fixed-time behavior remains fixed.

## Percentage slider and live changes

The Main slider remains immediately below Basic/Custom tabs, with scope/calibration controls in Advanced Settings. Its stops are **0, 15, 30, 45, 50, 60, 75, 90, 100 percent**, providing approximate 15% steps plus a dedicated reference stop. Percentage means slider position, not a measured percentage of physical animation speed.

`speedPosition.ts` maps 0%→1, **50%→129**, and 100%→255, with piecewise integer mapping around the exact reference. The inverse preserves every saved byte. Advanced Settings continues to accept all exact 1–255 values, including values between the visible stops; opening the new UI does not quantize saved preferences.

Pointer movement prepares a value. Pointer release automatically saves and applies it; keyboard navigation applies once on key release. There is no separate primary Save/Apply button. A committed gesture resolves the Mode step playing at that instant, including if a Custom sequence advanced during the gesture. It uses the existing scheduler restart/rebase route only if the running byte differs. Duplicate releases, unchanged selections, pointer cancellation, Escape or loss of focus do not cause duplicate requests. Stop + Red cancels pending work; a half-finished slider gesture does not reissue a mode before red. Idle changes save future settings without starting an unrelated effect. Color/Wait steps retain their existing policy. Simulation Only remains physically isolated.

Advanced exact-byte edits retain their save-for-future and explicit reissue action. Basic reference settings remain in their separate storage key. All speed controls stay disabled during physical calibration.

## Reproduction and validation

```powershell
py -m pip install --target test-results/video-tools numpy opencv-python-headless pillow
py scripts/analyze-native-overlap-videos.py --videos "C:\Users\Dylank\Downloads\WRX_LED_STUDIO_V4_SMALL\videos\Calibration Videos"
node scripts/render-overlap-comparison.mjs
```

The script decodes every frame and records presentation timestamps, registration quality, core RGB, color-selected RGB, clipping fractions and point validity in two CSVs. The dark clip uses several nearby steady keyframes to avoid long-range tracking failure during camera movement; the brighter clip uses a stable reference. Poor registration/offscreen zones are marked invalid. Alternate red/cyan thresholds test sensitivity. Python tools are optional analysis dependencies and get cleared by Playwright's `test-results` cleanup; they are not added to app dependencies.

TypeScript, **104 unit tests**, **38 Chromium browser tests**, the production Vite build and `git diff --check` passed, including all earlier local Basic calibration tests. Coverage includes independent curves, anchors/intermediates, every percentage stop, exact advanced bytes, equivalent-phase reference frames, 19-zone mapping, Basic/Custom separation, both controllers, live gestures, cancellation, persistence, output isolation and mobile layout. The build retains its existing bundle-size advisory.

Still required physically: synchronized speed-byte/video logs; several full sweeps or cycles per setting; controlled exposure for clipped zones/fades; at least two intermediate settings per mode; uninterrupted single-command capture to determine native end/hold behavior; and optical-versus-dispatch latency/restart tests. No precise full firmware duration, complete 255-byte transfer curve, or phase-locked synchronization is established.
