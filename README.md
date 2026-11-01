# Cove

A little space for you. An independent, open-source, Arc-inspired browser built with Electron, Chromium, and React.

**v0.6.0 adds native tab sleeping, per-space website-data reset, and configurable history retention.** Cove remains a desktop prototype, not Arc parity or a hardened daily-driver browser. Run source with `npm run desktop`; local developer builds live in the untracked `release/` folder; public verification is in [docs/VERIFICATION.md](docs/VERIFICATION.md). Earlier developer apps remain preserved. This is a clean-room implementation, not a fork of Arc or a claim to its code, trademarks, or services. See [FEATURES.md](FEATURES.md) for the prioritized inventory, [CHANGELOG.md](CHANGELOG.md) for changes, and [SECURITY.md](SECURITY.md) for privacy boundaries.

### Cookies, sessions, and resource controls

Normal desktop spaces use Chromium’s persistent, isolated cookie and website-storage sessions: compatible websites can retain logins across application restarts. Private windows use separate nonpersistent site sessions. This does not guarantee Chrome-equivalent compatibility, Chrome profile/password import, extensions, DRM, or every authentication flow. Cove never reads an existing Chrome/Arc/browser profile.

In **Settings → Tabs & site data**, review real tab state, then confirm **Sleep** for an eligible inactive tab. Waking reloads its saved address with mute/zoom preserved; unsaved forms and the guest’s back/forward history are lost. Selected split panes, active audio/loading/capture, DevTools, possible camera/microphone use, active space downloads, and printing/PDF output are protected. A media-enabled page stays protected until reloaded after permission revocation, because revocation alone does not stop active streams. No automatic sleeping or invented memory-size readouts are provided.

The same panel offers a confirmed **current-space site-data reset**. It signs out that space, closes its pages, and clears cookies, storage, cache, and HTTP authentication/connections. It leaves workspace tabs, history, bookmarks, notes, download records/files, other spaces, and permission grants alone. Partial failures are explicit; reset is not transactional or secure disk erasure. Fine-grained cookie inspection, per-origin/time deletion, and third-party cookie controls remain backlog items.

**Keep browsing history** offers no age limit (maximum 1,000 visits), or 1/7/30/90 days. Review and confirm before removal. Expiry runs at startup and each minute while Cove runs, not in a background service. It affects workspace history only; backup snapshots and earlier exported files may still contain removed visits. Private-window changes remain in memory.

## Run it

Requires Node.js 22.12+ (or a newer supported LTS), npm, and a graphical desktop on macOS, Windows, or Linux.

```sh
npm ci
npm run desktop
```

For development with live reload:

```sh
npm run desktop:dev
```

To explore the workspace in a regular browser:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. The web preview has working workspace controls but intentionally does not iframe third-party websites. Its “Open website” link opens a separate browser tab. Full in-app browsing requires the desktop app.

## What works

- Local ranked search across tabs in every space, favorites, history, and browser commands. Matching titles rank ahead of weaker matches; duplicate matching destinations prefer live tabs. Arrow keys and Enter select the highlighted result; use the address bar to always navigate the focused page rather than switch tabs. No network suggestions.
- Per-space saved split pairs and divider widths, pane swapping, and focus-preserving selection. Selecting a third tab replaces the left pane; closing or moving a member clears that saved split. Layouts travel with workspace JSON; private layouts stay in memory.
- Focused-page print, native PDF save, guest DevTools/Inspect Element, stop loading, and hard reload (Command/Ctrl Shift R). Physical-printer compatibility remains unverified.
- Opt-in archiving after 24 hours, 7 days, or 30 days, excluding pins, favorites, and visible tabs. The searchable archive retains at most 100 tabs.
- Pinned-address reset and keyboard-accessible same-group reorder. Legacy pins capture their current saved address.
- Protected corruption recovery and confirmed imports, with rotating backups and exact-byte preservation before reset. Export files for durable backups: multi-key local storage writes are not transactional or crashproof.
- Composable history space/time filters, matching-only or all-history deletion, and portable bookmark HTML export from Settings → Import bookmarks. Exports include live tabs/global favorites, not history, archive, notes, or site data.

