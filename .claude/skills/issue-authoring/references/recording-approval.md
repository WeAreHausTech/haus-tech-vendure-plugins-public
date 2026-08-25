# Recording approval

Loaded on demand from `SKILL.md`: the evidence a `Status` line edit requires, the exact
approved-status format, and the read-modify-write recipe that keeps the edit from wiping
the technical section.

The header edit is a *record of* approval, never an assertion of it. NEVER edit
the `Status` line without named evidence that a human approved: an approving
comment on the issue, an approval label a human applied, or a human instruction
that names this issue number. Record the evidence in the line itself:
`> **Status:** Approved by @<human> <YYYY-MM-DD> (<comment link / label / instruction>).`

**If no such evidence exists, do NOT edit the header and do NOT start work.**
Being handed "work on #157" counts only when the human saying it is the approver;
an agent that approves its own proposal deletes the gate this skill exists for.

`gh issue edit` has no partial-body edit — `--body` / `--body-file` replace the
whole body, so a naive edit wipes the technical section. Read, modify, write:

```bash
f=$(mktemp)
gh issue view <n> --json body --jq .body > "$f"   # edit ONLY the Status line in "$f"
gh issue edit <n> --body-file "$f" --remove-label needs-triage
```

Dropping `needs-triage` is a label write: check `viewerCanLabel` first (capability
query in `native-metadata.md`). If `false`, run the edit without `--remove-label` —
a 403 on the label takes the body edit down with it — and report the issue as
untriaged.
