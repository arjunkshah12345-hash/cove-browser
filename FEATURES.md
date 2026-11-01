# Cove feature inventory and implementation checklist

This is a source-based inventory and prioritized backlog for a credible, independent Arc-inspired open-source browser, not a claim of all Arc features or production readiness. Scope: current `src/`, `electron/`, test, and packaging implementations. The package source version is `0.6.0`; versioned developer apps and verification ledgers live in `release/`, with older apps preserved. Public verification is recorded in `docs/VERIFICATION.md`. A supported cross-platform release matrix remains **pending**. A checked box means code exists, not that it is audited, release-verified, or universally compatible.

## Status and execution order

- `[x] Implemented` — an identifiable implementation exists; stated limits still apply.
- `[ ] Incomplete` — a foundation exists, but the named capability needs more work.
- `[ ] Roadmap` — no dedicated end-to-end implementation was found; Chromium capability alone is not a delivered Cove feature.
- **P0: release blockers** — security maintenance, privacy validation, recovery, accessibility, and trustworthy distribution before public daily-driver claims.
- **P1: core browser completeness** — finish profiles, tab lifecycle, navigation, migration, and ordinary browser workflows.
- **P2: ecosystem and differentiation** — extensions, credentials, sync, richer media, and advanced customization after their security designs are reviewed.
- **P3: optional expansion** — mobile, collaboration, and nonessential experiments; no parity promise or delivery dates.

Implement in dependency order: harden the verified v0.6 foundations → trustworthy updates/distribution and recovery → complete core workflows → review ecosystem/credential/sync designs → add advanced features. There are 42 implemented entries and 39 open entries; entries can group several related capabilities. Unchecked items remain product backlog, not delivered capabilities.

## Core tabs, sidebar, spaces, profiles

- [x] Implemented — native Chromium pages in isolated `WebContentsView`s; URL navigation, loading/error states, back/forward, reload, lazy creation of inactive saved tabs.
- [x] Implemented — vertical tabs, collapsible sidebar, tab selection/cycling, close/restore, drag reorder, rename, duplicate, move between spaces, copy link, and per-tab mute.
- [x] Implemented — default Personal/Work/Studio spaces, create/rename/confirmed remove, workspace filtering, and separate persistent site sessions per normal space. At least one space remains.
- [ ] Incomplete · P1 — full profile manager: spaces isolate site sessions but are not independently managed named identities with profile settings, lifecycle, reset, and import/export policy.
- [ ] Roadmap · P1 — ordinary multi-window browsing, moving tabs between windows, window/session restore, keyboard-accessible reorder, multi-select/bulk tab actions, and clear duplicate-tab handling.
- [x] Implemented — focused-page stop loading, ordinary reload, and cache-bypassing reload with Command/Ctrl Shift R; loading toolbar switches to Stop.
- [ ] Incomplete · P1 — forward-history menu, middle-click/modifier-click behavior, popup/auth compatibility review, and robust offline/TLS/network error recovery. Native popup windows and external protocols are currently blocked.
- [x] Implemented (v0.6) — confirmed manual sleeping of eligible inactive native tabs, truthful lifecycle/resource visibility, protected selected panes even under overlays, and lazy wake with saved URL/mute/zoom. Forms and guest back/forward history are not restored. Captured/audible/loading/media-enabled/DevTools pages, page output and active space downloads are protected.
- [ ] Incomplete · P1 — automatic resource policies, measured memory/process accounting, long-session leak tests and auditable performance budgets.

## Pinned tabs, favorites, folders, archive

- [x] Implemented — pin/unpin, folder grouping/collapse, drag tabs into folder/pinned groups, and up to 12 editable workspace-wide favorites.
- [x] Implemented — manual close archives tabs, retaining up to 100 entries; archive restore and restore-most-recent shortcut. This is not scheduled tab expiry.
- [x] Implemented (v0.3) — Settings → Manage folders renames folders and confirms deletion. Deletion keeps live and archived tabs and their pinned state, clearing only folder membership; covered by model and browser UI tests.
- [ ] Roadmap · P1 — nested folders, reorder folders, and accessible bulk folder operations beyond basic rename/delete.
- [x] Implemented — opt-in 24-hour/7-day/30-day inactivity archiving, protecting pins, favorites, and both visible panes. Activity updates independently of the option. Legacy timestamps start tracking without expiry; sweeps occur on selection/setting changes and every minute while running. Search and individual restore use the bounded 100-tab archive.
- [ ] Incomplete · P1 — configurable archive retention and user-facing batch undo. Archive expiry while the app is closed is evaluated on the next running sweep; there is no background service.
- [x] Implemented — pinning captures the home URL; Reset pinned tab returns to it. Legacy pins capture their currently saved URL. Favorites are global shortcuts, pins are live tabs excluded from auto-archive, and unpinned tabs expire only when enabled. Keyboard-accessible move-up/down actions reorder within a sidebar group.

