# Migration validation

Validated on Windows with Node.js 24.19.0 using the committed lockfile:

- `npm.cmd run typecheck`: passed (strict TypeScript).
- `npm.cmd test`: 40 tests passed in five test files.
- `npm.cmd run test:e2e`: 15 Chromium browser tests passed.
- `npm.cmd run build`: passed; compiled static output in `dist` with the `/wrx-ble-controller/` asset base.
- `git diff --check`: passed.

The unit tests compare all thirteen exact fixed preset definitions, all eight Basic profiles, all factory calibration defaults, and every calibration test command and offset with the complete original HTML at commit 351e770. They also test verified mode/color packets, all 256 mode encodings, both connections, failed writes, restore/retry/manual-off, transport fallbacks, six-second stalls, serialization/cancellation, Stop + Red behind calibration, monotonic scheduling, dwell/early-cut/same-mode guards, finite and native loops, v3/v4/v5/v6/v7/v8/v9 storage handling, saved assignments/colors/timing, edited fixed-slot archives, corruption/quota behavior, logs and exports.

Browser tests exercise the Main UI, Basic/Custom tabs, persistent colors and preferences, shared dual-controller connections, panel collapse/recovery, internal-loop single dispatch, step highlighting, profile duplication and editing, step copy/reorder/remove, button assignment and refresh, existing v7 data, saved calibration history, a real-clock calibration run with per-side logs and downloads, unsupported APIs and write failures, blocked localStorage/session backups, favorites/cut timing/playlists, complete backup download/restore, and overflow/Stop access at 320/390/768 pixels. Main layout width, grid columns, navy theme, and all preset button labels are compared directly against the original browser-rendered fixture. Screenshots are produced in the ignored `test-results` directory.

Browser BLE devices are explicitly mocked in the test context only. No hardware claims follow from these tests. Physical command reception, Android Chrome/Bluefy behavior, iOS background restrictions, actual LED timing, and saved production-browser permission recovery require the user's controllers and browser. Follow the physical testing checklist in [MIGRATION.md](MIGRATION.md).

CI repeats the type checks, all unit/browser tests and production build on feature pushes and PRs. Publishing is restricted to main after its validation job passes. The original Pages site uses branch-based publishing before this migration; production adoption also requires switching the repository Pages source to GitHub Actions.
