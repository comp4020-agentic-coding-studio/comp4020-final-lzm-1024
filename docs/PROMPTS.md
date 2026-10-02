# Selected instructions and their implementation consequences

These excerpts are English translations of human requests originally written in Chinese and visible in this working conversation. They are translated quotations, not verbatim English instructions. They are selected for consequential decisions rather than claimed to be a complete transcript. Dates of individual earlier messages are not reconstructed. The student should annotate their own reason for each intervention before submission; the interpretation below is AI-assisted.

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

## Attribution boundary

The human selected these goals and corrections; the agent performed substantial implementation, test authoring, browser checks and this documentation drafting. Do not present the interpretation here as proof of the student's private thought process or an independent user study. Record disagreements, rejected approaches and actual next decisions when they occur, with real commit citations.
