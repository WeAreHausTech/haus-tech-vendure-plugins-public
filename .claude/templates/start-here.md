# Start here — a guide for everyone on this project

> You do not need to be a developer to use this page. If words like
> "repository" or "pull request" are new to you, the glossary at the bottom
> is written for you.

## What is this?

This project is set up with **haus**, an internal Haus tool. haus gives the
project's AI assistant (Claude Code) a set of ready-made instructions: how
this codebase works, what good work looks like here, and which rules the team
follows. Think of it as an employee handbook written for the AI — so everyone
who works with the assistant gets consistent, correct help, whatever their
role.

## What can I do with it?

Open Claude Code in this project and ask for what you need in plain language
— your own words, in any language. You cannot break anything by asking
questions: reading and explaining change nothing, and changes to the project
itself only take effect after a person on the team has reviewed and accepted
them.

Good first things to ask:

- **"What is installed here, and what can I ask for?"** — you get a menu of
  what the assistant knows how to help with in this project.
- **"Explain what this project does, in plain language."**
- **"What has changed in the project recently?"**
- **"Help me turn this idea into a description the developers can act on."**
- **"Walk me through this error message"** — or this page, or this file.

You do not need to know the correct technical term for anything. Describe
what you want in your own words; finding the right tool is the assistant's
job, not yours.

## What did haus actually set up?

A few folders inside the project. All of them are safe to ignore in daily
work — this list exists so none of it looks mysterious:

| Where                        | What it is                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/`            | Step-by-step guides the assistant follows for specific kinds of work (testing, reviewing, writing docs, …)                         |
| `.claude/agents/`            | Specialist helpers the assistant can hand a task to — they work on their own and report back                                       |
| `.claude/rules/`             | House rules the assistant applies automatically while it works                                                                     |
| `.claude/templates/`         | Ready-made document skeletons — this guide is one of them                                                                          |
| `.haus-workflow/WORKFLOW.md` | The engineering rulebook: how code is planned, tested, and reviewed. Written for developers and the AI — you never need to read it |

## Glossary

| Word                  | What it means                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| **Repository** (repo) | The project's shared folder: every file, plus the full history of every change ever made               |
| **Commit**            | One saved change, with a note saying what changed and why                                              |
| **Branch**            | A working copy inside the repository where changes are prepared without touching the live version      |
| **Pull request** (PR) | A proposed set of changes, presented for review before it is accepted                                  |
| **Merge**             | Accepting a pull request into the main version of the project                                          |
| **CI**                | Automatic checks that run on every proposed change — tests, style, safety — before a person reviews it |
| **Issue**             | A tracked to-do on the project's GitHub page: a bug report, an idea, or a task                         |
| **Skill**             | A step-by-step guide the AI assistant follows for a certain kind of task                               |
| **Agent**             | A helper the assistant can delegate a task to; it works independently and reports back                 |
| **Claude Code**       | The AI assistant tool this project uses                                                                |
| **haus**              | The internal Haus tool that installed — and keeps updated — everything described on this page          |

## Where to learn more

- Ask the assistant. "What can I ask for?" is always a good start.
- The Haus Workflow documentation site:
  <https://wearehaustech.github.io/docs/haus-workflow/>
- Any developer on the team — this setup is shared across Haus projects, so
  everyone works with the same pieces.
