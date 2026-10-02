# Readiness acceptance — 2–3 October 2026

This is an agent-operated technical rehearsal with disposable local TEST accounts, not a classmate study. No production users, messages or events were seeded.

## Environment and scope

Two authenticated sessions used different cookie hosts against one local database: Review Owner on `localhost:18116`, Review Friend on `127.0.0.1:18117`. The second host is a loopback-only proxy in [slow-preview.mjs](../scripts/slow-preview.mjs): 300 ms delay in each socket direction and HTTP responses delayed 300 ms then limited to 64 KiB/s per response. Parallel requests can exceed that aggregate bandwidth. This is a reproducible constrained fixture, not a measurement of campus Wi-Fi or production latency.

The Friend session was explicitly measured at 1920×1080 and 390×844. The independent Owner helper remained at 1280×720. At both marking sizes the document's scroll width equalled its client width (1905 desktop and 375 mobile, excluding the 15-pixel vertical scrollbar). These observations establish no horizontal overflow in the exercised views, not complete accessibility compliance.

## Observed results

| Journey | Result and evidence |
| --- | --- |
| Desktop organiser contact and private reply | Search narrowed the wall to the TEST notice; Enter activated Message organiser. Enter sent the message; the independent owner replied and the friend received it without refreshing. [Inbox](screenshots/readiness-desktop-inbox.png). |
| Desktop shared editing | Owner added three planning notes. Friend received all three, selected a note with Enter, edited its text and moved it with ArrowRight. The owner received the changes. Focus remained on the SVG object after redraw. [Board](screenshots/readiness-desktop-board.png). |
| Mobile shared editing through delayed sockets | Friend changed the same note; the owner received it live. Reload restored the saved text. [Board](screenshots/readiness-mobile-board.png). |
| Mobile creation and publishing | Friend created a private TEST design, filled date/time/location/description and published. The detail view displayed the accepted title and fields; reload preserved it. [Published notice](screenshots/readiness-mobile-published.png). |
| Desktop republishing | The same owner opened the studio at 1920×1080, changed the subtitle and republished. The new subtitle remained visible after publication and refresh. [Published notice](screenshots/readiness-desktop-published.png). |
| Mobile private messages | Enter submitted a message after the connected indicator appeared. Refresh restored the conversation and message. [Inbox](screenshots/readiness-mobile-inbox.png). |
| Dialog keyboard handling | Enter opened creation; Escape closed it and restored focus to Create poster. Automated regression also protects SVG selection and native button Space handling. |
| Service restart | The owned local service was stopped and restarted against the same database. Existing accounts, shared notes and conversation remained available. The open helper reconnected and received later edits. Automated tests additionally check persistent pseudonyms, permission rejection and socket state restoration. |

The rehearsal exposed a genuine keyboard failure: focusable SVG objects ignored Enter. The repair adds selection, preserves focus through redraws and confines Space-to-pan to the canvas surface. [Regression](../scripts/whiteboard-keyboard.test.mjs) checks these boundaries. This failure and repair were observed now; they are not retrospective claims about earlier development.

Locators focus controls directly, then use Enter, Tab, Escape and arrows. This is keyboard activation/shortcut testing, **not** proof of a complete sequential keyboard-only journey from browser entry to every feature. Early interaction during asynchronous loading required waiting for the connected state before sending. Accepted UI feedback and server outcomes were checked after those waits.

## Repeat locally

Use a disposable data folder, start `server.mjs` with `PORT=18116`, then `node scripts/slow-preview.mjs`. Open the two hosts, register synthetic same-campus users and keep their sessions separate. Repeat publication, organiser messaging, invitation and shared edits at each marking viewport, wait for Saved, reload and restart. Run `pnpm check`, `pnpm docs:check` and `pnpm check:evidence`. Keep the fixture database, cookies and log key out of Git.

Remaining human evidence: the actual instruments-only classmate demonstration, uncoached usability observations, exhaustive keyboard/screen-reader evaluation and real microphone calls across restrictive networks. [Demo instructions](CRIT10-DEMO.md) specify what to record. These have not been reported as completed.

Selected [redacted local events](readiness-action-events.ndjson) preserve actual rehearsal timestamps, accepted operations and revisions. They exclude the fixture database and log key. Run `Get-Content docs/readiness-action-events.ndjson | pnpm logs:view` in PowerShell to rehearse narration from this recorded trace; use live logs during the real demonstration.
