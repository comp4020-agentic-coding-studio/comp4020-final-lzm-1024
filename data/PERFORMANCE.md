# CampusWall refactoring and performance evidence

Measured on 2 October 2026 using Node 24 on the local Windows development host. The benchmark starts its own server and temporary SQLite database, adds 1,000 synthetic ANU posters alongside the 24 test posters, warms each route three times and measures 20 sequential HTTP requests through the complete response body. It removes only its temporary fixture. It never connects to production or modifies the Fly volume.

| Measurement | Before | After |
| --- | ---: | ---: |
| Full wall response, median | 45.84 ms | 14.36 ms |
| Full wall response, p95 | 64.20 ms | 16.47 ms |
| Category-filtered wall, median | 32.42 ms | 16.00 ms |
| `app.js` transferred bytes with compression accepted | 55,637 B (uncompressed) | 15,989 B (Brotli) |
| Unchanged `app.js` with a matching validator | 200, complete body | 304, no body |

The full wall median fell approximately 69% in this fixture, and the main JavaScript transfer fell approximately 71%. These figures are local measurements, not a guarantee of production latency or a whole-page loading score. Club and uncompressed static endpoint timings stayed around the loopback/client timing floor of 15–16 ms; no HTTP improvement is claimed for those measurements. Raw observations are in [performance-results.json](performance-results.json). Fresh gallery metadata differs slightly because fresh installs now create photographic notices directly instead of first creating and upgrading the obsolete examples.

Changes:

- Poster lists include authors, comment totals and viewer-specific saves in one SQL query. Public snapshots, private drafts and saved-event identity stay separate. The regression fixture confirms one database call for 200 notices and checks saves, permissions and newly changed records.
- The database reuses at most 256 prepared statements. It never caches query results, sessions or authorisation decisions; writes and access revocations remain visible immediately.
- Public JavaScript, CSS, HTML and README representations are prepared once at startup, with Brotli/gzip variants and per-representation validators. Browser revalidation detects deployment changes. Public photos stream from disk without blocking chat on synchronous reads. Private uploads retain their existing authorisation checks and `private, no-store` responses.
- HTML account/campus restrictions run before conditional responses. JSON APIs remain `no-store`. Tests cover weak/multiple validators, compression preferences, HEAD, streamed bytes, rejected paths and a cached guest page requested by a signed-in student at another school.
- Game JavaScript and CSS load when entering Games. Messaging JavaScript loads when entering the signed-in inbox. Route guards prevent delayed imports from replacing a newer page. Initial home modules no longer import either feature.
- Club search strings, categories and interest totals are computed once for the immutable directory. The client computes search strings once per directory and counts interests in one pass.
- Shared text escaping replaces five implementations. Database setup, poster presentation and public assets have dedicated modules. Unreferenced legacy server/UI files and duplicate fresh-install sample generation were removed; legacy data import and additive migrations remain.

Run `pnpm benchmark current` to reproduce the optimized measurements. Run `pnpm check` with the local app running (or `APP_URL` set) for the course checks and complete product regressions. Focused performance/privacy checks run with `node --test scripts/performance.test.mjs scripts/frontend-performance.test.mjs`.

## Second optimisation pass: preserving appearance and interaction

A further local run on 2 October 2026 kept animation behaviour, image assets, English copy and published/private document boundaries. It removed repeated date formatter construction, unused guest account-service loading, redundant private-document reads and per-poster community queries. It also cancels obsolete wall searches and batches independent editor module/style loading.

| Isolated measurement | Pre-change reference | Current implementation |
| --- | ---: | ---: |
| Date text for 1,000 posters, median | 219.67 ms | 6.93 ms |
| Activity map with 200 notices, database calls | 401 | 2 |
| Same map handler, median | 17.30 ms | 1.10 ms |

The date fixture compares the exact previous formatting calls with shared formatters and asserts identical text. It is CPU processing, not DOM paint time. The map fixture compares the previous full-row/per-notice query path with the actual new handler and asserts identical response objects. It uses in-memory SQLite with synthetic private working documents, not production HTTP. Both fixtures warm three times and take twenty samples; p95 and provenance are in [render results](performance-render-results.json) and [community results](performance-community-results.json). Reproduce with `node scripts/benchmark-render.mjs` and `node scripts/benchmark-community.mjs`.

Guests no longer eagerly load `community.js`, `voice-calls.js` or `voice-transport.js`: 62,574 bytes of current uncompressed source are deferred until needed. Another 6,393 bytes of editor-only CSS load when entering the studio. These are dependency/source budgets, not measured compressed-transfer or browser load-time savings. Shared canvas artwork styles remain in the common poster stylesheet, so published canvases retain their appearance before an editor is opened. Studio code and required styles load together; rendering waits until the styles have loaded.

Account-service imports are shared and guarded against sign-out/account-switch races. Loaded services still clean up immediately on logout. Formatters have bounded timezone maps; dates themselves and authorisation decisions are never cached. Regression checks compare midnight/DST and invalid-date output with the original APIs. Public poster queries omit the unused private working column; saved state, comment totals, author identity, legacy snapshot fallback and private draft views remain live. Map settings are fetched for the returned notices in one bounded batch, and followed-club feeds reuse the single-query poster presenter.

Rapid filtering aborts the older read request. Leaving the wall aborts its in-flight request and clears its delayed search timer, preventing stale work from updating another page. All request feedback still settles on cancellation. Local browser review checked guest filtering, signed-in header services, the creation dialog and a three-object whiteboard showing Connected / Saved. No microphone permission was requested and no production fixture was created.

The same 1,000-notice HTTP benchmark was also repeated: full-wall median was 14.77 ms before and 16.87 ms afterwards, with the same 684,661-byte response size. This small loopback sample does not establish an HTTP speed gain; no such gain is claimed. The main script grew by 526 uncompressed bytes to support guarded loading/cancellation, while its eagerly loaded dependency set became smaller. Raw HTTP observations are in [second-pass HTTP results](performance-speed-results.json). Full TypeScript and all 20 top-level regression checks passed in 43.85 seconds; these remain distinct from nested Node test counts.

The update was deployed successfully to the existing Fly.io app as `deployment-01M3Y8XT8BCM7ERXGZAC0MNHQG`, image `sha256:c61242e8b8e1cebd5b370c83c28767e32f2335d9db4c4cf797bf8dfc5788b957`. Read-only production smoke checks passed for all eight campuses, 192 photographic test notices, ten games, 1,905 clubs, protected APIs and exports. Hash comparisons confirmed the deployed app, event helpers, session helpers, community module and both canvas stylesheets match the verified local source. Browser review confirmed the live ANU gallery and chat, English-only visible copy and five common stylesheets without editor CSS. The owned preview process and disposable local account/board database were removed. [Production gallery screenshot](../docs/screenshots/performance-production.png).
