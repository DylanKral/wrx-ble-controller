# WRX Basic Mode Simulator — Codex Integration (Approved 4/10)

This is the **single consolidated integration package** for the WRX React/TypeScript/Vite app.

## What is confirmed

- **Mode 4 — Chase**: User confirmed the preview is perfect. Its 66 captured frames, 2.20 s duration and existing color-aware brightness mapping are unchanged.
- **Mode 10 — Breathe**: User confirmed updated v2 preview is perfect. The new 75-frame recording REPLACES earlier recovered Mode 10 samples. It uses **previously selected user RGB** and **Enhanced Breathe Fade = On; intensity = 100%** by default, matching the approved preview.
- **Modes 3, 5, 6, 7, 8, 9**: Existing calibrated frames preserved unchanged, but the user has *not* necessarily approved visual accuracy of each one.
- 19 independently addressable SVG regions on each taillight; same logical LED number for left and right.

## Files

- `wrx-basic-modes-final-calibrations.json` — all 8 records in a single JSON; authoritative for this integration.
- `wrx-taillights-19zone.svg` — approved vector graphic and left/right path IDs.
- `renderCalibratedBasicModes.ts` — TypeScript renderer with Mode 4 untouched and enhanced Mode 10 fade.
- `approved-mode-4-10-preview.html` — standalone reference preview the user approved. **Use this as the visual acceptance target.**

## Integration requirements

1. Work in the **existing** React/Vite GitHub repository; do not overwrite other features or the BLE protocol.
2. Replace older Basic calibration imports with `wrx-basic-modes-final-calibrations.json` only. Do not mix old Mode 10 values.
3. Use existing remembered RGB color state for Modes 4 & 10, and update it on a user-issued RGB command (including custom sequence color steps). Other modes use sampled frame colors as-is.
4. For Mode 10, use `renderCalibratedFrame` with default options. It implements the approved **per-LED blue-channel min/max brightness normalization, enhanced fade ON / depth 100%**. Mode 4 continues its original brightness floor of 70 (without this enhancement).
5. Store only legitimate user preferences in existing localStorage. Do not clear or rename existing saved profile keys without migration.
6. At time `t`, call `getFrameAtTime(record,t,repeat)` and then `renderCalibratedFrame`, applying the returned 19 colors to BOTH left/right paths by `ledSvgId`.
7. Basic modes should honor one-shot/repeating behavior from the EXISTING scheduler; `cycleSeconds` is a calibration reference, not proof of firmware loop handling. Mode 10 2.5s window is not a verified exact hardware period.
8. Custom preset playback must use the same calibration tracks, retaining existing durations and interruption/cut times. Do not rewrite BLE packets or scheduling during the visual-data integration.
9. **Simulation only**: no BLE writes from renderer, previews, calibration import or timeline scrubbing. Keep hardware actions in the pre-existing BLE command layer.

## Regression checks

- Mode 4 green/red colors chase correctly, 2.20s and 66 frames; verify no regressions vs approved HTML preview.
- Mode 10 green/blue/red breathe with approved enhanced fade; 2.50s capture window, 75 frames; confirm preview matches v2.
- Changing selected color re-tints Modes 4 and 10; modes 3,5,6,7,8,9 unaffected.
- 19 RGB colors in every frame, consistent physical indexing on left/right.
- Pause/scrub, fast frame stepping, animation cuts and mode switching work.
- BLE/connection behavior remains untouched.

## Source notes

User-reviewed Mode 4 and Mode 10 appearance only. Remaining modes derived from original MP4 measurements and can be refined. Some recorded camera RGB values may be overexposed. Never represent video-derived color measurements as exact hardware PWM values.
