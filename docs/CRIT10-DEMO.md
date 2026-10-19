# Crit 10 — classmate feedback and instruments-only preparation

Updated on 19 October 2026. Technical preparation began on 2–3 October and now includes private file transfer. The student has now reported real classmate use and feedback: YouTube stutter and features that became known only after the developer introduced them. The student confirmed this was normal website use followed by feedback, not an instruments-only session. The participants are the student's friends, Tony and Kevin. The session took place on 14 October 2026. Local rehearsals and automated clients remain separate evidence.

## Confirmed session details

| Item | Record |
| --- | --- |
| Session date | 14 October 2026 |
| Participants | Two friends: Tony and Kevin |
| Format | Normal website use followed by feedback |
| Reported issues | YouTube stutter; some features were not discovered without an introduction |
| First-use support | I needed to explain some features before the visitors knew they were available |
| YouTube retest after the fixes | No participant result supplied yet |

## What has actually been reported

On 14 October 2026, two of my friends, Tony and Kevin, tried CampusWall and gave feedback. This was normal use of the website, rather than a session where I explained their actions from logs alone.

They reported that YouTube playback inside CampusWall could stutter. I needed to introduce some features before they knew those features were available. Because the website offers many functions, a first-time visitor does not necessarily know what to look for. The difficulty was discovering the available features, rather than simply learning a control after finding it. No task timings or success rate were recorded.

This feedback points to two areas for further checking: reliable shared playback and clear starting points that reduce the need for a personal introduction. It does not mean every feature failed or that all exploration was unhelpful. Clearer labels or a short optional introduction are possible improvements, but they have not yet been tested with Tony and Kevin.

The playback changes were checked with automated tests and deployed afterwards. No follow-up result from Tony or Kevin has been supplied, so this record does not claim that they confirmed the problem was solved. See [the feedback record](FEEDBACK.md) for the technical evidence.

The reported feedback session does not complete the instruments-only requirement. Arrange a separate session with two classmates using the procedure below, then record the narration and compare it with their actual actions.

## Prepare the instruments

Run `pnpm start` with a disposable `DATA_DIR`. In another terminal, pipe the server's stdout log through `pnpm logs:view`. For the existing deployment, use `fly logs -a comp4020-final-lzm-1024 | pnpm logs:view` after normal Fly authentication. Keep credentials and the persistent `.observability-key` outside evidence and screen recordings.

The server writes schema-1 JSON events with UTC time, process-local sequence, opaque actor, bounded action, outcome, status and duration. Resource identifiers are pseudonymised; accepted poster updates can include their revision. The HMAC key survives restarts, so the same actor remains recognisable. Sequence numbers restart with each process; use timestamps and the deployment instance when comparing runs.

HTTP API completions, rejected requests, page requests, whiteboard operations and socket connection changes are observed. Health probes and static assets are omitted. A slow collector has a bounded queue; saturation emits `logs.dropped`. This is operational telemetry, not an audit ledger or a record of every browser gesture. Client validation that sends no request is invisible.

No bodies, names, email addresses, cookies, passwords, search queries, raw paths, URLs, tickets, SDP or ICE are logged. The viewer projects only recognised fields and action names. `node --test scripts/observability.test.mjs` checks hostile input, rejection, backpressure, real HTTP/socket actions and restart identity.

## Conduct the real demonstration

1. Invite Tony and Kevin to use distinct accounts or isolated browser sessions. In this proposed session, Tony takes participant A and Kevin takes participant B. Use clearly labelled TEST content. Do not record private message text or microphone audio.
2. Hide the browser from the narrator. Keep only the live log viewer visible.
3. Participant A creates a draft, edits event fields, invites B and publishes. Narrate action classifications and accepted revisions; do not guess the title or location.
4. B changes a whiteboard object; A changes another. Match actors and resource pseudonyms. Try a forbidden publishing request with the invited editor and distinguish rejection from success.
5. B contacts the organiser and sends a private message. A replies. Optionally send a small, non-sensitive TEST file and download it from the other account. Infer accepted requests, not message content, file names or whether the recipient opened the download.
6. Refresh a client, then restart the disposable service. Observe reconnects and stable pseudonyms. Separately inspect the browser to confirm saved content survived.
7. Compare the narration with what classmates actually did. Record missed actions, ambiguity, latency and any collector drops.

## Record after the class

Record the real date, participant count without personal identifiers, task sequence, selected redacted events, narrator predictions, actual observations and one resulting change. Update [Crit 10 reflection](../reflections/crit-10.md) using that experience. This section contains instructions, not a fabricated study result.

Logs prove that the server accepted or rejected an action. Screenshots, decoded audio tests and human observation answer different questions. None alone establishes enjoyment, intelligible microphone calls, universal network connectivity or community benefit.

## How to explain the evidence this week

| Signal | What the narrator may say | What the narrator must not guess |
| --- | --- | --- |
| Accepted poster update and revision | The server accepted an edit from this actor | The exact visual result or whether the student liked it |
| Accepted or rejected private-message request | This actor submitted a message action, with this result | The message text or whether it was understood |
| messages.files.submit with status 201 | The server accepted a new file message | Its name, contents or the recipient's reaction |
| messages.files.submit with status 200 | A file request succeeded; it may be an accepted retry | That another distinct file was created |
| messages.files.read with status 200 | The server completed an authorised download response | That the person opened or read the file |
| Status 401 or 404 | The request was rejected | A private account's identity or hidden file contents |

Upload and download resource identifiers refer to different records: the conversation and the file. Do not claim the logs alone identify which uploaded file a later download concerns. Use the known task order and state this limit. A client-side button click that sends no request will not appear in server logs.

After the real demonstration, record its date and timezone, two anonymous participant labels, the tasks attempted, selected redacted events, the narrator's predictions, the actual actions and one difference that matters. The procedure and table above describe expected interpretations. The reported classmate use is real feedback; it does not by itself supply log-only narration results.