- Settings → Manage folders supports renaming and confirmed removal without losing live or archived tabs. Settings also selects DuckDuckGo, Google, Bing, or Brave Search for address and command searches.

- Real Chromium web pages through isolated `WebContentsView` instances.
- Vertical tabs, pinned tabs, folders, drag-to-reorder, and tab archives with restore. Tab menus support rename, duplicate, pin/unpin, move to another space, copy link, split view, mute/unmute, and close.
- Personal, Work, and Studio spaces, plus user-created spaces; rename or remove spaces with confirmation for removal, retaining at least one. Native spaces have separate cookie/storage partitions; removing a space does not erase its website data.
- URL/search command palette, tab switching, back/forward navigation, and reload. Settings offers DuckDuckGo (default), Google, Bing, or Brave Search; the saved preference governs command-palette and address-bar searches and travels with workspace JSON. Older v1 workspaces without the optional preference use DuckDuckGo.
- Searchable browsing history, capped at 1,000 saved visits across spaces, with per-entry removal and confirmed clear-all. The panel shows up to 200 matching entries; history persists locally and is included in workspace exports.
- Editable favorites: add, rename, change addresses, reorder, and remove up to 12 workspace-wide shortcuts. Favorites persist and travel with workspace exports.
- Safe bookmarks HTML import with preview and explicit confirmation: accepts files up to 5 MB (5,000,000 bytes), strips active markup before parsing, accepts only credential-free HTTP/HTTPS links, and skips duplicate URLs in the active space. Up to 500 parsed links become pinned tabs grouped by folder names, within workspace limits of 500 tabs and 200 folders. Nothing is replaced and no browser profiles are read.
- Desktop find-in-page with match counts and next/previous controls, page zoom from 50% to 200%, and per-tab mute/unmute.
- Resizable two-pane split view with native pages or a new-tab page in either pane. Drag the divider or focus it and use Left/Right arrows; the first pane stays between 25% and 75% of the width.
- Sage, sand, and lavender palettes; evening mode; collapsible sidebar.
- Local workspace persistence and scratchpad; JSON workspace import/export.
- Lazy page creation: inactive saved tabs do not load websites on startup.
- Bundled fonts and scenery; the start page makes no third-party network requests.
- Desktop site controls for location, notifications, and a combined camera/microphone allowance. Choices are memory-only, scoped to an exact origin and space, and denied by default; see the limits below. No telemetry or account requirement.
- Separate desktop private windows, with non-persistent shell/site sessions, an in-memory workspace and scratchpad, and no recording of new browsing history. Private windows do not load or overwrite the normal saved workspace or note.
- Desktop downloads panel with progress, cancellation, and explicit reveal-in-folder for completed downloads. Files use the native save flow and are never opened by Cove. Download records are memory-only, capped at 100, and excluded from workspace exports; older finished records are evicted first, or a new download is rejected if all 100 are unfinished. Saved files remain on disk after restart.

## Shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Search or new tab | ⌘ K / ⌘ T | Ctrl K / Ctrl T |
| Edit address | ⌘ L | Ctrl L |
| Close tab | ⌘ W | Ctrl W |
| New private window (desktop) | ⌘ Shift N | Ctrl Shift N |
| Restore closed tab | ⌘ Shift T | Ctrl Shift T |
| Downloads | ⌘ J | Ctrl J |
| Browsing history | ⌘ Y | Ctrl Y |
| Find in page | ⌘ F | Ctrl F |
| Reload | ⌘ R | Ctrl R |
| Next / previous tab | Ctrl Tab / Ctrl Shift Tab | Ctrl Tab / Ctrl Shift Tab |
| Zoom in / out | ⌘ + / ⌘ - | Ctrl + / Ctrl - |
| Reset zoom | ⌘ 0 | Ctrl 0 |
| Toggle sidebar | ⌘ Shift S | Ctrl Shift S |
| Toggle split view | ⌘ Shift D | Ctrl Shift D |
| Settings | ⌘ , | Ctrl , |

