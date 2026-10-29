# Velocity — Full Spectrum

Bundled profile `velocity-full-spectrum` repeats indefinitely, is not experimental,
explicitly follows Animation Speed, and does not use native-loop playback.

| Mode | Effect | Reference duration (byte 129 / 50%) |
| --- | --- | --- |
| 4 | Chase | 2,200 ms |
| 7 | Overlap | 3,200 ms |
| 8 | Reverse Overlap | 3,200 ms |
| 3 | Rainbow Chase | 2,250 ms |
| 5 | Rainbow | 4,100 ms |
| 9 | Flash | 1,000 ms |

The reference cycle totals **15,950 ms**. There are no Color or Wait steps.
The existing scheduler dispatches each factory Mode command, including Chase
after Flash at the repeat boundary, until stopped.

Chase inherits the previously selected RGB color. The intended blue is `#0066FF`;
select and apply it before starting if desired. Automatically setting blue would
require an additional RGB command, so this preset does not send one or overwrite
the user's color preference. RGB commands during active Chase have previously
caused flashing and unreliable transitions on physical hardware.

The Main Custom tab and Profile Studio use the existing bundled library. Duplicate
profile creates an editable, persisted copy. Existing presets retain their order
and definitions. Storage normalization appends missing bundled buttons and retains
saved assignments, including an assignment colliding with the new button ID.
Reloading normalized data does not duplicate the bundled button.

The existing grouped speed update covers modes 4, 7, 8, 3, 5, and 9. Independent
scope preserves unrelated speeds; Global scope continues using the global byte.
Changing speed reissues the current Mode step, without returning to the beginning
of the show. Later steps use the updated speed and timing resolver. Reference cuts
and provisional calibration curves are unchanged. This profile explicitly enables
Follow Animation Speed, taking precedence over the bundled fallback preference;
an editable duplicate can turn it off.

Automated tests verify command order, reference timing, repeating, persistence,
duplication, grouped speed updates, simulator mode/speed, Stop + Red cancellation,
and zero BLE writes in Simulation Only. BLE browser checks use mock controllers.
Physical taillight testing is still required to verify visual continuity, firmware
phase behavior on Mode reissue, left/right synchronization, and the provisional
speed curves. No firmware phase reset is assumed or added. The simulator follows
dispatched commands using its existing preview behavior, not measured firmware phase.
