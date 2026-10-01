# Parallel work

Actively run independent work at the same time through the host's native spawn capability: separate searches for separate questions, separate non-code deliverables, and separate development units. Several children of the same role are fine.

Check the exposed spawn schema on each dispatch. Use the named-role selector and any isolation entry it actually provides; when it supports a no-history option such as `fork_context=false`, use that and pass a minimal brief. Do not invent parameters or assume a capability the schema does not show.

Codex app worktrees (https://developers.openai.com/codex/app/worktrees) are separate chats on a Git repository, start on a detached HEAD by default, and return through Handoff into Local. Use the isolation the host actually exposes, or existing `git worktree` commands directly, when they fit the work; do not build a scheduler, worktree manager, task queue, or task-file format.

Write rules follow the checkout:

- One shared checkout: one writer per file or overlapping write scope at a time. A unit that reads content another unit is still writing depends on that unit; read-only status alone is not independence.
- Separate worktrees: each writer works on its own copy in parallel, and the parent integrates the results.

The parent owns the split, dependency order, integration, and verification. Read a dependency's result before dispatching its successors. Each code unit receives its own independent verify verdict, which may run in parallel inside its worktree; after integration the parent checks the affected behavior instead of rerunning every check. Keep the total concurrent children within the configured session-wide maximum (30 in this profile), do not fill it, and close finished children promptly.
