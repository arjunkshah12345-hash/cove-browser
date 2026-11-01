# Cove 0.6.0 verification

Recorded October 31, 2026, on macOS arm64 with Electron 45.0.0. These are local results, not hosted CI results or an independent security audit.

- Full application verification passed: 189 pre-existing unit tests, 44 browser UI tests, production build and all three native smoke scripts.
- After adding release-archive regressions, 199 unit tests pass. Platform-specific archive tests run only on macOS.
- Both applicable native smoke scripts also pass against the packaged executable.
- Chromium local fixtures verify persistent cookies and site localStorage across restart, separate normal/private sessions, whole-space data reset isolation, split focus/restoration, downloads, PDF output, DevTools and native permission boundaries.
- The automation-free resource harness verifies source-main sleep/wake and persistence, not packaged resource behavior or physical camera/microphone hardware.
- Production dependency audit reports zero vulnerabilities; this is not a security audit.
- Launch website: 18 browser tests pass at the `/cove-browser/` project subpath, covering local fonts/assets, no third-party network dependencies, alpha disclosures, internal links, keyboard access, mobile overflow at 320px and 390px, clipboard success/failure, synchronized workspace controls, rapid animation interruption, dynamic reduced-motion preferences and readable no-JavaScript content. Desktop and mobile rendering were visually inspected locally. Motion includes staged hero entrances, one-shot scroll reveals, space handoffs, split-pane transitions and interaction feedback; reduced motion disables these without hiding content. The workspace preview is explicitly labeled as an illustration, not a live browser. No public deployment or hosted CI result is claimed.

The preserved unsigned macOS arm64 app has `Contents/Resources/app.asar` SHA-256 `d7df04173999b78ca32aad7b6d78feb9b20bbb51f2d424b5034831ffb53a459f`.

The initial developer ZIP is 120,447,163 bytes with SHA-256 `87fcc671311907f72e4558c5b4b44b532760a2a4a17445241d221e177eb0e6da`. ZIP integrity and its archived ASAR identity were checked. This records a local artifact, not an available public download. Container metadata may change the ZIP checksum across later archives.

The archive command now checks bundle version, executable presence, arm64 Mach-O identity, archived ASAR bytes and runtime hashes across archiving. It preserves existing downloads and rejects failed or mismatched archives. Checksums detect corruption, not publisher authenticity or proof of trustworthy software.

## Limits

Only macOS arm64 was verified natively. No signed installers, notarization, trusted automatic updates, physical-device permission matrix, assistive-technology certification, independent security audit, extension ecosystem, password manager, or account synchronization are claimed. Native tests use new Cove-only fixture profiles and do not read or modify another installed browser's data.

See `FEATURES.md` and `SECURITY.md` for the remaining release gates. Site/deployment status is tracked separately in `docs/LAUNCH.md`.
