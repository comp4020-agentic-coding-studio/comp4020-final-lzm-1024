# CampusWall — how the project was built

> Written with AI assistance and revised on 19 October 2026. This account uses actual code, tests and commits. The student should check that the reasons given here match their own decisions. The student has reported real classmate use; whether it followed the instruments-only procedure is not yet confirmed.

## What the website is for

CampusWall helps students find an activity, contact its organiser and make a plan together. Guests can read public posters. Accounts are needed for messages and private collaboration. The goal is that a notice leads to a useful conversation, rather than another page to scroll through.

The [README](README.md) explains what good means: easy participation, reliable shared work and honest feedback. Parimal Satyal's [small-web essay](https://neustadt.fr/essays/the-small-web/) helped frame the choice to serve a community rather than chase attention. However, a shared service also needs access rules. [CLAUDE.md](CLAUDE.md) records these boundaries, and [the claims table](docs/CLAIMS.md) connects them to checks and remaining questions.

## Why these tools were used

The course provides a small Fly machine and persistent storage. Node.js runs the server. SQLite keeps records under /data. WebSockets let the server send changes to other browsers without a reload. This avoids managing a separate database service, but writes happen in one place and busy work can delay other requests.

SQLite's [guidance](https://www.sqlite.org/whentouse.html) explains when this setup makes sense; it does not prove how many students CampusWall can support. [ADR 001](docs/decisions/001-storage-and-deployment.md) records the choice. Sixteen migrations now change the database structure while preserving existing records. Large private attachments stream to disk instead of being collected in server memory.

## How the AI work was guided

Requests became more specific as problems appeared: school colours, contact buttons, shared editing and videos that paused unexpectedly. [The prompt record](docs/PROMPTS.md) keeps selected real requests. The working loop was to describe the wanted behaviour, identify access rules, make a change, test it and check deployment.

Anthropic's [guidance on agents](https://www.anthropic.com/engineering/building-effective-agents) supports simple workflows with clear feedback. Here, tests and observed failures supplied that feedback. However, the same AI often wrote code and tests, so both could share a mistake. I needed to ask what each check actually established.

Language settings made this boundary concrete. Translating interface labels stays in the browser. Translating a private message sends one authorised message to an outside service after an explicit click. The user agreed to that service. Access is checked again before its result is returned. A language preference must not silently share private conversations.

## The shared-state decision

Sending a complete whiteboard after each change would be simple, but an old copy could erase a friend's new work. The chosen approach sends small actions, such as moving an object or changing its colour. The server checks and saves each action before sharing it.

Different properties can keep both changes. For the same property, the accepted server order decides the result. Undo checks for later changes rather than silently removing a collaborator's edit. [ADR 002](docs/decisions/002-shared-state.md) explains the trade-off: this version does not promise to combine work made offline. [Two-client tests](scripts/whiteboard.integration.mjs) check concurrent actions, retries, lost access and restart recovery.

## A report that changed the diagnosis

One earlier problem allowed a signed-in ANU user to switch campuses and post elsewhere. Hiding the menu was insufficient. Server requests and live connections needed campus checks. [Campus tests](scripts/campus-access.integration.mjs) now exercise those boundaries.

The video report gave a different lesson. Lowering quality seemed a possible answer, but the later clarification was more useful: YouTube itself was smooth while CampusWall paused or jumped. This narrowed the investigation towards room synchronisation. It did not prove that every user's network was healthy.

The agent reproduced two failures. A viewer could be forced to seek immediately after buffering ended. A host's second playback action could also be lost while an earlier request awaited confirmation. [a404d35](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/a404d35) adds recovery time before automatic drift correction. [4d3396c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4d3396c) keeps the latest playback intent. Regression tests failed before these repairs and passed afterwards. This supports those specific fixes, not a promise that all videos are smooth.

The student later clarified that classmates had actually tried the site. They noticed the YouTube stutter and needed to explore because some features were unfamiliar on a first visit. [This feedback](docs/FEEDBACK.md) adds a usability question: are the starting points clear enough? It does not mean all exploration is bad. Clearer labels or a short optional introduction are possible next steps, but neither has been validated by these classmates.

## What Crit 10 adds

Crit 10 shifts attention from visible features to useful instruments. Structured logs record a stable, hidden actor identifier, action, time and result. They exclude names, passwords, message text and call details. The viewer helps distinguish accepted and rejected requests without revealing private content.

The important check is not that a log line exists. Two accounts must stay distinguishable, and a rejected request must not look successful. Sensitive details should stay absent even when someone sends hostile input. The observability tests check those conditions, including restart behaviour. This gives me something concrete to explain during the demonstration.

File transfer made this distinction useful. An upload reaching 100 percent does not mean its message was saved. [19e2dd9](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/19e2dd9) waits for server confirmation, checks access again after upload and prevents duplicate messages on retry. Tests cover an unrelated account, logout during upload, storage limits and restart recovery. A successful download request still cannot prove that its recipient opened or understood the file.

## A failure that changed verification

Earlier translation work passed local tests but its deployment container could not start. Dockerfile omitted the new translation module, which existed in the local folder. [4a3da46](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4a3da46) fixed the copied files. Deployment had been blocked, preserving the working site. Local correctness did not establish packaging correctness.

The latest full local run passed 22 top-level checks. File-transfer CI and deployment also passed, and live assets matched the tested files. [Verification](docs/VERIFICATION.md) separates these results from browser checks and human evidence. Earlier blocked browser reviews remain gaps; later appearance and attachment previews do not establish complete game or accessibility coverage.

## What still needs a person

The initial history recorded too much work at once. Later real commits improve the record but cannot recreate missing earlier steps. Personal devices, restrictive call networks and students' understanding still need direct observation.

The reported classmate feedback is now recorded, but the exact session date, participant count and instruments-only procedure are not confirmed. The [demonstration record](docs/CRIT10-DEMO.md) separates those facts. I still need to compare any explanation from logs with actual actions. Automated clients cannot replace this evidence, and classmates have not yet confirmed that the later playback repairs solved their problem.