## Command palette and search

- [x] Implemented — URL/search palette, existing-tab switching, address editing, keyboard results navigation, and guarded URL normalization.
- [x] Implemented (v0.3) — configurable DuckDuckGo (default), Google, Bing, and Brave Search; command/address searches honor the persisted optional v1 preference, workspace JSON carries it, and older workspaces fall back to DuckDuckGo. Covered by model and browser UI tests.
- [x] Implemented — desktop find-in-page with match counts and next/previous; zoom 50–200% with reset.
- [x] Implemented (v0.5) — unified local ranked results across tabs in all spaces, history, favorites, and browser commands. Multi-token matching, deterministic ordering, deduplication among matching destinations, searchable browser actions, combobox/listbox keyboard selection, and scroll-to-highlight. Address editing always navigates the focused page; an empty new-tab command creates a fresh tab. No network suggestions.
- [ ] Roadmap · P1 — keyword/site search, custom search-engine definitions, configurable shortcuts, and privacy-controlled optional suggestions. Built-in default-provider selection is already implemented.

## Split view and Peek

- [x] Implemented — two panes with native pages or new-tab pages, focused-pane tracking, pointer and keyboard divider resizing, first pane bounded to 25–75% width.
- [x] Implemented (v0.5) — per-space saved split pairs and widths, pane swapping with mirrored ratios, stable positions when focusing either member, and primary-pane replacement when selecting another tab. Close/move/space removal prunes stale pairs. Workspace import/export includes optional layouts; private splits are memory-only. Native smoke covers focused address/find/zoom/reload/close plus saved/swapped pane order, restored ratio, and guest shortcut dispatch.
- [ ] Roadmap · P1 — Peek/link preview overlay with dismiss, promote-to-tab, keyboard handling, safe navigation, and isolated page permissions.
- [ ] Roadmap · P2 — more than two panes, reusable split groups, and layout presets.

## Downloads, history, migration, import/export

- [x] Implemented — desktop download progress, cancel, native save dialog, reveal completed files; no auto-open. Memory-only records capped at 100, rejecting new downloads if all records are unfinished.
- [x] Implemented — normal browsing history capped at 1,000 visits, searchable panel showing up to 200 matches, individual deletion, and confirmed clear-all.
- [x] Implemented — validated workspace JSON import/export with a 2 MB input limit, tabs/spaces/folders/archive/favorites/history/themes and optional search preference; import replaces workspace state, not site sessions.
- [x] Implemented — user-selected bookmarks HTML import with preview/confirmation, active-markup stripping, HTTP/HTTPS filtering, duplicate skipping, 5 MB file limit, 500 accepted links, and workspace capacity checks.
- [ ] Incomplete · P1 — download retry/resume, interruption recovery, retention/settings, dangerous-file warnings, and explicit distinction between clearing records and deleting files. No malware scanning is provided.
- [x] Implemented — history text/space/time filters, matching-only or all-history confirmed deletion, and confirmed workspace-import preview with export/cancel. Clearing history does not clear website data.
- [x] Implemented (v0.6) — confirmed 1/7/30/90-day workspace-history retention with no-age-limit default (1,000-visit cap), startup/minute sweeps and private in-memory handling. Open tabs/site data are unaffected; backups/previous exports may retain removed visits.
- [ ] Incomplete · P1 — cross-instance transactional import/rollback and future-version migrations. Current workspace schema remains backward-compatible v1; backups rotate with changes.
- [x] Implemented — portable Netscape bookmark HTML export of all/current-space live tabs grouped by space/folder plus global favorites; escaped credential-free HTTP/HTTPS URLs only, excluding history/archive/notes/site data. Explicit private exports persist as files.
- [ ] Roadmap · P1 — direct Arc/other-browser migration from explicit user exports, portable bookmark export, migration summaries/conflict resolution, and selective workspace export. No existing browser profiles are read.
- [x] Implemented — focused-page native print dialog and PDF export via a main-owned save dialog, with cancellation/no write, output concurrency guard, and awaited render/write. Real Chromium PDF generation is smoke-tested; physical printers remain unverified.
- [ ] Incomplete · P1 — save-page HTML flows, PDF browsing/download compatibility, and file/protocol association policy.

## Customization and accessibility

- [x] Implemented — sage/sand/lavender palettes, evening mode, bundled start-page art/fonts, scratchpad, and collapsible sidebar. Normal notes persist locally and are excluded from exports.
- [x] Implemented — labeled controls/dialogs, command-palette keyboard navigation, Escape dismissal, focus-management hooks, and keyboard split-divider controls.
- [ ] Incomplete · P0 — screen-reader and keyboard-only audit, complete focus containment/return, contrast and high-contrast checks, reduced motion, text scaling, and touch/target sizing. Existing ARIA is not verified accessibility compliance.
- [ ] Roadmap · P1 — sidebar sizing/docking, system theme following, per-space appearance, configurable new-tab content, and shortcut reference/remapping.
- [ ] Roadmap · P2 — localization/RTL, more languages, and carefully scoped custom styles with safe defaults.

