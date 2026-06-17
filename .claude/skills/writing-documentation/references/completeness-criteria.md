# Completeness criteria

Use with `validation-checklist.md` before finishing a docs update. Every item must be **answered in docs**, marked **N/A**, or **`> CONFIRM-WITH-TEAM: confirm with team.`** — never guessed.

## App mode

1. **Install and run** — prerequisites, install command, how to start locally, how to verify success.
2. **Runtime** — processes/services (API, worker, CLI, etc.) and how they interact, or N/A for single-process apps.
3. **Wiring** — path(s) to bootstrap entry points and central configuration.
4. **Change routing** — where typical changes go (table or bullets): feature logic, config, schema, tests, CI.
5. **Pre-PR checks** — commands for test/lint/build and repo-specific steps (migrations, codegen, etc.).
6. **Deploy** — how releases run, ordered steps, post-deploy checks, rollback — or explicit CONFIRM-WITH-TEAM.
7. **Environment** — key vars from `.env.example` with purpose and consumer (subsystem or config path).
8. **Regeneration** — migrations, codegen, or other generated artifacts: commands and “do not hand-edit” paths, or N/A.
9. **Agent guardrails** — generated/vendor/secret paths agents must not edit; docs are an index, not a code copy.
10. **Unknowns** — gaps use team CONFIRM-WITH-TEAM, not invented URLs, hosts, or ops steps.

## Workspace mode

1. **Repo map** — every manifest repo with pointer to its `CLAUDE.md` / README / config.
2. **Layout** — clone/path overrides and local directory layout.
3. **Startup order** — which repos/services start in what order, or CONFIRM-WITH-TEAM.
4. **Cross-repo env** — shared env alignment documented or CONFIRM-WITH-TEAM in `docs/environments.md`.
5. **Release order** — coordinated release across repos documented or CONFIRM-WITH-TEAM in `docs/release-flow.md`.
6. **No duplication** — install/deploy/env tables live in app repos only; workspace uses `{folder}/path` pointers.
7. **Unknowns** — gaps use team CONFIRM-WITH-TEAM, not invented URLs, hosts, or ops steps.
