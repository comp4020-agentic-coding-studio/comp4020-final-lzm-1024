# Portfolio readiness — COMP8020

Checked against the [final-project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/) and [assessment mechanics](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/) on 2 October 2026. This checklist is preparation, not confirmation that the submission has shipped.

| Component | Prepared here | Remaining human or external step |
| --- | --- | --- |
| [README](../README.md), 400–600 words | Focused product argument and sources; detailed guide separated | Student reviews position, alternatives and actual user benefit |
| [PROCESS](../PROCESS.md), 900–1100 words | Current account, trade-offs and honest record limits | Student revises personal attribution; actual readiness commits support current process claims; missing earlier history remains a limitation |
| [CLAUDE rules](../CLAUDE.md) | Expanded boundaries aligned with [claims](CLAIMS.md) | Keep rules updated when behaviour changes |
| [spec](../spec/campuswall.test.ts) | Supplied invariants retained; product regression wrappers | Keep checks green after actual next changes |
| [Crit 8](../reflections/crit-8.md), [Crit 9](../reflections/crit-9.md), [Crit 10](../reflections/crit-10.md) | Three 150–300-word reflections | Personal rewrite after the corresponding work/demo; no invented tutor feedback |
| [Research note](../research-note.md), 600–800-word argument | COMP8020 research note comparing five primary sources | Read sources, challenge the thesis and connect relevant course literature actually studied |
| [Prompt evidence](PROMPTS.md) and screenshots | Selected real user requests and labelled test captures | Add the student's own reasons and actual disputed/rejected decisions |
| Live Fly app and `/readme/` | Existing site deployed; rewritten README prepared | See [the measured viewport rehearsal](ACCEPTANCE.md); verify final deployment |
| Incremental Git history | Initial commit retained; actual baseline and subsequent verified work committed | Commit actual future work as it occurs; never reconstruct a false historical trail |
| Crit 10 observability | Redacted structured logs, projection viewer and regression tests prepared | Perform the real blind classmate demonstration using [the protocol](CRIT10-DEMO.md) |

## Student review questions

1. Does the README describe the experience you value, or just rationalise every accumulated feature? Which feature would you remove if it obscures discovery and coordination?
2. Which intervention in [the prompts](PROMPTS.md) reflects your own consequential judgement? Explain why you made it and what evidence changed your mind.
3. Have you read and understood the research sources? Can you defend the difference between benchmark capability, developer productivity and acceptance quality?
4. Do the reflections describe your experience? Replace proposed first-person interpretations and add real crit observations when they happen. The document preparation dates are not dates of completed crits.
5. Which claims are enforced, and which still require observation? Do not report a proposed study or restricted-network call test as completed.

## Before the cutoff

Run `pnpm check`, `pnpm check:evidence` and `pnpm docs:check`. Review the actual staged diff and secret exclusions. Confirm code and documents are in the real repository record, then inspect their GitHub rendering and relative images. The course's `/ship` workflow/publication and the final push are separate steps; actual commits record the current readiness work. No repository visibility change or formal course submission is performed by this task.

Check the current deadline and course instructions directly before submission rather than relying on a copied calendar date. The student confirmed COMP8020 in this conversation; the research note is therefore included. Word counts are editorial guidance, not a substitute for the quality of the argument.
