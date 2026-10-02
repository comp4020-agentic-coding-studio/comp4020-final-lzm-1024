# From product argument to acceptance evidence

This map distinguishes an enforceable boundary from a claim that needs human judgement. The README argument, CLAUDE rules and existing tests should agree. Linked tests demonstrate specified scenarios, not proof of every possible state or network.

| Product claim | Required rule | Existing automated evidence | Human judgement still needed |
| --- | --- | --- | --- |
| People can discover before joining | Guests read published snapshots; private drafts stay private | [Core product](../scripts/campuswall.integration.mjs), [campus access](../scripts/campus-access.integration.mjs) | Can an unfamiliar visitor find a relevant event without coaching? |
| School context is honest and consistent | One fixed account campus; exact email routing; no student-verification claim | [Email routing](../scripts/email-campus.integration.mjs), [campus access](../scripts/campus-access.integration.mjs) | Do users understand school selection versus verified affiliation? |
| Demonstrations do not impersonate real activity | TEST artwork/cards/exports; no actual bookings; separate broadcast prompts | [Photo gallery](../scripts/photo-gallery.test.mjs), [community](../scripts/community.integration.mjs); rotation also checked in prior browser preview | Are TEST labels legible before someone saves an event? |
| Collaboration does not silently replace a friend's work | Validated operations, acknowledgement, protected undo, private/public separation | [Designer](../scripts/designer.integration.mjs), [whiteboard](../scripts/whiteboard.integration.mjs) | Do two people understand a stale edit or disconnect warning? |
| Private communication has an explicit audience | Fresh participant/session checks on HTTP and live delivery; no emails in search | [Inbox](../scripts/messaging.integration.mjs), [profiles](../scripts/profile.integration.mjs), [community](../scripts/community.integration.mjs) | Are invitations, acceptance and removal comprehensible? |
| A game is shared without exposing secrets | Authoritative moves and personalised state; restart/retry rules | [Game rules](../scripts/games-rules.test.mjs), [room integration](../scripts/games.integration.mjs) | Does the game feel responsive and explain turns clearly? |
| Shared playback preserves host authority | Embedded controls publish; sync echoes suppressed; viewers cannot take over | [Watch integration](../scripts/watch.integration.mjs), [player regressions](../scripts/watch-player.test.mjs) | How do real providers behave on slow devices or live streams? |
| A call stops capturing when ended | Explicit microphone gesture, device-bound call, audio-only negotiation, track cleanup | [Call integration](../scripts/voice-calls.integration.mjs), [transport](../scripts/voice-transport.test.mjs), [UI](../scripts/voice-ui.test.mjs), [synthetic audio](../scripts/voice-audio.e2e.mjs) | Real microphone usability and restricted-network connectivity; TURN absent |
| Motion supports feedback without forcing it | Reduced motion, pause controls, bounded cleanup, no premature success | [Motion lifecycle](../scripts/motion.test.mjs); phone screenshots | Keyboard path, motion sensitivity and comprehensive accessibility audit |
| Persistence and optimisation preserve access rules | Additive migration, volume storage, bounded statements, private no-store | Restart scenarios across integration tests; [cache/performance](../scripts/performance.test.mjs) | Recovery from volume failure and capacity under production load |

## Claims deliberately not made

No claim is made of verified student identity, official university/club endorsement, universal WebRTC connectivity, frame-exact live synchronisation, complete WCAG compliance, end-to-end encrypted messages or a measured improvement in student belonging. Structured per-action observability for Crit 10 is still a future task.

## A reproducible human review

Use disposable local accounts on the same campus and two independent browser sessions. Ask a person to find a notice, contact its organiser, accept a whiteboard invitation and change an object without instruction. Repeat at 1920×1080 and 390×844, using the keyboard, reduced motion and a slowed connection. Introduce simultaneous edits, remove access and reconnect. Record the task, environment, observed confusion and resulting change; do not invent a success rate without participants and observations. See [verification](VERIFICATION.md) and [submission readiness](SUBMISSION.md).
