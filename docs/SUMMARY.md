# Haus Tech Vendure Plugins (public)

Public, open-source counterpart to Haus Tech's Vendure plugins: an Nx monorepo of [Vendure](https://www.vendure.io/) (TypeScript) plugins under `packages/`. Each plugin is built, tested, versioned, and published to npm independently under the `@haus-tech/` scope. This repo contains libraries only — no Vendure server or application. Two plugins ship today: `@haus-tech/elastic-search-synonyms` and `@haus-tech/product-import-export-plugin`.

## Agent Context Guide

- Use this file as the documentation index; open detail docs from the tables below only when needed.
- Start with **CLAUDE.md** for setup, commands, conventions, and pre-PR checks.
- Route by task (load one primary topic, not every file):
  - **Run / debug locally** → [setup.md](setup.md)
  - **Code change** → [codebase.md](codebase.md); add [conventions.md](conventions.md) and [architecture.md](architecture.md) for cross-cutting or integration changes
  - **Ship / release** → [development-workflow.md](development-workflow.md) + [deployment.md](deployment.md)
- Prefer path references in docs over duplicating source; read code for implementation detail.
- If docs conflict with code or user intent, ask before making broad changes.

## Architecture

| File                                 | Description                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)   | How a Vendure plugin is structured here; Elasticsearch + S3 integration boundaries |

## Codebase

| File                         | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| [codebase.md](codebase.md)   | Repo layout, per-plugin inventory, entry points, where to change what  |

## Conventions

| File                               | Description                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| [conventions.md](conventions.md)   | Plugin/extension patterns, generated GraphQL, versioning, change recipes     |

## Setup

| File                   | Description                                                  |
| ---------------------- | ----------------------------------------------------------- |
| [setup.md](setup.md)   | Prerequisites, install, building and testing the libraries  |

## Development workflow

| File                                               | Description                                          |
| -------------------------------------------------- | ---------------------------------------------------- |
| [development-workflow.md](development-workflow.md) | Common changes, quality checks, generated artifacts  |

## Deployment

| File                             | Description                                                       |
| -------------------------------- | ---------------------------------------------------------------- |
| [deployment.md](deployment.md)   | Nx Release to npm, version pinning, README/docs sync CI pipelines |
