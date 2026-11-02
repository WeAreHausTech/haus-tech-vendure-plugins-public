<!-- HAUS:BEGIN haus-agents v=1 -->

@.haus-workflow/WORKFLOW.md
@.haus-workflow/workflow-config.md
@docs/decisions/README.md

- adr-decisions: not for trivial edits with no architectural consequence.
- issue-authoring: not for work already approved and planned, that belongs in the plan.
- writing-documentation: not for code changes with no documentation impact, or where facts would have to be invented. The glossary and the writing style guide are other skills' jobs.
- whats-installed: not for installing, removing or updating items, that is the haus CLI's job, not a conversation.
- haus-workflow: use for haus tasks (init, clone, new, doctor, refresh, uninstall, help); not for code changes in the project itself.
- package-manager-yarn4-pnpm89: not for feature-only code edits with no dependency or workspace impact.
- issue-creator: not for repos without GitHub issues enabled, or where issue hygiene is managed elsewhere.

<!-- HAUS:END haus-agents -->
