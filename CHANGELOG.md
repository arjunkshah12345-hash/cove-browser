# Changelog

## 0.6.0 — Keep what matters

Unsigned local developer build; not Arc parity or a hardened public release.

- Settings now shows actual native tab lifecycle states and manually sleeps eligible inactive pages after an unsaved-form warning. Selection in either split pane stays protected while overlays hide native views. Audible/loading/captured pages, DevTools, potential camera/microphone streams, active space downloads and page output block sleep. Waking reloads the saved URL and restores mute/zoom, not forms or page navigation history.
- Confirmed per-space website-data reset closes that space’s pages and clears cookies, site storage, cache and HTTP authentication, including existing connections. Layout recreation is blocked during reset. Partial failures are reported without claiming rollback; other spaces and workspace records/files remain intact. Permission grants are intentionally unchanged.
- Configurable workspace-history retention: no age limit (still capped at 1,000 visits), or 1/7/30/90 days. Finite changes require a removal-count preview and confirmation; expiration runs on startup and once a minute while running. Private imports are processed only in memory. Recovery backups and earlier exports may retain removed visits; this is not secure erasure.
- Added browser regressions and automation-free native lifecycle tests. The latter avoid DevTools automation’s capture flag and verify actual guest destruction/recreation, space-isolated cookie/localStorage cleanup, and persistent cookies/site storage across application restart using fresh Cove-only test profiles.
- Codex-Esha delegation was used exclusively; initial workers' authentication expired before final results, so partial work was completed and verified locally. A fresh October 31 read-only CE review completed with no verified actionable findings in sleep/reset/retention scope and 106 targeted tests passing. This scoped agent review is not an independent security audit or general release approval.

## 0.5.0 — Find your flow

Local developer build, not a signed public release or full Arc parity. Previous versioned apps remain preserved.

- Unified local command palette searches live tabs across spaces, favorites, history, and browser actions with deterministic multi-token ranking and canonical-URL deduplication. Matching live tabs take precedence over matching duplicate favorites/history. No remote suggestions or query logging.
- Searchable settings, space/folder management, archive, sidebar/split actions, help, and supported native page tools. Combobox/listbox selection announces the highlighted result; keyboard navigation scrolls it into view. Empty Enter still creates a fresh tab; address mode always navigates the focused page.
- Saved split pairs and widths per space, mirrored-ratio pane swapping, and stable pane positions when focusing either tab. Selecting another tab replaces the primary pane; closing/moving a member or removing its space prunes stale layouts. Optional v1 state validates and exports/imports without invalidating legacy workspaces.
- Fixed two independently reproduced split bugs: duplicate-tab activation retained secondary command focus, and creating a split at 500 tabs exceeded the workspace limit and blocked saving. Added browser regressions for both.
- Extended real Electron smoke coverage to saved/swapped native panes, ratio restoration after shell reload, and exactly-once sidebar shortcuts from a guest page. Complete verification is recorded in `IMPLEMENTATION.md` and the versioned release ledger.

## 0.4.0 — Recovery and browser essentials

Local developer build, verified on macOS arm64: `release/0.4.0/Cove-darwin-arm64/Cove.app`. The older app in `release/Cove-darwin-arm64/` remains unchanged. This is not a signed public release or Arc parity.

- Focused-page print, PDF export through a main-owned save dialog, guest DevTools, and Inspect Element. Rendering and writing are awaited; cancellation writes nothing and concurrent output requests are rejected.
- Stop loading and cache-bypassing reload, including Command/Ctrl Shift R, with split-pane targeting.
- Optional auto-archive after 24 hours, 7 days, or 30 days; off by default, protecting pins, favorites, and both visible panes. Legacy timestamps start tracking without immediate expiry. The archive retains at most 100 tabs.
- Protected workspace loading, rotating valid backups, and explicit recovery. Exact corrupt bytes and surviving backups are preserved before fresh recovery; preservation failures/conflicts block replacement. This is not transactional crash recovery.
- Confirmed workspace-import preview with export/cancel. Normal imports leave current state unchanged if saving fails; private imports remain in memory.
- History search combined with space/time filters and matching-only/all-history confirmed deletion. Portable Netscape bookmark export supports all/current-space live tabs plus global favorites; excludes history, notes, archive, cookies, and permissions.
- Pinned-address reset, keyboard-accessible same-group reorder, and archive search. Legacy pins capture their current saved address, not an unrecoverable historical address.
- Fixed two independently reproduced recovery/lifecycle data-safety findings with regressions. Final verification is recorded in `IMPLEMENTATION.md`.

## 0.3.0 — Local developer build

The package version is `0.3.0`. Combined verification passed on macOS arm64 on October 26, 2026. This is not a signed public release, completed Arc parity, or an independent security audit. [FEATURES.md](FEATURES.md) tracks implemented, incomplete, and roadmap work separately.

### Private windows

