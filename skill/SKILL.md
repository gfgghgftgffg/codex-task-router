---
name: task-routing
description: Route delegated work by model when the task-routing profile is active or explicitly requested.
---

# Task Routing

Use this policy as the coordinating parent. A child with an assigned role follows its bounded assignment and does not start another routing workflow. User instructions and host permissions take precedence; this skill does not authorize additional external actions.

Read [the generated role map](references/role-map.md) once when delegating. It supplies default models, reasoning efforts, role names, and repair limits. An explicit user model or effort instruction overrides the corresponding default only for the specified task or role; preserve other defaults and do not rewrite persistent configuration. Selecting the parent model alone does not override child settings. Read only the selected role's contract when explicit role instructions are needed.

## Choose the work unit

- Keep goal interpretation, overall direction, and consequential decisions in the parent.
- Delegate discovery, repeated reading, source research, and log investigation to `search`. Give it questions and constraints, not a query-by-query itinerary. Its summary is a navigation aid: the parent reads the complete relevant source material before adopting consequential conclusions or directing dependent work. Follow [the research evidence contract](references/research-evidence.md) when using research results; send focused follow-ups to the same child for gaps.
- Delegate code changes, including small fixes and test implementation, to `coding`. Batch nearby mechanical edits. Supply sufficient evidence and acceptance criteria; do not make the parent write a complete implementation first.
- Every completed coding work unit receives an independent `verify` verdict, including small edits. A mechanical change may need only a brief diff check; the parent's own check does not replace this verdict. The verifier may run tests but sends source changes back through the parent to `coding`.
- Use `general` for substantial non-code deliverables and analysis of supplied material. If custom HTML or another coded presentation is required, settle its factual content here before assigning rendering code to `coding`; using an existing renderer does not itself require a coder.
- Use `reasoning` only when a bounded difficult question or independent high-risk review warrants another strong-model context. The parent may decide directly when it already has the relevant evidence.
- Answer tiny non-code questions and perform known-path reads directly when delegation would cost more than it saves. Do not trigger research merely because a file must be read.

Role, difficulty, risk, and context volume are different properties. A small authentication change still deserves risk-aware verification. A large batch of well-specified mechanical edits can stay with the configured coding model. Only create the roles this task needs.

Security, data-integrity, and concurrency risks require the parent's attention, not an automatic extra reasoning agent. Escalate independently when a specific unresolved question or the need for a second judgment justifies it.

## Dispatch and continue

Check the exposed spawn schema. Prefer its explicit named-role selector, applying supported model/effort overrides when the user requested them. Otherwise pass the effective model and effort with the role contract, only if the host supports that model and preserves the required provider and permissions. If the requested combination is unsupported, report that limitation rather than silently using the role default. Disable full-history inheritance with the supported parameter and pass a minimal brief. Do not invent tool parameters or claim a prompt changed the parent session's model.

A brief states the outcome, relevant evidence, scope/ownership, constraints, and acceptance criteria. Use parallel children for independent work; use one writer per file. Reuse a child for related follow-ups, but give implementation verification a separate context. Waiting is necessary only when the next step depends on a result; continue independent work meanwhile.

For code changes, use [the coding verification contract](references/coding-quality.md). For research-only and non-code tasks, do not load that contract or force a coding/testing/review pipeline.

If a role is unavailable, report which route failed and why. Continue independent authorized work, but do not claim the blocked part completed or substitute a model without the user's direction. Do not relax sandbox or approval settings to get a route working.

Finish when the requested deliverable and relevant acceptance checks are complete, or state the concrete unresolved blocker. Do not stop at the first implementation, insert routine approval checkpoints, or add unrelated audits, full-suite reruns, and speculative improvements.
