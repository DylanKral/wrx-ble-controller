# Custom speed, transition investigation, and sticky preview

## Scope and repository

Local work on `main`, starting at `1cf3cafd54cda643fe3b98caeedc4a0d0cf000b2`.
`git ls-remote origin refs/heads/main` confirmed the same remote head.
The pre-existing untracked `.vite/` directory was retained. No commit, push,
merge, or deployment is part of this work.

## Root causes and changes

1. Custom speed previously selected only `scheduler.state.current.mode`, or
   the Development mode selector during Color/Wait. Independent speeds therefore
   diverged across the preset. `scheduler.ts` now exposes deduplicated mode IDs
   from its cloned running profile. `AppContext.tsx` updates that set through
   `withNativeSpeeds` in `nativeSpeedPreferences.ts`, with one state/ref update
   and one storage write. Global scope changes only the shared byte; independent
   scope preserves unrelated mode preferences. Identical values do not resave.
   The existing scheduler generation/cancellation path reissues only an active
   Mode step whose dispatched timing byte differs. Color and Wait retain their
   deadlines; future steps resolve the new saved byte through the existing
   timing resolver and output pipeline. Basic single-mode playback still has
   one target. No preset reference durations or calibration anchors changed.
2. `NativeSpeedControls.tsx` labels running Custom speed as Preset, lists its
   modes in independent scope, and reports Mixed speeds when needed. The thumb
   uses the first included mode as a stable starting position, including during
   Color/Wait; opening the interface does not normalize saved values. An explicit
   adjustment synchronizes included modes. The existing debounce, pointer/key
   commit, profile-switch cancellation, and Stop cancellation remain in use.
3. Breathe and Chase show a gap between commanded preview behavior and verified
   firmware behavior. There is no demonstrated firmware phase reset in the
   known Mode/RGB protocol. The software trace does not show missing commands
   or a different second repetition. Hardware phase behavior remains unresolved;
   changing timing or adding speculative reset packets would not establish a fix.
4. The Main preview was an ordinary scrolling panel. `controller.css` makes only
   the direct Main compact panel sticky below the existing navigation, with an
   opaque backing, border, small padding, and z-index 17 (below navigation 20
   and Stop bar 18). The SVG has a 70px height and retains its native viewBox
   proportions and both lights. Ancestors use document scrolling without
   clipping. The top offset includes the navigation's 63px plus top safe area;
   Main-only scroll padding helps controls scroll clear of the preview. No
   JavaScript positioning, nested scroller, fixed-height shell, or animation
   remount was introduced. Development/Calibration controls are unchanged.

## Exact transition behavior: before and after

The transition packets and preset timings are unchanged. The only packet-byte
change from a speed edit is byte 3 of subsequent Mode packets (and the existing
current-Mode reissue). The following traces use reference speed 129, negligible
write latency, and no interruptions. Actual deadlines anchor to first dispatch;
the scheduler awaits output completion before advancing. Color/Wait delays remain
fixed unless explicitly linked by an existing profile timing policy.

| Breathe → Overlap offset | Packet | Following reference duration |
| --- | --- | --- |
| 0 ms | `560000FF00F0AA` blue | 100 ms |
| 100 ms | `9E0009819800E9` Mode 10 | 1,800 ms |
| 1,900 ms | `560000FF00F0AA` blue | 50 ms |
| 1,950 ms | `9E0006819800E9` Mode 7 | 3,500 ms |

The same sequence repeats at 5,450 ms and 10,900 ms. A 1.80s cut is neither
the approved 2.50s capture nor the approximately 3.54s physical Breathe cycle.
Existing speed-follow timing scales Mode cuts, not those two RGB delays. This
does not guarantee the same internal physical phase at each cut.

| Black / Blue Chase offset | Packet | Following reference duration |
| --- | --- | --- |
| 0 ms | `9E0003819800E9` Mode 4, remembered RGB | 700 ms |
| 700 ms | `5600000000F0AA` black | 100 ms |
| 800 ms | `9E0003819800E9` Mode 4 | 100 ms |
| 900 ms | `560000FF00F0AA` blue | 700 ms |

The same sequence repeats at 1,600 ms and 3,200 ms. The first Chase uses the
previous selected RGB; later cycles follow the preceding blue selection.
Blue has no immediate Chase command: that request comes at the next repetition,
700 ms later. Black has a Mode request 100 ms later. Neither sequence contains
a verified cut command, and reissuing Mode 4 is not a verified phase reset.
Short cuts can request a transition before the native animation completes;
serialized browser writes cannot force the firmware to interrupt it.

