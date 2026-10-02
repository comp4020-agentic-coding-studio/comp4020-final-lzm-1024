# Verification should govern autonomy in agentic development

> COMP8020 research note, prepared with AI assistance on 2 October 2026. The student must read the cited sources, evaluate this position and revise it into their own argument. This is not a claim about literature already studied in class. Main argument below; references follow separately.

## Position

Good agentic development should be evaluated by the reliability of its feedback and acceptance process, rather than the amount of code generated or the apparent independence of the agent. My proposed principle is that autonomy should expand only where consequences are observable and acceptance criteria are defensible. This does not make automated tests sufficient. I distinguish operation-level correctness, sustained user outcomes and social usefulness: each requires different acceptance evidence.

## Capability is conditional on the evaluation setting

Jimenez et al.'s SWE-bench replaces isolated code-generation exercises with repository issues and execution-based evaluation [1]. Its original collection contains 2,294 tasks from twelve Python repositories. The construction requires tests that fail before a reference repair and pass afterwards, alongside preservation of existing behaviour. This is a stronger acceptance signal than plausible output. However, my inference is that resolving such tasks cannot establish every dimension of software quality: an issue's tests do not necessarily measure accessibility, operational safety or whether a feature should exist. Historical benchmark results also cannot describe today's model frontier without fresh evaluation.

Yang et al.'s SWE-agent makes a complementary argument: the interface through which an agent searches, edits and receives execution feedback affects its performance [2]. The agent is not simply a model dropped into a neutral environment. That suggests harness design is substantive engineering work. Yet stronger benchmark performance does not settle the cost of human review or long-term maintenance. Together, these papers support better feedback infrastructure, while leaving open which outcomes an organisation should optimise.

## Real work complicates a simple productivity story

Becker et al. randomised AI access across 246 tasks undertaken by sixteen experienced contributors in repositories they knew well [3]. Early-2025 tools increased completion time by 19%, although participants believed they had become faster. This supports measuring accepted work rather than perceived acceleration. It does not establish that AI always slows development: the participants, tools, familiar repositories and quality expectations bound the result. It also evaluates human-assisted development, not unrestricted autonomous agents, so the comparison with SWE-agent is informative rather than directly causal.

METR's February 2026 update further complicates extrapolation [4]. Developers and tasks were increasingly selected out of its later experiment, and overlapping agent work made time attribution harder. METR therefore regards the later estimates as weak evidence about the size of productivity improvements. The methodological lesson is stronger than either a universal optimism or pessimism: evaluation must evolve with the workflow it measures. A benchmark success rate, a controlled time measurement and self-reported convenience answer different questions.

## A bounded alternative, and its counterargument

Anthropic recommends simple, composable systems, environmental feedback and added complexity only when it improves outcomes [5]. This practitioner account aligns with SWE-agent's attention to interfaces, but it is vendor experience rather than an independent experiment. I take it as a useful design proposal to test, not proof that one workflow is best.

The strongest counterargument is that extensive verification can erase the benefit of delegation. Requiring approval for every reversible edit introduces interruptions, and exhaustive tests for exploratory prototypes can lock in assumptions before users have helped shape them. My position therefore calls for proportional verification: automate inexpensive, stable checks; reserve human attention for consequential boundaries and ambiguous values. Fast experiments remain appropriate when their results are disposable and clearly presented as experiments.

In a collaborative application, this would mean executable checks for membership, concurrent edits, duplicate retries and restart persistence, alongside direct observation of whether people understand invitations and saved state. When code and tests come from the same agent, independent clients, adversarial requests and browser use provide different evidence, although none eliminates correlated errors. A regression should become a reusable acceptance condition instead of merely prompting another generation attempt.

CampusWall makes this distinction concrete. A watch room could accept a playback command while its synchronisation loop subsequently paused the video. Successful command handling therefore did not establish successful shared viewing. The [playback regressions](scripts/watch-player.test.mjs) check behaviour across repeated synchronisation updates. I argue that autonomy should depend on evidence at the level of the intended user outcome. This also exposes a limit of my principle: technically observable behaviour is easier to verify than social usefulness. Automated checks can establish that playback continues, but deciding whether students find shared viewing worthwhile still requires human evaluation.

The field should consequently report more than task completion: review time, escaped regressions, recovery after rejection, and maintenance of prior invariants matter. These are proposed evaluation priorities, not findings established by the cited studies. Better models may increase capability; defensible acceptance processes determine where that capability can be trusted. Human responsibility moves toward specifying the right consequences and deciding when the evidence is enough, while remaining accountable for the decision to ship.

## References

1. Jimenez, C. E., Yang, J., Wettig, A., Yao, S., Pei, K., Press, O. and Narasimhan, K. (2024). [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) ICLR 2024; first posted 2023. Discussion draws on benchmark construction and execution-based evaluation, sections 2.1–2.2.
2. Yang, J., Jimenez, C. E., Wettig, A., Lieret, K., Yao, S., Narasimhan, K. and Press, O. (2024). [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793). Research paper; interface design and evaluation. The original results are not presented as current rankings.
3. Becker, J., Rush, N., Barnes, B. and Rein, D. (2025). [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf). METR research report, abstract and sections 1–2. Randomised task-level field experiment; narrow setting and tool period.
4. METR (2026). [We are Changing our Developer Productivity Experiment Design](https://metr.org/blog/2026-02-24-uplift-update/), 24 February. Primary methodological update; selection and measurement limitations, not a definitive new productivity estimate.
5. Anthropic (2024). [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents), 19 December. Practitioner guidance by Erik S. and Barry Zhang; sections on agents, combining patterns and coding agents. Vendor experience rather than a controlled comparison.

All links checked on 2 October 2026. Scholarly papers, a field experiment and practitioner guidance are used for distinct claims; their results are not treated as directly comparable measurements of a single notion of productivity.