- Desktop File menu, Settings action, and Command/Ctrl Shift N launch a separate private process with a fresh temporary Cove user-data directory, non-persistent shell/site partitions, and visible private-mode chrome.
- Private windows start a fresh in-memory workspace and scratchpad instead of loading or saving the normal workspace/note. New private navigations are not added to browsing history; explicitly imported history may still appear in that session.
- Private workspace export requires confirmation. Downloads, explicitly saved files, and exports persist after close. Temporary user-data directories/runtime metadata are not automatically erased. Private mode does not anonymize traffic or promise no disk traces.

### Site controls

- Desktop controls for location, notifications, and combined camera/microphone access, plus reset. Allowances are memory-only per exact origin (scheme/host/port) and space; they reset on process restart and are not exported.
- Only HTTPS and HTTP on the exact loopback hosts `localhost`, `127.0.0.1`, and `[::1]` are eligible. Matching top-level provenance is required; subframes, unsupported permissions/media types, and display capture/screen sharing remain blocked by default.
- Main-process changes reject stale origins. UI exposes loading, retry, and save errors. Choices affect future requests only: pages do not automatically reload, and revocation does not stop active camera/microphone streams; close the tab to stop them.

### Verification and remaining work

- Added permission-policy and private-launch unit tests, mocked native-bridge privacy UI tests, and `scripts/smoke-private.mjs` for native session isolation and grant/reset checks; `test:desktop` includes both desktop smoke scripts.
- `npm run verify` passed: 87 unit tests, 18 browser UI tests, production build, normal native smoke, and private-session/permission smoke. `npm audit` reported zero vulnerabilities. Other platform/architecture release validation remains pending. Persistent permission management, full profile management, auto-archive, Peek, extensions, passwords/autofill, sync, signed installers, and automatic security updates are not delivered by this version.

### Search preference and folder work

- Added search-provider selection: DuckDuckGo (default), Google, Bing, and Brave Search. The optional v1 workspace field is validated, persisted, and included in workspace JSON; older workspaces fall back to DuckDuckGo. Command-palette and address-bar searches honor the preference, with model and browser UI coverage.
- Added Settings → Manage folders with rename and confirmed deletion. Removing a folder keeps live and archived tabs, including pinned state, and clears only folder membership. Model and browser UI tests cover the workflow. Nested folders, folder ordering, and bulk management remain roadmap work.

## Earlier implementation

The v0.2 entries below describe that earlier baseline, not the current absence of v0.3 private windows or site controls.

## 0.2.0 — Implemented features

### Workspace and browsing

- Searchable, locally persistent browsing history capped at 1,000 visits across spaces, with individual removal and confirmed clear-all. Displays up to 200 matching entries. History is included in workspace JSON exports.
- Persistent workspace-wide favorites: add, edit names and addresses, reorder, and remove up to 12 shortcuts; favorites are included in exports.
- Bookmarks HTML import from a user-selected export, with preview and confirmation. Active markup is stripped before parsing; only credential-free HTTP/HTTPS links are retained, duplicate URLs in the active space are skipped, and existing workspace content is preserved. Files are limited to 5 MB (5,000,000 bytes), parsing to 500 accepted links, and import to the workspace's 500-tab and 200-folder limits. Imported links become pinned tabs grouped by folder names; browser profiles are never read.
- Tab menu actions: rename, duplicate, pin/unpin, move between spaces, copy link, open in split view, mute/unmute on desktop, and close. Closed tabs can be restored from the archive.
- Space renaming and confirmed removal, retaining at least one space. Removal clears associated workspace content and history, not persistent website data.
- Desktop find-in-page with match counts and next/previous controls, page zoom from 50% to 200% with reset, and per-tab audio mute/unmute.
- Resizable two-pane split view with pointer dragging and keyboard Left/Right divider controls, bounded to a 25–75% first-pane width.

### Downloads and shortcuts

- Desktop downloads panel with progress, cancellation, and explicit reveal-in-folder for completed files. Uses native save dialogs; Cove never opens downloaded files.
- Download records are memory-only and capped at 100. The oldest finished record is evicted when full; new downloads are rejected if all records are unfinished. Records do not survive restart or enter workspace exports; saved files remain on disk.
- Command/Ctrl shortcuts: J for downloads, Y for history, F for find, Shift T to restore a closed tab, + / - for zoom, and 0 to reset zoom. Ctrl Tab and Ctrl Shift Tab cycle tabs on all platforms. Existing search, address, close, reload, sidebar, split, and settings shortcuts remain available; see [README.md](README.md).

### Packaging and verification

- `npm run package` builds the frontend and creates an unsigned local desktop package in `release/` for the host platform and architecture. No signing, notarization, or automatic updates.
- `npm run verify` runs unit tests, browser E2E tests, and the Electron desktop smoke test in sequence. Browser E2E requires Playwright Chromium; desktop smoke tests use a temporary Cove profile and a local HTTP fixture.

### Privacy and remaining limits

- Workspace exports contain browsing history and favorites; treat exports as private browsing data. Cookies, passwords, download records/files, and scratchpad contents are excluded. Clearing history does not clear site sessions or exported copies.
- Cove remains a prototype, not Arc parity or a hardened daily-driver browser. Extensions, sync, a password manager, a permissions UI, and automatic updates are absent; gated permissions are denied by default. Unsigned packaging and passing verification do not establish production security. See [SECURITY.md](SECURITY.md).