Escape dismisses dialogs. Arrow keys and Enter navigate the command palette. Tab rows can be dragged onto another row to reorder or move into its folder/pinned group.

## Local packaging

For the source-alpha launch website, publication checklist and GitHub Pages setup, see [docs/LAUNCH.md](docs/LAUNCH.md). Preview the static site with `npx vite site --host 127.0.0.1 --port 4174`; run its subpath/mobile checks with `npm run test:site`. The website is separate from the browser workspace.

```sh
npm run package
```

Builds the frontend and packages Cove into `release/<version>/Cove-<platform>-<arch>/`, preserving other versions for the host's current platform and architecture. This is an **unsigned local developer build**, not a signed installer or public release: no notarization, cross-platform verification, or automatic updates are provided by this command.

After verifying the packaged macOS arm64 app and recording its `app.asar` SHA-256 in the version's `VERIFICATION.md`, run `npm run release:archive`. It creates `release/<version>/downloads/` with a ZIP containing the app and Electron licenses, `SHA256SUMS`, an explicit developer-channel `RELEASE.json`, and a copy of the verification ledger. It checks the bundle version, arm64 Mach-O runtime, archived ASAR identity, and runtime bytes across archiving. It refuses changed ASAR hashes or existing downloads; it does not rebuild, sign, publish, or overwrite a previous download. On the receiving machine, run `shasum -a 256 -c SHA256SUMS` from that folder before extracting. Checksums detect corruption, not publisher authenticity; distribute through a trusted channel. No Gatekeeper bypass or security-policy changes are part of this workflow.

## Private windows and site controls (v0.3 source)

Use **File → New Private Window**, the desktop Settings action, or Command/Ctrl Shift N. Each launch starts a separate process with a fresh temporary Cove user-data directory and non-persistent Electron partitions. The private shell starts with a fresh workspace, does not read or write the normal workspace or scratchpad, and does not record new navigation history. Private tabs, workspace changes, and notes are held in memory. Explicitly importing a workspace can still bring its existing history into that private session.

**Private does not mean anonymous or guaranteed disk erasure.** Websites, your network, and someone with access to the device may still observe activity. Downloads, explicitly saved files, and workspace exports remain on disk; private workspace export asks for confirmation. Temporary user-data directories and runtime metadata are not automatically erased. Do not treat this mode as anti-forensics or a substitute for a security audit.

Open **Site permissions** in the desktop toolbar for the focused web page. Location, notifications, and the combined camera/microphone control allow future requests only for that exact origin (scheme, host, port) in that space. Only HTTPS and HTTP on `localhost`, `127.0.0.1`, or `[::1]` are eligible. Choices reset on process restart and are not exported. Requests must come from the matching top-level page; subframes, unsupported permissions, and display capture/screen sharing remain blocked. OS permission policies can still prevent access.

Reset or switch off an allowance to block future requests. Pages are not automatically reloaded. **Revoking an allowance does not stop an already active camera or microphone stream; close the tab to stop it.** These are explicit site controls, not a complete permission prompt system or persistent permission manager.

## Verification

```sh
npm test                 # Workspace model and native security policies
npm run build           # Production frontend
npx playwright install chromium
npm run test:e2e         # Browser workspace integration tests
npm run test:desktop     # Real Electron/Chromium integration smoke test
npm run verify           # Unit, browser E2E, then desktop smoke tests
```

