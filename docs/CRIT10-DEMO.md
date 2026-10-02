# Crit 10 — instruments-only demonstration

Technical preparation completed across 2–3 October 2026. The student confirmed that the real classmate demonstration has **not yet taken place**. Local rehearsals and automated clients are not classroom participants.

## Prepare the instruments

Run `pnpm start` with a disposable `DATA_DIR`. In another terminal, pipe the server's stdout log through `pnpm logs:view`. For the existing deployment, use `fly logs -a comp4020-final-lzm-1024 | pnpm logs:view` after normal Fly authentication. Keep credentials and the persistent `.observability-key` outside evidence and screen recordings.

The server writes schema-1 JSON events with UTC time, process-local sequence, opaque actor, bounded action, outcome, status and duration. Resource identifiers are pseudonymised; accepted poster updates can include their revision. The HMAC key survives restarts, so the same actor remains recognisable. Sequence numbers restart with each process; use timestamps and the deployment instance when comparing runs.

HTTP API completions, rejected requests, page requests, whiteboard operations and socket connection changes are observed. Health probes and static assets are omitted. A slow collector has a bounded queue; saturation emits `logs.dropped`. This is operational telemetry, not an audit ledger or a record of every browser gesture. Client validation that sends no request is invisible.

No bodies, names, email addresses, cookies, passwords, search queries, raw paths, URLs, tickets, SDP or ICE are logged. The viewer projects only recognised fields and action names. `node --test scripts/observability.test.mjs` checks hostile input, rejection, backpressure, real HTTP/socket actions and restart identity.

## Conduct the real demonstration

1. Ask two classmates to use distinct accounts or isolated browser sessions. Use clearly labelled TEST content. Do not record private message text or microphone audio.
2. Hide the browser from the narrator. Keep only the live log viewer visible.
3. Participant A creates a draft, edits event fields, invites B and publishes. Narrate action classifications and accepted revisions; do not guess the title or location.
4. B changes a whiteboard object; A changes another. Match actors and resource pseudonyms. Try a forbidden publishing request with the invited editor and distinguish rejection from success.
5. B contacts the organiser and sends a private message. A replies. Infer accepted message actions, not the message content or whether the recipient actually read it.
6. Refresh a client, then restart the disposable service. Observe reconnects and stable pseudonyms. Separately inspect the browser to confirm saved content survived.
7. Compare the narration with what classmates actually did. Record missed actions, ambiguity, latency and any collector drops.

## Record after the class

Record the real date, participant count without personal identifiers, task sequence, selected redacted events, narrator predictions, actual observations and one resulting change. Update [Crit 10 reflection](../reflections/crit-10.md) using that experience. This section contains instructions, not a fabricated study result.

Logs prove that the server accepted or rejected an action. Screenshots, decoded audio tests and human observation answer different questions. None alone establishes enjoyment, intelligible microphone calls, universal network connectivity or community benefit.
