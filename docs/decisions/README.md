# Architecture Decision Records (ADRs)

Why we chose X — short, dated, write-once decision log for humans and agents.

| ADR | Title | Why (one line) | Status |
| --- | ----- | -------------- | ------ |
| [0001](0001-import-relation-lookup-and-row-validation.md) | Import relation lookup by column and a row validation strategy | One generic lookup and a Vendure-style strategy keep one import and one list of rejected rows. | Proposed |
| [0002](0002-export-relations-by-lookup-column.md) | Export relation custom fields by a lookup column | The export mirrors the import's lookup header per field, so an exported file imports again without database ids. | Proposed |
| [0003](0003-channels-column.md) | A `channels` column assigns imported products to channels by token | One file run from the default channel fills several channels, checked per channel and never removing an assignment. | Proposed |