`PlaybackOutput` observes a command when first dispatched to an available
controller and maintains independent left/right delivery status. `BLEManager`
serializes requests and excludes simultaneous writes per controller. A queued
request checks generation/validity again before each controller write. A write
already handed to the browser cannot be recalled; Stop + Red queues after it.
Both sides share logical scheduling, not a guaranteed simultaneous physical phase.

The existing simulator turns RGB commands into static color and starts the
captured track at zero on Mode dispatch (`restart: true`). This models requested
commands, not measured firmware state. This review does not introduce a new
successful-looking Chase cut, invent Breathe frames, or claim those existing
preview resets are physical resets. No restart-on-color policy was added:
there is not yet a verified interruption primitive to implement it with.

## Smallest physical verification

Record each controller separately, then together, with command dispatch times
visible or logged. At byte 129, first record three repetitions of each unchanged
preset to compare phase at every Mode dispatch.

For Chase, select blue, request Mode 4, send black after 700 ms, and reissue Mode
4 after 100 ms. Observe whether black interrupts motion or only changes RGB,
and whether the Mode request starts at the same initial phase. Repeat black →
blue with the same gaps, then test an immediate serialized Mode request after
the color write. Repeat at bytes 1 and 255. These are candidate diagnostic
sequences using known packets, not new saved presets or proven resets. If RGB
does not interrupt and Mode reissue does not restart, the requested guaranteed
cut cannot be implemented using the currently verified protocol.

For Breathe, compare the unchanged three-cycle trace with a diagnostic run
allowing a complete approximately 3.54s Breathe cycle before transitioning.
Compare repeated Mode 10 commands with RGB → Mode 10 and Mode 7 → Mode 10;
record whether any consistently resets phase. The latter are tests, not approved
preset timing changes. Do not substitute 2.50s capture completion for full-cycle
completion. Any proposed preset timing change needs separate approval.

On iPhone Safari/Bluefy, verify the sticky preview during toolbar collapse,
safe-area changes and rotation, plus slider/tab/preset access and Stop + Red.
Desktop WebKit and synthetic visual-viewport tests do not verify real iPhone
browser chrome or Bluetooth response.

## Regression coverage

- `tests/customSpeed.test.ts`: immutable grouped preferences, unique modes,
  global semantics, no-op/invalid values, and bundled profile membership.
- `tests/browser/customSpeed.spec.ts`: user-created repeated-mode sequences,
  global and independent scope, first/middle/last Mode and Color/Wait edits,
  one storage write, unchanged unrelated speeds, no extra Color/Wait requests,
  future packet bytes, and interrupted gestures on profile switch.
- `tests/browser/mainSpeed.spec.ts`: updated cross-step gesture expectation;
  existing rapid input, persistence, output modes, Basic and Stop regressions.
- `tests/timing.test.ts`: three repetitions of both transition presets at bytes
  1/129/255, exact per-controller packet order, dispatch timing and preview
  state; cancellation while Chase color is blocked on both controllers.
  Existing tests retain independent controller failure/delivery coverage.
- `tests/browser/mobileLayout.spec.ts`: sticky bounds, same SVG DOM node,
  slider access and bottom Stop bar at 320/375/390/430/768px, shortened viewports
  and landscape; existing viewport and page layout regressions.
- `playwright.config.ts`: includes the new Custom speed tests in available
  WebKit coverage. Chromium runs the entire browser suite.

Validation completed:

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd test` | 119 tests passed in 12 files |
| `$env:WRX_TEST_WEBKIT='1'; npm.cmd run test:e2e` | 112 passed: 68 Chromium, 44 configured WebKit tests |
| `npm.cmd run build` | Passed; 511.71 kB JS chunk triggers Vite's >500 kB advisory |
| `git diff --check` | Passed |

The targeted browser run also passed all 34 selected tests before the full run.
There were no assertion failures. Initial test launches could not load Vite
configuration because the sandbox blocked esbuild's parent-directory access;
rerunning with approved elevated execution resolved that environment issue.
PowerShell blocks `npm.ps1`, so commands used `npm.cmd`. Generated build and
browser-test artifacts are ignored by Git. The existing `.vite/` was not removed.
