# Selected instructions and their implementation consequences

These excerpts are English translations of requests originally written in Chinese. They are translated quotations, not verbatim English instructions, selected for consequential decisions rather than claimed to be a complete transcript.

## 1. Campus scope must survive login

> After I sign in, I should not be able to switch to another university's content. My account is ANU, but I can still switch to the University of Sydney and post messages.

The request identifies a permission failure, not just a navigation preference. The later answer explicitly chose per-campus public chat. The resulting boundary is fixed account affiliation across pages, HTTP and sockets. [Campus checks](../scripts/campus-access.integration.mjs) exercise bypasses and migration. [CLAUDE.md](../CLAUDE.md) now states this as an invariant.

## 2. The shared editor must support actual collaboration

> Build a collaborative whiteboard like Canva.

The reference motivates a shared object canvas rather than only structured poster fields. The important acceptance condition is independent operations surviving together with protected undo and access revocation. [Whiteboard tests](../scripts/whiteboard.integration.mjs) inspect those outcomes. A visual resemblance to Canva is not claimed to establish equivalent capability.

## 3. Attractive samples must remain honestly fictional

> Create at least twenty polished posters with photographs rather than these templates. You can research visual references online. Use real locations, but clearly label the posters as tests.

The final requirement changes the acceptance boundary: photographs illustrate fictional notices, real venue references do not establish bookings, and TEST labels must survive exports. [Photo checks](../scripts/photo-gallery.test.mjs), [sources](../data/PHOTO-POSTER-SOURCES.md) and the no-bookings rule enforce that distinction. No adopted stock image is represented as a photograph of the named campus location.

## 4. Playback needs to work beyond initial load

> Why does playback pause after it has been running for a while?

The report directs attention from the saved room record to actual embedded player behaviour. The repair links host events to room state while suppressing synchronisation echoes and avoiding repeated buffering correction. [Player tests](../scripts/watch-player.test.mjs) cover repeated ticks and delayed acknowledgements. This excerpt is a bug report, not a transcript of an unrecorded debugging dialogue.

## 5. A call is a media feature, not just a button

> Add voice calls to private messages, and improve the awkward typography so the interface looks good.

The implementation joins private signalling, explicit microphone interaction, cleanup and actual synthetic duplex audio verification. Browser previews checked typography, incoming controls and the phone layout. [Voice tests](../scripts/voice-calls.integration.mjs) and [audio fixture](../scripts/voice-audio.e2e.mjs) distinguish authentication from transport. The TURN limitation remains explicit.

## 6. An honest list of problems, then fixes

> Tell me truthfully, without deceiving me, what problems this website still has.

The answer listed verified problems, including work deployed but not committed. The follow-up request to fix everything except deleting the student's own test posters led to reporting and moderation, account recovery, backups and clearer empty states (commits `c86341e` and `b5755cf`). Granting moderator rights was left to the student, who confirmed their own account (`ff97dd9`).

## 7. A declined request: film characters

> I want some Robot Dreams elements in it, meaning animation effects.

> It is for my own internal use and will not be public. Please give me the film's characters; I really like them.

This is a disputed decision. The agent checked that the site opens without signing in and that the repository is public, so it declined to draw the film's dog and robot and offered original characters instead. The student chose an original puppy friend. The result is an original robot (`e7313ed`) and puppy (`1afe16b`), later shown in every page header (`5ce0048`).

## 8. Testing as two real users

> Test my website now, very thoroughly: test with two people, play games with each other, message each other, and test every part of my website.

Signing in on the production site was outside the agent's permitted actions, so the round used a local copy with the production build and a disposable database, plus guest-only production checks. It found nine problems, fixed in `4dd2184`; its coverage and gaps are in [verification](VERIFICATION.md). A later request to fix the wider translation gap became `2a55b14` and a coverage test.

## 9. Copy must match the deployment

> There is only one university now, so step 1 is wrong as written.

The guide named a choice that no longer existed. The quick start now names the single open campus, and returns to the general wording if more campuses open (`ef546c6`).

## The student's stated reasons

These reasons come from the student's own messages in the working conversation of 6–8 November 2026, translated from Chinese; the student said their thinking for these decisions is recorded there. They are restated, not extended.

- Entry 6: the student asked for an answer "that is true and does not deceive me", wanting verified problems rather than reassurance, and kept deleting their own test posters for themselves.
- Entry 7: the student said they like the film and first described the site as internal and not public; after being shown that the site and repository are public, they chose the original puppy rather than pursuing the film's characters.
- Entry 8: the student wanted the site tested as real use, specifically two people playing games and messaging each other, and every part of the site checked; they then asked for all nine findings to be fixed, and later for the wider translation gap to be closed.
- Entry 9: the student noticed from the page itself that the copy described a choice that no longer existed.

## Attribution boundary

The human selected these goals and corrections; the agent performed substantial implementation, test authoring, browser checks and this documentation drafting. Do not present the interpretation here as proof of the student's private thought process or an independent user study. Record disagreements, rejected approaches and actual next decisions when they occur, with real commit citations.
