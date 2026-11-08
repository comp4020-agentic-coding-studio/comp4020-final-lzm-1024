# ADR 004 — moderation, recovery and stable links

Status: accepted implementation, documented on 8 November 2026. Email verification and off-provider backups remain absent.

## Context

The open site had no way to report or remove harmful content, no password change or recovery, and no backup beyond the hosting provider's volume snapshots. The application sends no email. Product rules say only creators publish, unpublish or delete posters, and that test notices and student posters must never be silently rewritten.

## Decision

Moderation is a separate, named authority, not a wider creator role. Deployment setting `MODERATOR_IDS` lists account ids; moderators review reports from their own campus only and see grouped reasons without reporter identities. Taking a poster down returns it to a draft marked as removed: the creator keeps it and may edit or delete it, but cannot publish it again. Comment removal deletes the comment and tells its author. Moderators can issue a one-time recovery code, valid for 24 hours, after confirming a student in person.

Recovery uses codes instead of email. A student creates a code while signed in; only its hash is stored, it works once, and using it ends every other session. Changing a password keeps the current session and ends the others. Deleting an account removes the student's posters and public contributions, anonymises the account, and leaves messages already sent in private and group conversations for their other members.

The application copies its database once a day to the volume and keeps seven copies; a restore runs once, before the database opens, and keeps the replaced file. Poster links are stable: when sample notices take the link that matches their design (migration 019), their earlier links are kept as aliases, and pages for posters that are not published answer 404.

## Alternatives and costs

Email verification and email recovery would need an outside mail provider and an account the agent could not create. Recovery codes avoid that but depend on students keeping them; the moderator path covers students who did not. Letting moderators unpublish through the creator path would blur the rule that only creators publish. Same-volume backups protect against a bad change, not against losing the volume; the provider's daily snapshots, kept five days, remain that protection, and no copy leaves the provider. Renaming links without aliases would have broken links already shared or saved.

## Acceptance evidence

[Moderation and accounts](../../scripts/moderation-accounts.integration.mjs) covers reports, campus limits, take-down, republish refusal, recovery and deletion. [Backups](../../scripts/backups.integration.mjs) runs a restore drill. [Test-round fixes](../../scripts/test-round-fixes.integration.mjs) and [unit checks](../../scripts/test-round-fixes.test.mjs) cover link aliases, migration 019 and 404 pages. The two-person round in [verification](../VERIFICATION.md) exercised these paths in a browser on a disposable database; no moderation policy or real moderator workload has been tested.
