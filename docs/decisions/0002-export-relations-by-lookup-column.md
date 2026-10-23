# ADR-0002: Export relation custom fields by a lookup column

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/product-import-export-plugin (`exportOptions.relationLookups`, `ProductExportService`, export header grammar)
- **Related:** ADR-0001; branch feat/export-relation-lookup

## Context

ADR-0001 lets the import name a related row by a text column (`<owner>:<field>:<entity>:<column>`), but the export still wrote every relation custom field as database ids under `<owner>:<field>:<entity>`. An exported file could only be imported into the same database, and a person editing it saw ids instead of the codes and SKUs they work with.

## Decision

A plugin option `exportOptions.relationLookups` maps `<owner>:<field>` to a column of the related entity. For each configured field the export writes the related rows' values of that column under the four-segment header the import reads. Fields without an entry keep ids. The map is checked when the application starts, against the custom field config and the related entity's metadata, with the same text-column rule the import uses; a wrong entry stops the start.

## Motivation (why)

The option is the mirror of the import's lookup header, keyed per field like the header itself, so whatever the export writes the import reads back. Checking at start turns a typo into a startup error instead of an export that cannot be imported.

## Alternatives considered

- Keying by related entity (`{ ProductVariant: 'sku' }`): less configuration, but every relation to that entity changes at once and a field cannot keep ids.
- A per-export choice in the export UI: more UI and a request parameter for something a project decides once.
- Leaving the export on ids and resolving codes in app code: a second pass over the file outside the plugin.

## Consequences

- Exported values follow the related row's current column value. A soft-deleted related row, or one whose value is empty, is left out of the cell, since the import matches only live rows by a value; for a list field, re-importing the file then drops that link.
- Self-referencing relations (a variant field relating to `ProductVariant`) cost one more query per page and field for the column values.
- A value that several live rows share makes the import of that file fail with the lookup errors of ADR-0001 instead of linking by id.
