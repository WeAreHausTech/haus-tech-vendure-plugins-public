# Native metadata

Loaded on demand from `SKILL.md` (procedure steps 2 and 6): the detection query, the
per-issue capability query, the three mutations, the native-vs-fallback table, and the
read-back that confirms a value actually landed.

Detect support first — many repos have neither issue types nor fields enabled:

```bash
gh api graphql -f owner='<owner>' -f repo='<repo>' -f query='
  query($owner:String!,$repo:String!){
    repository(owner:$owner,name:$repo){
      issueTypes(first:20){ pageInfo { hasNextPage } nodes { id name } }
      issueFields(first:20){ pageInfo { hasNextPage } nodes {
        __typename
        ... on IssueFieldSingleSelect { id name options { id name } }
      } }
    }
  }'
```

The inline fragment is required: `issueFields` is a union, so `__typename` alone
returns type names with no ids. Field and option ids are per-repo — read them
from this query, never carry them between repos.

If this query errors or returns empty nodes, use the fallback column — the
issue-fields schema is still rolling out, so introspect and adjust, never guess.

Truncation is a third case: if either `pageInfo.hasNextPage` is `true` and what
you need is not on the page you got, page through with `after:` — the ids are
missing to page size, not to missing setup. If you still fall back, report it as
truncation, not as "this repo has no issue fields".

Permission is a fourth case the detection query cannot answer: the write flags
live on `Issue`, not on the repository or the field, so they exist only once an
issue does (`Repository.viewerCanSeeIssueFields` is visibility, not write
access). So between `gh issue create` and setting native metadata, ask the
created issue what this token may do:

```bash
gh api graphql -f owner='<owner>' -f repo='<repo>' -F number=<n> -f query='
  query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      issue(number:$number){ viewerCanType viewerCanSetFields viewerCanLabel }
    }
  }'
```

Degrade per capability instead of attempting and failing — a mutation that 403s
fails *after* earlier steps have already landed:

- `viewerCanType: false` → skip `updateIssueIssueType`; use the type label fallback.
- `viewerCanSetFields: false` → skip `setIssueFieldValue`; use the `severity:`
  label fallback for Priority and leave Effort in the `Rough size` section.
- `viewerCanLabel: false` → no labels can be applied at all (a `--label` on
  `gh issue create` will have failed for the same reason — re-create without
  them). The issue then carries no `needs-triage`: say so prominently in your
  report, because nothing marks it as untriaged.

These flags are per-issue, not per-field: one `viewerCanSetFields` answers for
every issue field, so it can never say Priority is writable but Effort is not.

| Metadata      | Native (primary)                                                 | Fallback — and its cause                                    |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Type          | `updateIssueIssueType`: finding→Bug, idea→Feature, deferred→Task | label `finding`/`idea`/`deferred` — no types, or `viewerCanType: false` |
| Priority      | `setIssueFieldValue` on the Priority field (from severity)       | label `severity: high\|medium\|low` — no fields, or `viewerCanSetFields: false` |
| Effort        | `setIssueFieldValue` on the Effort/Size field (from Rough size)  | `Rough size` section — same causes (one flag covers both)   |
| Relationships | `addSubIssue` + `#n` cross-refs, second pass after the batch     | `Related` body section                                      |
| Triage        | label `needs-triage` on everything auto-filed                    | none — `viewerCanLabel: false` leaves no triage marker      |

Mutation shapes:

```bash
# Set issue type (issue node id + type node id from detection)
gh api graphql -f issue='<issueNodeId>' -f type='<issueTypeId>' -f query='
  mutation($issue:ID!,$type:ID!){
    updateIssueIssueType(input:{issueId:$issue,issueTypeId:$type}){ issue { number } }
  }'

# Parent/child relationship
gh api graphql -f parent='<parentNodeId>' -f child='<childNodeId>' -f query='
  mutation($parent:ID!,$child:ID!){
    addSubIssue(input:{issueId:$parent,subIssueId:$child}){ issue { number } }
  }'

# Priority + Effort in one call. Element shape: fieldId + one typed value key.
gh api graphql -f issue='<issueNodeId>' -f query='
  mutation($issue:ID!){
    setIssueFieldValue(input:{issueId:$issue, issueFields:[
      {fieldId:"<priorityFieldId>", singleSelectOptionId:"<optionId>"},
      {fieldId:"<effortFieldId>",   singleSelectOptionId:"<optionId>"}
    ]}){ issue { number } }
  }'
```

### Read back the result

The mutations return a bare `issue { number }` — an ack, not state. Confirm with:

```bash
gh api graphql -f owner='<owner>' -f repo='<repo>' -f query='
  query($owner:String!,$repo:String!){
    repository(owner:$owner,name:$repo){
      issue(number:<n>){
        issueType { name }
        labels(first:20){ nodes { name } }
        parent { number }
        subIssues(first:10){ nodes { number } }
        issueFieldValues(first:20){ nodes {
          ... on IssueFieldSingleSelectValue {
            value
            field { ... on IssueFieldSingleSelect { name } }
          }
        } }
      }
    }
  }'
```

Select `field { name }` or the read-back is ambiguous: on
`IssueFieldSingleSelectValue`, `name` is the *option* name, so Priority=Low and
Effort=Low read as two indistinguishable `Low` entries.
