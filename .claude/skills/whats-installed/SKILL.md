---
name: whats-installed
description: >-
  Use when someone asks what is installed in this project, what they can ask for, what haus
  set up, where to start, or for a menu of available skills and helpers — especially when
  the person asking is not a developer. Triggers include "what's installed", "what can I ask
  for", "what can you help with here", "start here", "vad är installerat", "vad kan jag be
  om hjälp med". Someone asks what is installed, what they can ask for, what haus set up, or
  where to start — especially a non-technical colleague. Installing, removing, or updating
  items — that is the haus CLI's job, not a conversation.
---

# What's Installed

Turn the machine inventory of haus-installed content into a plain-language
menu the person in front of you can act on. The reader may be a project
manager, a designer, or a content person — never assume they know git, the
file tree, or what a "skill" is.

## Where the inventory lives

Read, in this order:

1. `.haus-workflow/haus.lock.json` — the authoritative list of installed
   catalog items: id, type, version, and installed paths. Prefer this.
2. If the lock file is missing, list what is on disk instead:
   `.claude/skills/`, `.claude/agents/`, `.claude/commands/`,
   `.claude/rules/`, `.claude/templates/`.
3. `.claude/templates/start-here.md` — a plain-language onboarding page. If
   it exists and the reader is non-technical, mention it as the standing
   reference they can come back to without you.

## How to answer

- **Answer in the language the person asked in.**
- **Group by what the reader can do, not by item type.** "Working with code",
  "Reviewing and quality", "Writing and planning", "Project rules" — not
  "skills, agents, rules, templates".
- **Translate ids into outcomes.** `haus.react-router-v7-patterns`
  becomes "guidance for the routing library this app uses" — say what
  it helps with, never recite the id at a non-technical reader.
- **One line per item, phrased as something to say.** "Ask me to review a
  change before it ships" beats "code-review skill available".
- **Match depth to the reader.** A developer can get ids, versions, and
  paths on request; a non-technical reader gets the menu and example
  requests only.
- **Never dump raw JSON**, the lock file, or directory listings into the
  conversation — that is the inventory, not the answer.
- **End with two or three example requests** tailored to this specific
  project, so the reader can copy one and go.

## Do not

- Do not install, remove, or update anything — this skill is read-only.
  Changing what is installed is the haus CLI's job (`haus apply`,
  `haus update`), run by a developer.
- Do not list items that are not actually present in this project.
- Do not recite `.haus-workflow/WORKFLOW.md` at a non-technical reader.
  If they ask about the team's working rules, summarize only the part they
  asked about, in plain language.
