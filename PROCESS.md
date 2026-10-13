# CampusWall — how the project was built

> Written with AI assistance and revised on 13 October 2026. This account uses the code, tests and real commits in this repository. The student should check that the reasons given here match their own decisions. A test result does not show that a classmate demonstration has happened.

## What the website is for

CampusWall helps students find an activity, contact its organiser and make a plan together. People can read public posters without signing in. They need an account to send messages or work on a private poster. The main idea is that a notice should lead to a useful conversation, rather than just another page to scroll through.

The [README](README.md) explains what good means for this project: easy participation, reliable shared work and honest feedback. Parimal Satyal's [small-web essay](https://neustadt.fr/essays/the-small-web/) helped frame the choice to build for a community rather than chase attention. However, a shared website also needs clear access rules. [CLAUDE.md](CLAUDE.md) turns these goals into rules, while [the claims table](docs/CLAIMS.md) links them to checks and remaining questions.

## Why these tools were used

The course provides one small Fly machine and a place to keep saved data. Node.js runs the server. SQLite keeps records in a database under `/data`. WebSockets keep a connection open so the server can send changes to other browsers without asking them to reload.

This setup needs fewer services to manage than a separate database server. It also has limits. Database writes happen in one place, and a busy operation can delay other work. SQLite's [guidance](https://www.sqlite.org/whentouse.html) helps explain when this approach makes sense; it does not prove how many students CampusWall can support. [ADR 001](docs/decisions/001-storage-and-deployment.md) records the choice. Database updates use fifteen migrations: steps that change the structure while keeping existing records.

## How the AI work was guided

The requests in the conversation became more specific as problems appeared. These included school colours, contact buttons, shared editing and videos that paused unexpectedly. [The prompt record](docs/PROMPTS.md) keeps selected real requests. It is not a complete record of every discussion.

The working loop was to explain the wanted behaviour, find the access rules, make a change, test it and check the deployed version. Anthropic's [guidance on agents](https://www.anthropic.com/engineering/building-effective-agents) supports keeping the workflow simple and giving it clear feedback. Here, that feedback came from tests, rejected requests and observed problems. The same AI often wrote both code and tests, so passing its tests could still miss a shared mistake.

A recent language request shows why the instructions must be clear. Changing the website language uses saved interface text. Translating a private message is different: it sends that message to an outside service. The user agreed to that service. The implementation sends only a message the reader can access, and only after they click translate. It checks access again before returning the result. A language menu should not become a hidden way to share private conversations.

Another limit appeared during interface checking. The browser tool could not reliably identify the open address, so visual inspection stopped. The later game-room changes have code and test evidence, but not a completed browser layout review. Reporting that gap is more useful than calling the interface fully checked.

## The main decision for Crit 9

The whiteboard needed a rule for two people editing together. Sending a complete board after every change would be simple, but an older copy could erase a friend's new work. The chosen approach sends small actions, such as moving one object or changing its colour. The server checks and saves each action before sharing it.

If two people change different properties, both changes can remain. If they change the same property, the server's accepted order decides the result. Undo checks whether another person has changed the value since the original action. It must not quietly remove that person's edit. [ADR 002](docs/decisions/002-shared-state.md) explains the alternatives and the cost: this version does not promise to combine work made while offline. [Two-client tests](scripts/whiteboard.integration.mjs) check shared changes, repeated requests, lost access and restarts.

## Problems that changed the rules

One problem was that a signed-in ANU user could switch to another university and post there. Hiding the school menu would not be enough. The server now checks the user's fixed university for both normal requests and live connections. [Campus tests](scripts/campus-access.integration.mjs) check attempts to get around this rule.

A friend also reported room-sharing problems and video stutter. [f8c3ead](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/f8c3eadf4054462b060177ffb98b5223f177d420) added a manual way to copy room links and changed playback timing during buffering. [The feedback record](docs/FEEDBACK.md) separates the friend's report from later tests. It does not claim that every video provider or network now works perfectly.

## A failure in this week's deployment

The language and message-translation work passed 22 local checks. However, the container used for deployment could not start. The new server file, `translation.mjs`, had not been added to Dockerfile's list of copied files. The local folder contained it, so local testing did not catch the missing package file.

[4a3da46](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/4a3da460fcb84563139bbb0146f1456c2cae72c0) fixed that list. The container checks and deployment then passed. This is a clear limit of the earlier evidence: correct code in a local folder does not prove that the deployed package contains everything it needs. The blocked release also showed why the deployment check matters. The broken version did not replace the working website.

## What the checks show

[ccb73dc](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/ccb73dc99434dd94d2e4e5fbc6b7cda3846ff04f) reduced repeated game requests and unnecessary screen updates. It also paused decorative animation outside the visible area. These changes reduce work, but no measured browser speedup is claimed. Fly's idle shutdown can still delay the first visit.

The [verification record](docs/VERIFICATION.md) separates local tests, live checks and work still needing human review. Call tests exchange generated audio and video, not recordings from personal devices. Translation tests check private-message access, logout and group removal. Real-provider checks used invented greetings. None of these tests proves that every translation is correct or that students enjoy using the website.

## What still needs a person

The Git history began with too little detail. [eeb0249](https://github.com/comp4020-agentic-coding-studio/comp4020-final-lzm-1024/commit/eeb02490ffdb53d971d68fcca798b742d12f78f6) records an existing working version; it cannot recreate earlier steps. Later commits provide a clearer record.

The blind classmate demonstration has not happened. [Its plan](docs/CRIT10-DEMO.md) and [the acceptance record](docs/ACCEPTANCE.md) prepare for it without inventing feedback. The next useful evidence is watching classmates use the site without help, especially when two people edit together or reconnect. Their difficulties should guide the next changes.
