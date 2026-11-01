# Contributing to Cove

Keep browsing primary. Ship small, independently testable changes and keep the browser chrome separate from untrusted web content.

1. Install dependencies with `npm ci`.
2. Use `npm run desktop:dev` for native work or `npm run dev` for workspace-only work.
3. Add model/security tests under `tests/`, browser tests under `e2e/`.
4. Run `npm test`, `npm run build`, and `npm run test:e2e`. Native changes must also pass `npm run test:desktop` on a graphical desktop.
5. Describe behavior, verification, and security implications in the change request.

## Guardrails

- Never give web pages access to Node, IPC, shell preload, arbitrary filesystem reads, or arbitrary process execution.
- Never silently permit a new device permission or external protocol.
- Do not read, alter, or copy profiles from installed browsers.
- Keep the new-tab page free from analytics, remote fonts, and mandatory network access.
- Respect keyboard access, focus visibility, reduced motion, and both themes.
- Do not add secrets or real user profiles to fixtures.

## Next milestones

Permission controls, signed installers with secure updates, extension support, opt-in bookmark import, tab suspension and recovery, and fuller accessibility testing. Propose security-sensitive architectural changes before implementation.
