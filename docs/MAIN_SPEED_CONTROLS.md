# Main animation speed controls

Reviewed remote main at `666ea55b297de5f1333f8bb10ea240176362ab06` and the existing working-tree speed/calibration changes before editing. The user subsequently authorized deployment on 2026-10-26 after the local implementation and validation were reviewed.

Main puts the compact calibrated simulation at the top, as subsequently requested, below left/right connection actions. Basic/Custom tabs follow it, with Animation speed immediately below the tabs and above the two-column preset buttons. There is no speed confirmation button. The Custom checkbox is labeled Sync cut timing, with the full accessible name Automatically adjust preset cut timing.

## Discrete positions

Percentages describe slider position, not a verified physical speed percentage. The existing piecewise mapping preserves the exact byte-129 midpoint:

| Position | Native byte |
| --- | --- |
| 0% | 1 |
| 15% | 39 |
| 30% | 78 |
| 45% | 116 |
| 50% (Default) | 129 |
| 60% | 154 |
| 75% | 192 |
| 90% | 230 |
| 100% | 255 |

Pointer input snaps to stops. A 180ms trailing coalescer commits the latest stop; pointer or keyboard release flushes immediately. Duplicate commits and unchanged values do not restart an already matching effect. Arrow/Page keys move between stops, Home/End select the endpoints, and Escape/pointer cancellation discard an uncommitted draft. Small adjustments from assistive technologies also advance to the next stop without requiring key events. Browser-native range dragging is preserved: explicit pointer capture broke WebKit's native thumb tracking and was removed.

An exact existing native byte is shown as its rounded percentage without writing it back or snapping it on load. Full byte editing remains in Development/Calibration. Keyboard movement accounts for the byte-to-percentage quantization so it does not become stuck at 15% or another rounded stop.

## Playback and persistence

`changeNativeSpeed` resolves the current scheduler step when a selection commits, even if a short Custom sequence advanced during the gesture. Active Mode changes use `restartCurrentMode`, retaining the sole scheduling runner, generation invalidation, simulator dispatch clock and dispatch-based cut rebase. The native protocol, duration models, reference durations and animation assets are untouched by this UI pass.

Idle, Color and Wait changes save without sending a mode or interrupting the step. Global scope affects all subsequent Mode commands; Independent scope changes only the active mode or the selected Advanced Settings mode when no Mode step is active. Switching scope retains both preference sets and timing corrections. Stop, output/profile changes, unmounting and calibration locks discard outstanding UI drafts. Stop + Red retains output epoch cancellation and BLE serialization.

Main Advanced Settings contains scope and the animation selector. Exact byte entry, explicit reissue, timing estimates, corrections and Basic overlap retrigger calibration are available in Development/Calibration. Existing advanced edits continue to save for future steps and retain the explicit diagnostic reissue action. Calibration locks speed editing.

The compact Main preview contains only the approved SVG, animation name when playing and a minimal output/playback indicator. Frame inspection, scrubbing, preview RGB, numbered LEDs and technical readouts remain in Development/Calibration. Combined remains the default unless an output preference was saved. The shared remembered RGB state also drives the solid color picker and Modes 4/10.

See [screenshots, positioning analysis, validation and limitations](ux-review/README.md).
