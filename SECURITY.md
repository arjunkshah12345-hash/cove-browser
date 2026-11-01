# Security

Cove v0.6.0 source includes private windows, limited site controls, manual tab sleeping, whole-space site-data reset, and workspace-history retention. Public verification is recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md); other platforms and actual camera/microphone hardware behavior remain unverified. It is an early browser prototype, not Arc parity, a hardened daily-driver browser, or an independently audited production security boundary. Do not use it for sensitive browsing yet. Extensions, account sync, a password manager, persistent permission management, and automatic updates are absent. See [FEATURES.md](FEATURES.md) for release blockers.

## Current boundaries

### Lifecycle, cookies and data removal (v0.6 source)

Normal Cove spaces use separate persistent Chromium sessions. Native fixtures verify persistent cookies and site localStorage across application restart, isolation from private sessions, and whole-space reset isolation. This is not blanket Chrome compatibility or access to another browser’s profiles. Session cookies still follow Chromium’s session-cookie lifetime; only cookies with persistence attributes are promised across restart.

Manual tab sleeping requires explicit confirmation and native eligibility checks. It closes the guest rather than merely detaching it, losing forms and in-page navigation state. Selected split members remain protected while overlays hide views. Loading, audio, capture, DevTools, potential camera/microphone use, active space downloads and page output prevent sleeping. Media permission exposure is conservatively remembered until a full navigation, since revoking a grant alone does not terminate an existing stream. There is no automatic discard policy or measured process-memory accounting.

Confirmed space reset closes its guests before sequential storage/cache/authentication clearing and connection shutdown. Main-process authorization restricts sessions to known Cove space IDs; the default session and arbitrary partition/path inputs are not exposed. Concurrent resets and guest recreation during a reset are blocked. A partial result means some data may already be gone and some may remain; there is no rollback or secure-disk-erasure guarantee. Permissions, workspace/history/bookmark/note records, downloaded files and other spaces are not erased. Fine-grained per-cookie/per-origin/time controls remain unimplemented.

History retention removes expired visits from the active workspace at startup and minute sweeps, with explicit confirmation before enabling a finite age limit. Recovery previews remain protected. Private instances use only in-memory state. Rotating recovery backups, exported files and disk remnants may retain earlier visits; retention is not a forensic deletion or secure erase feature.

### Workspace recovery and page output (v0.4 source)

Normal workspace saves validate state and retain the previous valid primary in a rotating local backup. Corrupt/unavailable data enters protected preview mode; autosave cannot replace it until explicit recovery. Recovery preserves exact corrupt primary bytes; starting fresh also preserves surviving backup bytes separately. Conflicting quarantine data or failed preservation blocks replacement. Later changes rotate ordinary backups, so export files are required for durable copies. Individual key writes are atomic, but multi-key operations are not transactional or crashproof and do not coordinate simultaneous shell instances. Private windows bypass normal persistence and recovery.

Workspace imports require replacement confirmation; a failed normal save leaves current in-memory state unchanged. Bookmark HTML exports contain escaped live HTTP/HTTPS tab URLs and global favorites, excluding history, archive, notes, cookies, and permissions. Explicit private exports and saved PDFs survive closing the private window.

Print/PDF/guest-DevTools IPC requires the trusted shell main frame and a valid live website guest. PDF paths come only from a main-owned native save dialog, not renderer arguments. Cancellation writes nothing; concurrent output is rejected, and render/write failures reject. Guest DevTools intentionally expose the page's data to the local user. Printing may disclose content to the selected printer/service; there is no print-job privacy guarantee or PDF encryption.

- Remote pages run in sandboxed Chromium views with context isolation, web security, and Node integration disabled. They never receive the shell's preload script.
- The preload exposes an allowlisted bridge for tab, layout, find, zoom, mute, download, private-window, and site-control operations. Main-process handlers verify the caller is the trusted shell's main frame and validate their payloads.
- Only HTTP/HTTPS navigation is accepted. Executable schemes, local file URLs, embedded credentials, native popup windows, and external protocol launches are rejected. Eligible popup links can instead become ordinary Cove tabs.
- Normal spaces have separate persistent site-data partitions; private spaces have non-persistent partitions in a separate process. This is cookie/session separation, not OS-level identity isolation or anonymization.
- Permissions are denied by default, with only explicit memory-only site allowances described below. There is no certificate-error bypass.
- Downloads use the native save flow. Cove exposes cancellation and reveal-in-folder for completed downloads, never a file-open action or auto-open. Reveal resolves a recorded download ID to its saved absolute path in the main process; the renderer cannot supply an arbitrary path. Download records are memory-only, capped at 100, and are not workspace data. The oldest finished record is evicted at capacity; if none is finished, the new download is rejected. Restarting drops records, not saved files. This is not malware scanning or a guarantee that a downloaded file is safe.
- Imported workspaces are limited to 2 MB (2,000,000 bytes) and structurally validated before replacing workspace state, without replacing website sessions. No browser profiles are imported.
- Bookmark import reads only a user-selected HTML export up to 5 MB (5,000,000 bytes). It strips active markup before DOM parsing, keeps only credential-free HTTP/HTTPS URLs, previews the result, and adds pinned tabs only after confirmation. Duplicate URLs in the active space are skipped; parsing stops at 500 accepted links, and import respects the 500-tab and 200-folder workspace limits. It does not load the imported websites during parsing or read another browser's profile. It is not a direct Arc data importer.
- The start page is bundled locally. Workspace state is unencrypted local data, so someone with access to the device can read it.