## Privacy, site controls, and private windows

- [x] Implemented (v0.3 source) — separate private-process launcher via File menu, Settings, or Command/Ctrl Shift N; fresh temporary Cove user-data directory and non-persistent shell/site sessions.
- [x] Implemented (v0.3 source) — private workspace/note remain in memory; no loading/overwriting normal saved workspace/note and no newly recorded navigation history. Explicitly imported history can remain visible in the private in-memory workspace.
- [x] Implemented (v0.3 source) — explicit location, notifications, and combined camera/microphone allowances plus reset; memory-only per exact origin (scheme/host/port) and space, excluded from exports and reset on process restart.
- [x] Implemented (v0.3 source) — only HTTPS or HTTP on exact `localhost`, `127.0.0.1`, `[::1]`; same-origin top-level request/check provenance, current-origin checks for changes, default deny for subframes/unsupported permissions and media types. Display capture/screen sharing always denied.
- [x] Implemented — no telemetry/account requirement; locally bundled start page avoids third-party requests. Ordinary loaded websites still make their own network requests.
- [ ] Incomplete · P0 — validate actual permission/device behavior, stale-origin denial, process/session isolation, OS permission interactions, and normal/private persistence across supported platforms. Tests exist; full release verification is pending.
- [ ] Incomplete · P0 — privacy cleanup guarantees and documentation: downloads, saved files, and confirmed private exports persist; temporary user-data directories/runtime metadata are **not automatically erased**. Private mode is not anonymity or guaranteed absence of disk traces.
- [ ] Incomplete · P0 — permission revocation semantics: changes affect future requests, do not automatically reload pages, and **do not stop active camera/microphone streams**; close the tab to stop them. Add active-device visibility and a verified stop/revoke workflow.
- [x] Implemented (v0.6) — confirmed whole-space cookie/storage/cache/HTTP-auth reset, guest teardown, in-flight reset exclusion, explicit partial-failure reporting and other-space isolation. Persistent normal cookies/site storage survive application restart in native fixtures; private isolation remains separately tested. Workspace/history/bookmarks/files and permissions remain unchanged.
- [ ] Incomplete · P1 — site-data/cookie inspection and selective deletion, time-scoped clearing, third-party cookie policy controls, automatic session reset on space removal, and independently scoped camera/microphone controls.
- [ ] Roadmap · P2 — reviewed request-prompt UX, optional persistent grants with expiry, privacy dashboard, tracker/content blocking and exceptions, HTTPS upgrade policy, and fingerprinting-defense evaluation. Screen sharing needs its own reviewed picker/security design, not a blanket grant.

## Security and update lifecycle

- [x] Implemented — sandbox/context isolation/web security enabled, no guest Node integration or shell preload, guarded shell-only IPC, HTTP/HTTPS URL checks, navigation restrictions, and no certificate-error bypass.
- [x] Implemented — structural workspace validation, bounded imports/state/download lists, local trusted shell, and policy-focused tests.
- [ ] Incomplete · P0 — independent threat/security review, hostile-content/IPC/import fuzzing, CSP and sandbox enforcement checks, dependency/license audit, and a private vulnerability-report channel.
- [ ] Roadmap · P0 — timely Electron/Chromium upgrades, vulnerability monitoring, signed update metadata/artifacts, authenticated automatic updates, rollback/recovery, and published security support/EOL policy.
- [ ] Roadmap · P0 — signed/notarized release artifacts, reproducible build/provenance/SBOM process, secrets handling, and release-key protection. Never disable TLS checks or the sandbox for compatibility.

## Extensions, passwords, and autofill

- [ ] Roadmap · P2 — extension compatibility investigation, explicit supported API scope, installation/update/signature policy, permissions, management UI, and disable/remove/recovery flows. No Chrome Web Store parity claim.
- [ ] Roadmap · P2 — OS-keystore-backed credential storage or reviewed password-manager integration, save/fill/update prompts, user-presence controls, and secure credential import/export.
- [ ] Roadmap · P2 — address/payment autofill with consent, private-mode policy, data deletion, and phishing/origin safeguards. Do not store credentials in workspace JSON/local storage.

## Media and picture-in-picture

