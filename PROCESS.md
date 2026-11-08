# CampusWall — how the project was built

## What the website is for

CampusWall helps students find an activity, contact its organiser and make a plan together. The current public service opens ANU only; other-campus code and data are retained but unavailable. Guests can read public posters. Accounts are needed for messages and private collaboration. The goal is that a notice leads to a useful conversation, rather than another page to scroll through.

The [README](README.md) explains what good means: easy participation, reliable shared work and honest feedback. Parimal Satyal's [small-web essay](https://neustadt.fr/essays/the-small-web/) helped frame the choice to serve a community rather than chase attention. However, a shared service also needs access rules. [CLAUDE.md](CLAUDE.md) records these boundaries, and [the claims table](docs/CLAIMS.md) connects them to checks and remaining questions.

## Why these tools were used

The course provides a small Fly machine and persistent storage. Node.js runs the server. SQLite keeps records under /data. WebSockets let the server send changes to other browsers without a reload. This avoids a separate database service, but writes happen in one place and busy work can delay other requests.

SQLite's [guidance](https://www.sqlite.org/whentouse.html) explains when this setup makes sense; it does not prove how many students CampusWall can support. [ADR 001](docs/decisions/001-storage-and-deployment.md) records the choice. Nineteen migrations now change the database structure while preserving existing records.

## How the AI work was guided

Requests became more specific as problems appeared: school colours, contact buttons, shared editing and videos that paused unexpectedly. [The prompt record](docs/PROMPTS.md) keeps selected real requests. The working loop was to describe the wanted behaviour, identify access rules, make a change, test it and check deployment.

Anthropic's [guidance on agents](https://www.anthropic.com/engineering/building-effective-agents) supports simple workflows with clear feedback. Here, tests and observed failures supplied that feedback. However, the same AI often wrote code and tests, so both could share a mistake. I needed to ask what each check actually established.

Language settings made this boundary concrete. Interface labels are translated in the browser. Translating a private message sends one authorised message to an outside service after an explicit click, and access is checked again before the result returns. A language preference must not silently share private conversations.

## The shared-state decision

Sending a complete whiteboard after each change would be simple, but an old copy could erase a friend's new work. The chosen approach sends small actions, such as moving an object or changing its colour. The server checks and saves each action before sharing it.

Different properties keep both changes. For the same property, the accepted server order decides the result. Undo checks for later changes rather than silently removing a collaborator's edit. [ADR 002](docs/decisions/002-shared-state.md) explains the trade-off: this version does not promise to combine work made offline. [Two-client tests](scripts/whiteboard.integration.mjs) check concurrent actions, retries, lost access and restart recovery. [eeb0249](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/eeb0249) records the canvas model and these tests as a baseline, not a separate history of each design step.

## Reports that changed the diagnosis

One earlier problem allowed a signed-in ANU user to switch campuses and post elsewhere. Hiding the menu was insufficient; server requests and live connections needed campus checks, which [campus tests](scripts/campus-access.integration.mjs) now exercise. Those checks are also recorded in [eeb0249](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/eeb0249); it establishes the saved implementation, not when each earlier repair occurred.

The video report gave a different lesson. YouTube itself was smooth while CampusWall paused or jumped, which narrowed the investigation towards room synchronisation. [a404d35](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/a404d35) adds recovery time before automatic drift correction and [4d3396c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4d3396c) keeps the latest playback intent. Regression tests failed before these repairs and passed afterwards. This supports those fixes, not a promise that all videos are smooth.

Two friends, Tony and Kevin, tried the site on 14 October 2026. They noticed the stutter, and I had to introduce some features before they knew those features existed. [This feedback](docs/FEEDBACK.md) raised a clearer question: can a first-time visitor discover features without the developer? A large feature set needs clear starting points, not just working controls.

The later interface adds a welcome banner and a Getting started guide. [7e4769e](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/7e4769e) makes its returning-visitor entry a real button and explains connection loss; [ef546c6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/ef546c6) names ANU in the quick start, matching the deployment. These are implemented responses, not evidence that Tony and Kevin can now find everything without help; they have not retested them.

## Instruments for Crit 10

Structured logs record a hidden actor identifier, action, time and result, excluding names, passwords, message text and call details. The important check is not that a log line exists: two accounts must stay distinguishable, a rejected request must not look successful, and sensitive details must stay absent under hostile input. File transfer showed why. An upload reaching 100 percent does not mean its message was saved; [19e2dd9](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/19e2dd9) waits for server confirmation and rechecks access.

## A failure that changed verification

Earlier translation work passed local tests but its container could not start, because the Dockerfile omitted the new module. [4a3da46](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4a3da46) fixed the copied files; a test now compares the Dockerfile with the server's modules. Local correctness did not establish packaging correctness.

## Trust, a declined request and two-person testing

In November I asked for an honest list of problems. The answer showed that the site had no way to report harmful content, recover an account or restore a backup. [b5755cf](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/b5755cf) added these. Moderation became a separate, named authority rather than a wider creator role, and recovery uses codes because the site sends no email. [ADR 004](docs/decisions/004-trust-and-recovery.md) records the costs: no email verification and backups on the same volume.

I then asked for the Robot Dreams characters. The agent declined because the site and repository are public, and offered original characters; I chose an original robot and puppy. This is recorded as a disputed decision in the prompt record.

Finally, I asked for thorough testing with two people. Because production accounts were off limits, two browser sessions used a local copy with a disposable database. Real-time messages, three games, co-editing, moderation and account recovery worked, but the round found nine problems that existing tests had missed, including raw game identifiers, wrong plurals and untranslated text. [4dd2184](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4dd2184) fixed them. A wider scan then found about 670 untranslated strings, fixed in [2a55b14](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/2a55b14) with a coverage test. Passing checks had measured whether features worked, not whether a student could read them.

## What still needs a person

The initial history recorded too much work at once; later commits cannot recreate missing steps. Personal devices, restrictive call networks, translation quality and students' understanding still need direct observation. In the Week 11 tutorial, four people took part with Group 3 in an instruments-only demonstration: sharing the website link, posters and video rooms, and testing games. Language and video problems appeared. The [demonstration record](docs/CRIT10-DEMO.md) separates this from Tony and Kevin's earlier use. Individual log events and narration comparisons have not been supplied, and classmates have not confirmed the later repairs.
