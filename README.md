# WRX Dream BLE Controller

React + TypeScript + Vite migration of the existing two-controller WRX lighting app. Production URL: https://dylankral.github.io/wrx-ble-controller/ . The original navy UI, 13 fixed Custom presets, Basic Modes 3–10, favorites/playlists, profile studio and complete calibration lab are retained.

## Develop on Windows / VS Code

Install Node.js 24 LTS, open this repository folder in VS Code, then use a terminal:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the printed localhost URL including `/wrx-ble-controller/`. `npm.cmd` avoids PowerShell's script execution-policy restriction on `npm.ps1`; `npm` also works in Command Prompt and other configured shells.

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run preview
```

`npm run test:watch` watches unit tests. Browser tests start/stop their own local server. `npm run preview` serves the compiled `dist` build. Dependencies are pinned by package-lock.json. No backend, account service, runtime environment variables, or service worker is required.

## Architecture

- `src/bluetooth`: real Web Bluetooth connection/recovery manager, exact packets, write fallbacks, shared serialization and per-controller exclusion.
- `src/animations`: baseline fixed preset/factory timing data, typed mode/color/wait steps, cancellable monotonic scheduler.
- `src/calibration`: original M02–M09, T01–T07 and C01 comparison definitions, timing recorder, CSV/JSON export.
- `src/storage`: versioned non-destructive studio migration, old favorites/playlists and complete configuration backups.
- `src/context`: shared Bluetooth manager and application state; navigation does not recreate connections.
- `src/components`, `src/pages`, `src/styles`: React views and the original organized navy stylesheet.
- `tests`: unit regressions, injected browser BLE mocks, and the original HTML fixture. Fixture and source TypeScript are excluded from production output.

[Migration checklist and complete behavior/storage audit](docs/MIGRATION.md). The archived HTML is the regression oracle, not a runtime dependency. `node scripts/extract-baseline.mjs` reproduces baseline data and the function/key inventory from that fixture; do not run it after editing extracted definitions unless intentionally resetting them to baseline.

## Browser data and backups

All data remains local to the browser. The old storage keys are retained, and data is never cleared on initialization. All 13 fixed profiles are compiled into the app independently of storage; personal profiles remain separate. Previous edited fixed slots become saved editable copies. Favorite names, manual timing, playlist indices, button assignments/order, calibration logs, static color, Rainbow Chase Blue start color, tabs, and auto-restore preference are preserved.

Development → Custom Testing offers the original profiles JSON export/import plus **Export complete backup**. Complete backups include all WRX preferences, legacy data, calibration history and existing backup keys. Restore JSON backup accepts both formats. Back up before manually clearing site data. Localhost, another browser, and a different hostname have separate storage; the existing GitHub Pages origin remains unchanged for production access to old data.

Malformed saved data triggers a visible warning without overwriting its source. Export complete backup before repairing/importing. Storage quota failures are reported; do not close the page before exporting if changes cannot be saved.

## Physical Bluetooth testing

Use localhost or HTTPS with Android Chrome or Bluefy on iOS. Connect Left to **Dream-CF4B**, Right to **Dream-A90F**. Both are independently managed. Write service FFD5 / characteristic FFD9; known notification UUIDs FFD0 / FFD4 are exported but no animation-completion notifications are assumed.

Verified packets are unchanged: Mode 4 `9E0003819800E9`, blue `560000FF00F0AA`. Without-response writes are preferred with with-response and legacy fallbacks. Both connected lights receive each normal command. Previously authorized-device restore uses `navigator.bluetooth.getDevices()` when supported. Automatic retries are bounded and disabled after a manual disconnect or while the document is hidden. iOS can suspend timers and may require manual reconnect; keep the page foregrounded for sequences and calibration. Browser send/write timestamps are not physical LED response times.

For a hardware check, record the phone screen with both lamps. Check Mode 4, blue, red, one-pass versus internal-loop behavior, early cuts, custom colors, Stop + Red, disconnect/recovery, and background cancellation. Calibration provides visible cues and exports browser command timing for comparison to video. Mocks cannot establish physical compatibility.

Use this for parked show/testing control. Restore red and verify normal vehicle lighting before driving. A failed or disconnected device can retain its last effect; the app cannot confirm a lamp's physical color.

## GitHub Pages

Vite uses `base: '/wrx-ble-controller/'`. `.github/workflows/deploy.yml` installs dependencies, type-checks, runs Vitest and Playwright, builds, uploads **dist**, and deploys it with Pages Actions. Feature pushes/PRs validate without publishing. Main deploys only after validation succeeds. Set repository Settings → Pages → Source to **GitHub Actions**. The workflow needs `contents:read`, and its deploy job needs `pages:write` and `id-token:write`. The `github-pages` environment must allow main deployments.

The root index.html is a minimal Vite entry; production dist/index.html loads hashed compiled JS/CSS. Never publish source TSX directly. No custom domain or path change is made. Git history and the original fixture retain the previous implementation. To roll back, revert the migration on main and restore the previous Pages publishing configuration if returning to branch-based static hosting; export configuration before downgrading storage formats.
