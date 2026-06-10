# Rollback

When migrations or data writes ship:

- Document rollback order (reverse migration, feature flag off, redeploy prior artifact).
- Call out irreversible steps explicitly.

If no migration risk in scope, state **No migration rollback required**.
