# CampusWall development rules

The product argument is in [README.md](README.md); [docs/CLAIMS.md](docs/CLAIMS.md) maps its promises to checks and human review. Preserve these boundaries when extending the product. They are acceptance rules, not a licence to invent evidence.

## Product rules

- Guests can browse published posters without creating an account.
- A university label organises a poster; it must never imply that its creator is verified by that university.
- Draft work is private to the editing flow. A public poster only changes when its creator explicitly publishes it.
- The editor must save a completed action before it says that the draft is saved.
- Public comments require an authenticated account and are limited in length.
- Photo test notices must remain visibly labelled in the artwork, cards, details and calendar exports. Real venue sources establish existence only; stock images are illustrative. Never reset gallery dates on restart, overwrite student notices or impersonate a real organiser with the disabled sample author.
- Each account has one fixed university. Guests can browse all campuses; signed-in access, poster creation and collaboration stay on the account's university. Existing unassigned accounts must explicitly choose their university once.
- Registration with a recognised university email domain selects that university and cannot create an account at another school. Match explicit university domains and published aliases, not substrings. Apply the same rule when an unassigned account confirms its campus; never reassign an already fixed account or imply mailbox/student verification.
- Homepage chat is scoped to each university: guests may read the selected campus, while sending requires a valid session with that account's fixed university. Use the server session's author and campus identity, and display messages as plain text.
- Private user search and messaging require authentication. Search exposes display names and unique usernames, never emails. Only conversation participants may read, post, mark read or receive inbox broadcasts; recheck session validity before delivery.

- Game rooms require authenticated accounts from the same fixed university. Open waiting rooms are joinable, reserved rooms are visible only to their invited student, and started matches are private to the two players. Invitations send a DM only when the host explicitly requests it.
- The server validates game moves and sends personalised state: never expose unseen cards, opponent fleets, the artist's secret word or unrevealed choices. Persist a valid action before broadcasting, deduplicate retries, guard match/round versions and require both players to consent to rematches.

## Engineering rules

- Keep all durable application data beneath `/data` in deployment.
- Treat the server's saved draft as the source of truth after reconnecting.
- Keep each editor update small: send a whitelisted structured field, its value, and the last known version. Never overwrite the whole poster from a browser.
- Enforce creator/collaborator permissions on both HTTP and WebSocket operations. Only creators can publish, unpublish, delete or manage collaborators.
- Preserve the public `/readme/` route and the supplied HTTP checks.
- Cache only bounded prepared statements and public asset representations. Never cache session/permission query results or authenticated JSON. Check account campus restrictions before serving a conditional HTML response; private uploads remain permission checked and `private, no-store`.

## Shared work and public truth

- Whiteboard persistence uses validated object/property operations and bounded request receipts. Do not replace the whole board with a client's stale document. Undo/redo must check intervening changes; transient cursors are not durable edits.
- Save indicators require server acknowledgement. Do not claim offline edits will merge: reconnect restores accepted state and reports discarded unsent work.
- Keep source categories, source links and retrieval dates on imported club data. Directory entries do not create official club accounts or imply membership. Student club discussions remain distinct from official announcements.
- Campus broadcast prompts must stay separate from real user messages, without invented identities, timestamps or user-message records.
- Test notices remain visibly fictional and cannot accept real bookings. Map coordinates come from an organiser's deliberate saved pin; a venue name alone does not justify invented precise coordinates.
- Registration capacity, waitlist order, ticket/check-in access, group membership and team acceptance are server decisions. Recheck membership when delivering private updates; revoked members lose access immediately.
- Friend requests require acceptance. Groups, team chats and invitation-only screenings must reject non-members even if they know the URL. Search never exposes account emails.

## Media and voice

- Watch-room playback, source changes, host transfer and closure require current room authority. Viewers retain their own sound/fullscreen settings. Synchronisation must not echo programmatic commands as host actions or repeatedly seek during buffering.
- Host buffering freezes the shared clock while preserving play intent. Permission/presence revisions must not force seeks; drift correction and autoplay retries remain bounded. Share links must offer a manual-copy fallback and explain campus/invitation requirements without granting access.
- Do not download or proxy supplied video links. Provider restrictions and live delay remain explicit limitations. Grant external playback CSP only to the watch document.
- Voice calls are audio-only and limited to authenticated private-conversation participants on the same campus. Bind negotiation/control to the selected device/session; another tab must not seize an accepted call.
- Request microphone capture only after explicit call/answer interaction. Incoming ringing captures nothing. Hangup, cancellation, permission failure, logout, document exit and late permission resolution must release audio tracks.
- Do not persist or log audio, SDP, ICE, relay credentials or message bodies. Store only the intended call lifecycle metadata. Bound signalling retries and release ringing/failed calls through timeouts.
- Default STUN does not imply universal connectivity. Never claim restrictive-network support unless a TURN relay has been configured and exercised. Keep TURN credentials in deployment secrets.

## Interaction, verification and evidence

- Optional movement must respect reduced-motion preferences; rotation has pause controls. Touch input must not depend on hover/tilt. Progress and success feedback reflect actual accepted results.
- Preserve public application typography and readable phone inputs while allowing intentional poster-artwork fonts. Keyboard focus and dialog closure must remain usable after animation cleanup.
- Test changes at their consequential boundaries: distinct clients, forbidden access, stale versions, duplicate retries, logout/revocation and restart. Use disposable local databases; do not seed production users or impersonate real organisers for verification.
- Distinguish synthetic audio tests, mocked player regressions and actual browser checks. A passing signalling test is not an audio test; screenshots do not establish accessibility compliance or community adoption.
- Keep the original course invariants and evidence checker. Do not loosen tests to hide a failure. Report top-level checks separately from nested scenarios, and state the environment of performance measurements.
- All durable changes require additive, data-preserving migration. Keep private uploads permission checked; never copy local databases or credentials into the deployment image or repository.
- Process and research writing must distinguish observed facts, proposed interpretations and outstanding work. Preserve historical documents as labelled archives; rewrite the current process account rather than append a feature diary.
- Cite only real commits. Do not invent incremental history, backdate decisions, fabricate student feedback or report future crit demonstrations as completed. Personal reflections require the student to check that interpretations match their own experience; document status labels follow the student's instructions.
- Structured observability is implemented in observability.mjs. Action logs must use opaque actor identifiers, bounded action/resource classifications and outcome/time, with no secrets, raw URLs/query strings, private text, tickets or negotiation payloads. Tests must prove redaction before claiming Crit 10 readiness.

## English product copy and documentation

Use English for all application-provided UI, game names and word banks, seeded notices, calendar labels, accessible text and project documents. Preserve visible TEST disclosures. Translate historical quotations explicitly as translations rather than claiming they are verbatim English. Check screenshots as well as Markdown. User-authored messages and names retain their original text; do not remove international input support. Run the English-copy regression and `pnpm docs:check` before deployment.