- [x] Implemented — native page rendering with audio-state reporting and tab mute/unmute; a permission allowance exists for future camera/microphone requests.
- [ ] Incomplete · P1 — platform media playback/capture compatibility, device handling, audio indicators, permission/stream lifetime tests, fullscreen and keyboard behavior.
- [ ] Roadmap · P2 — dedicated PiP entry/exit/lifecycle controls, media-session controls, output selection, and user-visible capture state. Chromium support alone is not a tested Cove workflow.
- [ ] Roadmap · P2 — explicit codec/DRM/protected-content support matrix and legal/distribution review; no universal streaming-service compatibility promise.

## Sync and portability

- [x] Implemented — manual workspace JSON portability only; this does not transfer cookies, passwords, permissions, notes, download records, or saved files.
- [ ] Roadmap · P2 — opt-in end-to-end-encrypted sync of chosen tabs/spaces/favorites/settings, key/device management, conflict resolution, offline queues, deletion propagation, and self-hostable service design.
- [ ] Roadmap · P2 — exclude private sessions by design, separate credential-sync consent, recovery-key UX, and data export/account deletion before shipping an account service.

## Developer tools

- [x] Implemented — development/live-reload scripts and native View menu shell DevTools toggle. Shell DevTools are not focused website DevTools.
- [x] Implemented — focused guest DevTools, context-menu Inspect Element, split-pane menu targeting, and Command/Ctrl Alt I. Native smoke verifies the guest DevTools opens; this is distinct from shell DevTools.
- [ ] Roadmap · P2 — debug diagnostics export with redaction and explicit consent; opt-in remote-debugging policy without exposing a listener by default.

## Distribution, platforms, onboarding, reliability

- [x] Implemented — Electron desktop entry and host-platform/architecture unsigned local packaging; browser preview for workspace UI only, not embedded third-party browsing.
- [x] Implemented — model/bookmark/security/private-launch unit tests, Playwright workspace/privacy UI tests, normal desktop and private-session native smoke scripts, and a combined verification command.
- [x] Implemented — normal workspace reload persistence, storage-error feedback, basic page-load/renderer-crash error messages, and lazy loading of saved inactive tabs. These are not transactional crash recovery.
- [x] Implemented — validated rotating workspace backups, protected recovery preview, explicit backup/fresh recovery, and exact-byte primary/backup preservation before fresh reset. Quarantine conflicts or failed preservation block replacement. Private windows bypass these helpers. Regression tests cover missing/corrupt snapshots, quota failures, and later autosaves.
- [ ] Incomplete · P0 — expand the passing macOS arm64 unit/build/browser/native suite into a recorded macOS/Windows/Linux architecture and real-device matrix. Actual camera/microphone/OS permission tests cannot be replaced by mocked UI assertions.
- [ ] Incomplete · P0 — crash-safe workspace writes/backups/recovery, corruption and migration handling, interrupted shutdown/download handling, offline recovery, long-session/large-workspace stress and memory-leak tests.
- [ ] Roadmap · P0 — CI release/security/accessibility gates, signed installers and update-channel testing, install/uninstall validation, and documented platform support commitments.
- [ ] Roadmap · P1 — first-run onboarding, honest privacy defaults/explanations, default-browser registration, OS link/file handling, migration entry points, and recoverable setup failures.
- [ ] Roadmap · P1 — production support docs, diagnostics without private data, compatibility regression fixtures, and performance/startup/resource budgets.
- [ ] Roadmap · P3 — mobile/tablet clients, cross-device handoff, optional collaboration, and other non-core experiments only after desktop foundations stabilize.

## Evidence and definition of done

Primary source: `src/App.jsx`, `src/model.js`, `src/bookmarks.js`, `src/WorkspaceTools.jsx`, `src/SiteControls.jsx`, `src/ResourceSettings.jsx`, `src/retention.js`, `electron/main.cjs`, `electron/preload.cjs`, `electron/policy.cjs`, `electron/permissions.cjs`, `electron/private.cjs`, `electron/site-data.cjs`, and `scripts/package-desktop.mjs`. Test definitions are in `tests/`, `e2e/`, and the three native smoke scripts; their presence is not a passing result.

Before marking a backlog item implemented, require a user-facing workflow, validated native/security boundaries where relevant, failure/undo/privacy behavior, appropriate tests, and updated docs. Before marking a release verified, record `npm test`, `npm run build`, `npm run test:e2e`, and `npm run test:desktop` results plus the actual platform/architecture and known failures. Public daily-driver claims additionally require the P0 release gates above. Verification recorded October 31, 2026 on macOS arm64: `npm run verify` passed 189 unit tests, 44 browser UI tests, production build, and all three native smoke scripts. Standard packaging succeeded and both applicable native smoke scripts also passed against the v0.6 packaged executable. `npm audit --omit=dev` reported zero vulnerabilities. Exact artifact identity and coverage limits are recorded in `docs/VERIFICATION.md`. Feature parity, independent security auditing, signed distribution, and other platform/device validation remain outstanding.
