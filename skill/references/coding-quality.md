# Coding verification contract

The parent owns the intended behavior and acceptance criteria. Evidence gathering belongs to search; implementation belongs to coding. If the existing context already specifies the change, skip a new search. The coder may read nearby code and make local implementation decisions.

After implementation, the independent verify role checks the actual changes against those criteria and reports PASS, FAIL, or INCOMPLETE. Verification can be a focused diff inspection for a mechanical change, or targeted tests/reproduction for behavior changes. Do not require new tests for every edit or rerun the same successful checks without a reason. The coder's self-check is useful evidence, not the independent verdict.

For failures, send actionable findings back to the existing coder within the configured repair limit. A repair means one coding follow-up addressing verification findings; the initial implementation is not a repair. Recheck the changed behavior or disputed finding rather than restarting the entire pipeline.

Repeated failures, exhausted repairs, architectural ambiguity, and security/data-integrity/concurrency concerns return to the parent's judgment. Use reasoning only for a specific question that benefits from independent strong-model analysis. Do not silently upgrade coding to a GPT model. If the problem cannot be resolved within the supplied boundary and model, report the blocker instead of looping.

Acceptance checks must evaluate requested behavior. Do not accept removed assertions, skipped failing tests, or revised expectations as a fix unless the requirement itself was explicitly changed. Report pre-existing failures separately without repairing unrelated code.

Return concise evidence and artifact paths. The parent integrates the findings, checks material gaps, and completes the requested outcome without mechanically redoing each child's work.