## Local data and exports

Normal browsing history persists in shell local storage, capped at 1,000 visits across spaces. It records URLs, titles, space IDs, and visit timestamps; the searchable panel displays up to 200 matching entries. Individual entries can be removed and clearing all history requires confirmation. Clearing normal history does not provide private browsing or erase cookies, site storage, downloaded files, or copies already exported.

Workspace JSON exports include browsing history and favorites, as well as tabs, titles, spaces, folders, the archive, theme settings, and the optional search-engine preference. Treat these files as sensitive browsing data. Cookies, passwords, permission allowances, download records, downloaded files, and scratchpad contents are not included. Import replaces workspace history and favorites along with the other workspace state; in private mode this changes only the in-memory workspace. Searches send the query to the selected provider (DuckDuckGo by default, or Google, Bing, Brave Search); local-first workspace storage does not make web searches local or anonymous.

Removing a space removes its workspace tabs, folders, archive entries, and browsing history, but does not erase that space's persistent website data. Space partitions separate cookies and sessions; they do not anonymize traffic or protect data from someone with local device access.

## Site permissions (v0.3 source)

The desktop toolbar exposes location (`geolocation`), notifications, and a combined camera/microphone (`media`) allowance. Allowances are held only in process memory and keyed by space ID and canonical exact origin: scheme, hostname, and port, not URL path. They do not persist across process restarts, enter workspace exports, or carry between normal and private processes. Reset removes the selected origin's allowances in that space; it does not clear cookies or website data.

Eligible origins are HTTPS or HTTP with the exact loopback hostname `localhost`, `127.0.0.1`, or `[::1]`. Ordinary HTTP, credentialed or malformed URLs, and other schemes cannot receive allowances. Request and check handlers require matching, eligible top-level page provenance and the correct session. Subframes, missing or contradictory provenance, unsupported permissions, unsupported media types, and display capture/screen sharing are denied. Mutations check the displayed origin against the current guest URL to reject stale-page changes. An allowance is not a guarantee of device access: OS controls and site behavior still apply.

Changes govern **future permission requests**, not existing use. Pages are not reloaded automatically; a reload may be needed for a site to request again. **Revoking or resetting a permission does not stop an already active camera or microphone stream. Close the tab to stop it.** Camera and microphone are currently one allowance, not independently scoped device controls. Persistent grants, request prompts, active-device indicators, and comprehensive revocation UX remain incomplete/roadmap work.

## Private windows (v0.3 source)

Each private launch starts a separate Electron process with a fresh temporary Cove user-data directory. Both its shell and guest site partitions are non-persistent. The private UI starts from a fresh workspace, does not load or save the normal workspace or scratchpad, keeps private notes and workspace changes in memory, and skips recording new navigation history. Normal saved workspace/note/history are not overwritten. Explicit workspace import can still display history already present in the imported file; this is not newly recorded private navigation.

**Private mode is not anonymity, secure deletion, or a guarantee of no disk traces.** Websites and network operators can still observe traffic, and local device access remains a threat. Downloads, saved files, and explicitly confirmed workspace exports survive closing the window. The launcher does not automatically erase its temporary user-data directory or runtime metadata. Non-persistent website sessions are not a promise that OS logs, swap, crash artifacts, or other metadata cannot exist. No other browser's profile is read or cleaned. Do not rely on private mode for anti-forensics.

## Local packaging

`npm run package` creates an unsigned developer build for the host platform and architecture under `release/`. It does not sign, notarize, create a trusted public installer, or configure automatic updates. A local package is not evidence of security review or support on every platform. `npm run verify` runs unit tests, browser E2E tests, and the native desktop smoke test; passing tests is not an independent security audit.

## Reporting

Do not post exploit details, secrets, or private browsing data in public issues. Until a repository with a private security reporting channel is configured, report privately to the maintainer through the channel from which you received the source. No public security-report address is invented here.

## Release gate

Public binary releases need a full security review, signed distribution, a reliable Chromium/Electron update pipeline, dependency audits, platform-specific sandbox testing, privacy/permission enforcement and UX review, and download/error handling review. Unit policy tests, mocked browser UI tests, and native privacy smoke coverage exist, but their presence is not a verified v0.3 release or an independent audit. Never disable the sandbox, CSP, web security, or TLS checks to work around a website compatibility issue.
