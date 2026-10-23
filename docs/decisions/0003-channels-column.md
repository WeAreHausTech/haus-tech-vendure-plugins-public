# ADR-0003: A `channels` column assigns imported products to channels by token

- **Status:** Proposed
- **Date:** 2026-10-23
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/product-import-export-plugin (`ChannelColumnResolver`, `ExtendedFastImporterService.setProductChannels`, import and export column `channels`)
- **Related:** branch feat/import-channels-column

## Context

An import assigned every product to the default channel and to the channel the uploader had active. A multi-channel shop that keeps one catalogue file for many channels had to split the file per channel and switch channel before each upload. The export said nothing about channels, so an exported file could not put products back where they were.

## Decision

A product column `channels` names channels by token, pipe-separated. The product, its variants (with a price row in each channel's currency) and the option groups and facets the row writes are assigned to them on top of the default and the import's channel. The column only adds assignments. Each token must name a channel; the uploader needs `UpdateCatalog` or `UpdateProduct` in every named channel; an import run outside the default channel may name only its own channel. The check runs at upload (400, nothing queued) and again in the job with the uploader's context. The export writes the product's non-default channels from the default channel, and only the exporting channel elsewhere.

## Motivation (why)

The token is the channel's identifier in the API (`vendure-token`), so a file names a channel the way every client does. Checking rights per named channel keeps the upload endpoint's rule, which Vendure checks only in the active channel, true for every channel the file reaches. Adding only means a stale or partial file can never take a product out of a channel.

## Alternatives considered

- Match on the channel code: readable, but a second identifier that can differ from the token.
- Let the column replace the product's channels: one file states the whole truth, but an empty cell or a cut-down file would remove products silently.
- One import per channel, as before: no new rule, but the file has to be split and the channel switched for each part.

## Consequences

- An upload with a `channels` column is parsed in full at upload, like one with a row validation strategy.
- Removing a product from a channel stays an Admin UI or Dashboard action.
- A context without a user is trusted for rights, as Vendure trusts it.
- The default channel's price row keeps the import channel's currency, as before; only the named channels get their own.
