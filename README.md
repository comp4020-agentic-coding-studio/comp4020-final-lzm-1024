# CampusWall

[Visit CampusWall](https://comp4020-final-lzm-1024.fly.dev/) · [User and technical guide](docs/USER-GUIDE.md) · [Verification](docs/VERIFICATION.md)

## A notice should lead somewhere

CampusWall is a campus noticeboard for students who want to discover an activity, find somebody to join them, and organise something together. Eight Australian universities have separate walls, club directories and conversations. Its central journey is simple: read a notice, contact its organiser, then make a shared plan. Games and screening rooms offer smaller ways to spend time together when organising an event feels like too much commitment.

Good here means that participation is approachable, shared work is dependable, and the interface tells the truth about what has happened. Those qualities matter more than the number of features. A beautiful poster that loses a friend's edits, or a lively chat populated with invented students, would fail this definition.

## Participation without manufactured popularity

Parimal Satyal's [Rediscovering the Small Web](https://neustadt.fr/essays/the-small-web/) values personal spaces where people express interests rather than compete for engagement. CampusWall adapts that position to a practical campus setting: guests can browse published notices without an account, and categories, dates and interests guide discovery. There is no engagement-ranked poster feed. A student can find a club without first building a social profile.

The limit of this analogy matters. A shared campus service needs authentication and accountable permissions that a personal homepage may not. Accounts belong to one fixed campus; recognised university email domains route registration, but do not verify mailbox ownership or student status. University logos identify a browsing context, not institutional endorsement. Imported club listings link to their sources. Photographic demonstration events carry TEST labels, and rotating campus prompts appear separately from real messages.

## Collaboration with an understandable boundary

Friends can edit an invited private whiteboard together, while only its owner publishes a snapshot to the wall. Seeing another person's pointer is useful; knowing which version is saved is essential. The server accepts validated operations, persists them, and then broadcasts the result. Reconnection restores accepted state. Undo checks for intervening edits rather than silently erasing a collaborator's contribution.

Private conversations, groups and audio calls follow explicit membership boundaries. A room link alone grants no private access. Calls request microphone access only when someone calls or answers, and ending the call stops capture. Watch-room hosts control shared playback while viewers retain local sound controls.

## Evidence and remaining judgement

The [rules](CLAUDE.md) and [checks](spec/campuswall.test.ts) enforce campus isolation, publication boundaries, retries, persistence and participant permissions. Disposable two-client tests exercise concurrency and restarts. Browser checks examine actual controls, readable typography and phone layouts. Following [W3C's guidance on interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), optional motion respects reduced-motion preferences; this is not a claim of complete accessibility compliance.

Whether students feel welcome, understand invitations, or find worthwhile company remains a human judgement. Controlled previews are not evidence of real community adoption. Further evaluation should ask students to discover an activity and collaborate without coaching, including keyboard and slow-connection use.

The current service deliberately avoids advertising, fabricated user activity and verified-university claims. Email verification, password recovery, moderation tools and end-to-end message encryption remain absent. Voice calls can fail on restricted networks without a configured TURN relay; video availability depends on its provider. These limits keep the promises proportionate to what a small, persistent course deployment actually supports.
