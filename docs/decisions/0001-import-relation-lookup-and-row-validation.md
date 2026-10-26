# ADR-0001: Import relation lookup by column and a row validation strategy

- **Status:** Proposed
- **Date:** 2026-10-21
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/product-import-export-plugin (`RelationLookupResolver`, `ImportRowValidationStrategy`, `importOptions.rowValidationStrategy`, import header grammar)
- **Related:** branch feat/relation-lookup-and-row-validation; issue #58

## Context

The import could link a relation custom field by value only when the related entity was a `ProductVariant` and the value its SKU (`<owner>:<field>:<type>:sku`). Any other relation, for example to a plugin entity with a code, took the database id, which a file author does not know. A consuming app also had no way to reject a row by its own rule with a row number; the only alternative was a second parse of the file in app code, with errors split across two lists.

## Decision

The header grammar becomes `<owner>:<field>:<entity>:<column>`, where `<entity>` is the related entity's class name in lower case and `<column>` any plain text column of it; values must match exactly one live row. A new plugin option `importOptions.rowValidationStrategy` (`ImportRowValidationStrategy extends InjectableStrategy`) receives the parsed rows with line numbers and resolved relation ids, and runs at upload (400, nothing queued) and again in the worker before the first write (the job fails). The default strategy accepts everything and costs nothing.

## Motivation (why)

One generic lookup covers every relation instead of a lookup class per entity, and a strategy is Vendure's own extension idiom for app rules that need services. Both keep a single import with a single list of rejected rows.

## Alternatives considered

- A lookup strategy per entity: more code for the same declarative need.
- A row validation callback function instead of an `InjectableStrategy`: cannot use injected services.
- App-side pre-check and post-import step: parses the file twice and splits the error list.

## Consequences

- Every lookup header, `:sku` included, requires the related entity's class name in lower case as its third segment (`variant:baseVariant:productvariant:sku`); other third segments are rejected.
- An import job whose rows are rejected when it runs now ends FAILED with the list as its error instead of COMPLETED with zero imported.
- With a non-default strategy the whole file is parsed at upload, which costs memory proportional to the file.
- Lookups work on text columns of the entity itself, not on translated fields.
