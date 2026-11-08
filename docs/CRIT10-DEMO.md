# Crit 10 — classmate feedback and tutorial demonstration

Updated on 8 November 2026. Two separate sessions have now been reported: normal website use by Tony and Kevin on 14 October, and a completed instruments-only demonstration with Group 3 during the Week 11 tutorial. Four people took part in the tutorial session. Local rehearsals and automated clients remain separate evidence.

## Week 11 tutorial: Group 3

During the Week 11 tutorial, I demonstrated CampusWall with Group 3. Four people took part. We shared the website link, posters and video rooms, and tested games. The website had language and video problems during the session.

I confirmed that this was a completed instruments-only demonstration, separate from the earlier normal-use feedback. However, I have not supplied the exact date or time, the deployed commit, individual log events, or examples of what I correctly or incorrectly inferred from the logs. This record therefore establishes the reported session and activities, not the accuracy of my narration or successful completion of every task. Sharing a link does not by itself prove that another person opened it or obtained access.

| Item | Confirmed record |
| --- | --- |
| Session | Week 11 tutorial; exact date and time not supplied |
| Participants | Group 3; four people took part |
| Format | Student-confirmed completed instruments-only demonstration |
| Activities | Sharing the website link, posters and video rooms; testing games |
| Problems reported | Language and video problems; exact symptoms not supplied |
| Actor identification and narration accuracy | No specific example supplied |
| Preserved logs | Not supplied for this account |
| Follow-up verification | No participant result supplied confirming these problems were resolved |

The practical lesson is to check the visible experience as well as server activity. Language problems can make an otherwise working feature difficult to use, and an accepted video action does not prove smooth playback. Later playback and translation repairs have separate technical evidence in [verification](VERIFICATION.md); no specific fix is attributed to this tutorial without a supporting record.

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

This feedback points to two areas for further checking: reliable shared playback and clear starting points that reduce the need for a personal introduction. It does not mean every feature failed or that all exploration was unhelpful. A welcome banner and Getting started guide are now implemented, as recorded in [the November feedback update](FEEDBACK.md#implemented-first-use-responses-8-november-2026), but have not been retested with Tony and Kevin.

The playback changes were checked with automated tests and deployed afterwards. No follow-up result from Tony or Kevin has been supplied, so this record does not claim that they confirmed the problem was solved. See [the feedback record](FEEDBACK.md) for the technical evidence.

The October feedback session was not the instruments-only demonstration. The separately reported Week 11 tutorial is recorded above. The procedure below is retained for reproducing the exercise and collecting more detailed evidence.

## Prepare the instruments

Run `pnpm start` with a disposable `DATA_DIR`. In another terminal, pipe the server's stdout log through `pnpm logs:view`. For the existing deployment, use `fly logs -a comp4020-final-lzm-1024 | pnpm logs:view` after normal Fly authentication. Keep credentials and the persistent `.observability-key` outside evidence and screen recordings.

The server writes schema-1 JSON events with UTC time, process-local sequence, opaque actor, bounded action, outcome, status and duration. Resource identifiers are pseudonymised; accepted poster updates can include their revision. The HMAC key survives restarts, so the same actor remains recognisable. Sequence numbers restart with each process; use timestamps and the deployment instance when comparing runs.

HTTP API completions, rejected requests, page requests, whiteboard operations and socket connection changes are observed. Health probes and static assets are omitted. A slow collector has a bounded queue; saturation emits `logs.dropped`. This is operational telemetry, not an audit ledger or a record of every browser gesture. Client validation that sends no request is invisible.

No bodies, names, email addresses, cookies, passwords, search queries, raw paths, URLs, tickets, SDP or ICE are logged. The viewer projects only recognised fields and action names. `node --test scripts/observability.test.mjs` checks hostile input, rejection, backpressure, real HTTP/socket actions and restart identity.

## Procedure for a repeat demonstration

1. Invite Tony and Kevin to use distinct accounts or isolated browser sessions. In this proposed session, Tony takes participant A and Kevin takes participant B. Use clearly labelled TEST content. Do not record private message text or microphone audio.
2. Hide the browser from the narrator. Keep only the live log viewer visible.
3. Participant A creates a draft, edits event fields, invites B and publishes. Narrate action classifications and accepted revisions; do not guess the title or location.
4. B changes a whiteboard object; A changes another. Match actors and resource pseudonyms. Try a forbidden publishing request with the invited editor and distinguish rejection from success.
5. B contacts the organiser and sends a private message. A replies. Optionally send a small, non-sensitive TEST file and download it from the other account. Infer accepted requests, not message content, file names or whether the recipient opened the download.
6. Refresh a client, then restart the disposable service. Observe reconnects and stable pseudonyms. Separately inspect the browser to confirm saved content survived.
7. Compare the narration with what classmates actually did. Record missed actions, ambiguity, latency and any collector drops.

## Details to add if recoverable

The Week 11 session is confirmed by the student. The tables below identify details not yet supplied; they are not additional observations or a claim that the session did not happen. Use original notes or genuine recollection if available. Leave unknown details unknown. For a repeat session, record its own actual date rather than backdating it.

| Session detail | Recorded value |
| --- | --- |
| Actual date, time and timezone | Not recorded |
| Deployed commit and environment | Not recorded |
| Participant count and group | Four people; Group 3 |
| Viewport and network conditions | Not recorded |
| Instruments-only format | Confirmed by the student; individual narration examples not supplied |

| Task | Selected redacted event and actor | Narration made before revealing the browser | Actual action confirmed afterwards | Match, ambiguity or missed action |
| --- | --- | --- | --- | --- |
| Create and edit a private TEST draft | Not recorded | Not recorded | Not recorded | Not recorded |
| Invite the other participant and co-edit | Not recorded | Not recorded | Not recorded | Not recorded |
| Publish as owner; reject collaborator publication | Not recorded | Not recorded | Not recorded | Not recorded |
| Exchange private messages | Not recorded | Not recorded | Not recorded | Not recorded |
| Refresh and check saved state | Not recorded | Not recorded | Not recorded | Not recorded |

Afterwards, record one consequential discrepancy, what it reveals about the logs or interface, and the resulting change with its real commit link. If no change is justified, explain why. Record any YouTube retest separately with the source, devices, network, observed pauses or jumps and participant feedback; do not infer playback quality from an accepted command.

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

A fuller account would include the date and timezone, anonymous actor labels, selected redacted events, the narrator's predictions, actual actions and one consequential difference. The tutorial activities above are reported experience; the procedure and interpretation table are guidance, not reconstructed logs or measured narration results.