Desktop tests use temporary Cove profiles, never another browser's profile. The three scripts exercise local HTTP fixtures rather than depending on outside websites; the privacy smoke additionally checks normal/private storage isolation and permission grant/reset behavior, and the resource smoke checks actual sleep/wake, per-space website-data reset, and persistent cookies/site storage across restart. Browser privacy E2E tests use a mocked native bridge and do not establish Chromium enforcement. Linux needs a display server or `xvfb-run`. On October 31, 2026, `npm run verify` passed on macOS arm64: 189 unit tests, 44 browser UI tests, production build, and all three real Electron smoke scripts. Both applicable native smoke scripts also passed against the packaged v0.6 app. `npm audit --omit=dev` reported zero vulnerabilities. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for artifact identity and exact scope. These checks are not an independent security audit or cross-platform/device compatibility guarantee.

## Architecture

```text
src/model.js             Validated, serializable workspace state
src/bookmarks.js         Inert bookmarks HTML parsing and URL filtering
src/WorkspaceTools.jsx   History, favorites, bookmark import, downloads, find
src/SiteControls.jsx     Desktop origin-scoped permission controls
src/App.jsx              React browser chrome and start page
src/styles.css           Responsive, themeable workspace
electron/main.cjs        Browser lifecycle, isolated guest views, guarded IPC
electron/preload.cjs     Small allowlisted renderer bridge
electron/policy.cjs      URL, origin, ID, and native bounds policies
electron/permissions.cjs Memory-only, fail-closed site permission policy
electron/private.cjs     Separate private-process launcher
tests/                   Node unit tests
e2e/                     Playwright UI tests
scripts/smoke-desktop.mjs Native integration test
scripts/smoke-private.mjs Private-session and permission integration test
scripts/package-desktop.mjs Unsigned host-platform packaging
```

The trusted shell is loaded from local built files (or an explicitly configured loopback dev server). Remote pages get no Node integration, no shell preload, and no `window.cove` bridge. Each normal space uses its own persistent Electron session; private spaces use non-persistent sessions in a separate process. Commands are accepted only from the trusted shell's main frame. Switching away from a page detaches its view; closing a tab destroys its guest. Opening an overlay detaches all native views so they cannot cover the dialog.

Normal workspace JSON is stored unencrypted in the shell's local storage. Normal native cookies and site data live in Cove's own Electron user-data directory. Export contains tab addresses, titles, spaces, folders, the archive, favorites, browsing history (URLs, titles, space IDs, and visit timestamps), workspace theme settings, and the optional search-engine preference; **it does not include cookies, passwords, permission allowances, download records, downloaded files, or the scratchpad**. Treat workspace exports as private browsing data before sharing. Import accepts validated JSON up to 2 MB (2,000,000 bytes) and replaces the workspace, not site sessions. Clearing history does not clear cookies/site data, saved files, or previously exported copies. Neither the application nor these tools inspect Arc, Chrome, or other existing browser profiles.

## Deliberately unfinished

No extension ecosystem, account sync, ad blocker, password manager/autofill, browser-default registration, auto-updater, signed installers, persistent permission manager, certificate exception UI, or direct Arc data importer. Limited memory-only site controls and separate private windows exist, with the boundaries above. Screen sharing and unsupported permissions remain denied. HTTP/HTTPS pages are supported; external protocol handlers are blocked. Unvisited tabs display the hostname until loaded. No automatic tab expiry, Peek, or dedicated PiP controls. Spaces are not a full profile manager. This prototype has not had a full security audit.

Before public distribution: add signed packaging and automatic security updates, audit Electron/Chromium policies and the new privacy controls on every supported OS, add robust crash recovery, and verify accessibility with assistive technology. [FEATURES.md](FEATURES.md) separates implemented foundations from release blockers and later roadmap work. See also [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits & license

MIT, see [LICENSE](LICENSE). DM Sans and Instrument Serif are bundled through Fontsource under the SIL Open Font License (included in their packages). Icons are Lucide, ISC licensed. Scenery is from [Unsplash's image CDN](https://images.unsplash.com/photo-1472396961693-142e6e269027) under the Unsplash license. Cove is not affiliated with The Browser Company or Arc.
