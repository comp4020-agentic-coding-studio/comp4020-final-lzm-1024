# Portfolio readiness — COMP8020

Checked against the [final-project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/) and [assessment mechanics](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/) on 2 October 2026 and updated on 8 November 2026. This checklist is preparation, not confirmation that the submission has shipped.

| Component | Prepared here | Remaining human or external step |
| --- | --- | --- |
| [README](../README.md), 400–600 words | Focused product argument and sources; detailed guide separated | — |
| [PROCESS](../PROCESS.md), 900–1100 words | Updated on 8 November: trust features, the two-person test round, baseline evidence and implemented first-use guidance; real commits cited | Missing earlier history remains a limitation |
| [CLAUDE rules](../CLAUDE.md) | Expanded boundaries aligned with [claims](CLAIMS.md) | Keep rules updated when behaviour changes |
| [spec](../spec/campuswall.test.ts) | Supplied invariants retained; product regression wrappers; 23 checks pass | Keep checks green after actual next changes |
| [Crit 8](../reflections/crit-8.md), [Crit 9](../reflections/crit-9.md), [Crit 10](../reflections/crit-10.md) | Three 150–300-word reflections tied to their crit dates | Later November work is not added to earlier crits |
| [Research note](../research-note.md), 600–800-word argument | Five primary sources; CampusWall evidence updated with the November test round (799 words) | — |
| [Prompt evidence](PROMPTS.md) and screenshots | Nine translated requests, including a declined request, with the student's reasons as stated in the conversation | — |
| [Claims](CLAIMS.md), [verification](VERIFICATION.md), [ADR 004](decisions/004-trust-and-recovery.md) | Moderation, recovery, backups, links and translation mapped to checks; the two-person round and its gaps recorded | None beyond keeping them current |
| Live Fly app and `/readme/` | Deployed from `main`; smoke test passed on 8 November | Verify final deployment before the cutoff |
| Incremental Git history | Actual work committed as it occurred | Commit actual future work as it occurs; never reconstruct a false historical trail |
| Crit 10 observability | Technical checks and normal-use feedback recorded; student confirms a Week 11 instruments-only demonstration with Group 3 and four participants | Add genuine log excerpts and narration comparisons if recoverable; the current account records activities and language/video problems |

## Before the cutoff

Run `pnpm check`, `pnpm check:evidence` and `pnpm docs:check`. Review the actual staged diff and secret exclusions. Confirm code and documents are in the real repository record, then inspect their GitHub rendering and relative images. The course's `/ship` workflow and the final push are separate steps. No formal course submission is performed by this task.

Check the current deadline and course instructions directly before submission rather than relying on a copied calendar date. The student confirmed COMP8020; the research note is therefore included. Word counts are editorial guidance, not a substitute for the quality of the argument.
