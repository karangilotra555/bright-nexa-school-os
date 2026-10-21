# Student portal fixes

The portal now treats the server as the authority for student login and credential verification. A failed/unavailable API cannot authenticate browser-local records. The demo uses an isolated fictional identity and never reads the school roster.

- `#/school-profile` displays public institution fields from `/api/school-profile`.
- Logout removes the token and clears rendered private identity and credentials.
- Academic, fee and attendance tables show explicit unavailable states. This server has no persisted endpoints for those records; reconnect them before advertising these features as live.
- Official print links are withheld because the existing print pages use browser-local/sample records. Obtain official documents from the office until their authenticated data flow is implemented.
- The server blocks database/source downloads and returns JSON for unknown API paths.
- Public legacy HMAC signatures are rejected. Reissue legacy HMAC QR cards through the authenticated asymmetric signing endpoint. Current server-generated signatures verify using its actual active key.

Deployment requires a Node web service running `npm start` on Node 22.13+ or Node 24, with the same origin serving portal and APIs. A Render static site cannot run these endpoints. The supplied live URL returned 404 for `/api/health` during this task. Preserve the existing database and signing vault; durable storage is necessary across service replacements. Do not reset or reseed production data during rollout.

Validation: `npm test` runs portal regression tests using a minimal DOM harness and integration tests against an isolated temporary Node/SQLite server. No production student data is accessed. Browser rendering/mobile interaction was not verified in this environment. `npm run build` is the repository's existing no-op build command.

Static rollout (user-selected): Render service srv-db96jj8473hc73av0720 publishes docs/ from main. Root portal files and docs copies must match. Public school-profile.json supplies the existing published school information and explicitly selects demo-only mode. The credential form is hidden; isolated demo remains usable. No paid backend or persistent resource is provisioned. Server changes are retained for a future explicitly configured backend and are not running on this static site.
