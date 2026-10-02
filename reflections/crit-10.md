# Crit 10 — evidence is more than a green check

> Reflection prepared with AI assistance, 2 October 2026. Structured action logging and the instruments-only classroom demonstration remain outstanding. This file must be revised after that work; it does not claim the crit requirement has been completed.

## What was the breakthrough that moved the work forward?

The useful distinction is between a system accepting a command and the intended effect actually happening. Voice signalling can succeed without audio reaching another person. A video room can save a playing state while its embedded player repeatedly pauses. The current tests therefore include decoded synthetic audio in both directions and playback behaviour across repeated synchronisation ticks.

For Crit 10, the next step is to make accepted and rejected user actions observable through structured server events. Those events should identify an opaque actor, action, time and outcome without including passwords, cookies, message bodies or media negotiation data. The live demonstration will need to show what can be inferred from logs alone and what remains invisible. Existing console errors are not sufficient evidence that this requirement is met.

## What did this work change about who I want to be as a software developer?

The practice I want to strengthen is making claims that another person can inspect. Tests, logs and screenshots answer different questions; combining them requires explaining their limits. I also need better commit discipline: the current history does not preserve the implementation's incremental development. My next work should leave an actual, reviewable trail as it happens, rather than trying to reconstruct one afterwards. The final reflection should revisit this intention using the completed demonstration and real feedback.
