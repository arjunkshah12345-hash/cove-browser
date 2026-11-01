# Cove developer-alpha launch

Cove 0.6.0 is an MIT-licensed, independent browser project. The initial launch is a source-available developer alpha and project website, not a production daily-driver release or completed Arc replacement. No account, telemetry service, or hosted browser backend is required.

## Public source

Intended repository: `arjunkshah12345-hash/cove-browser`. Publish only the Git-tracked source. Never upload `node_modules`, local release bundles, test fixture profiles, temporary logs, environment files, or internal agent notes. `.gitignore` excludes those paths. Download archives are too large for source control; attach them to a separately approved developer release only after checking hashes and disclosures.

The repository includes the application, MIT license, security boundaries, contributor guide, complete feature ledger, tests, and launch site. The alpha build instructions are in the README. The available macOS Apple Silicon artifact is unsigned, non-notarized, and lacks automatic updates. Do not use it for sensitive browsing. Windows/Linux and physical permission-device support are not certified.

## GitHub Pages

The website is plain static content in `site/`. Relative assets work at a project subpath; the Electron workspace is not the marketing website and must not be uploaded as a hosted browser.

1. Create the public repository with the intended name, then publish the source on `main` through an authorized publication path.
2. In repository Settings → Pages, select GitHub Actions as the publishing source.
3. Run the **Deploy launch website** workflow, or push a change to `site/` on `main`.
4. Confirm the workflow succeeds and open the URL recorded by its `github-pages` deployment environment. The expected project URL is `https://arjunkshah12345-hash.github.io/cove-browser/`; this is not a claim that deployment has occurred.

Local preview: `npx vite site --host 127.0.0.1 --port 4174`. The site does not depend on the application backend, external fonts, analytics, or a CDN.

The source-checks workflow runs unit tests, the production workspace build, and browser UI fixtures on Linux. It does not certify native Electron, camera/microphone hardware, signing, notarization, or an independent security audit. Consult `docs/VERIFICATION.md` for actual local results, not merely workflow definitions.

## Launch checklist

- [x] MIT license, contributor guide, security disclosures and feature ledger.
- [x] Native persistent cookies/site storage, normal/private isolation and restart fixture coverage.
- [x] Source unit tests, production build, browser UI tests and native fixture smoke checks pass locally on macOS arm64.
- [x] Redesigned launch website and Pages deployment workflow authored; 18 local site browser checks pass, including project-subpath assets, animated workspace controls, reduced-motion behavior and mobile layout.
- [ ] Public repository creation and first source push confirmed remotely.
- [ ] Pages enabled and successful deployed URL verified.
- [ ] Any downloadable binary release published with checksums and explicit unsigned-alpha warnings.

Repository creation and Pages enablement require an authorized GitHub write path. The machine's current required safety queue supports fork/push preparation for forks, PRs, comments and merges, but not new repository creation or Pages settings. Do not bypass that gate or claim publication while it is blocked.

## Before production use

Signed/notarized distribution, trusted security updates, independent security review, accessibility validation, supported-platform/device testing and the remaining P0 entries in `FEATURES.md` must be resolved before making a public daily-driver claim. Launching a truthful source alpha does not complete those gates.
