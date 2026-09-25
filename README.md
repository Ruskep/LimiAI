<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="LimiAI logo" />
</p>

<h1 align="center">LimiAI</h1>

<p align="center">
  <strong>A desktop AI agent for working on real projects.</strong><br/>
  Reads and edits files, runs terminal commands, searches the web, connects external tools via MCP, plans before acting, and works through a free OmniRoute gateway — all in one window.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
  <img src="https://img.shields.io/badge/version-2.0.0-2ea44f" alt="Version 2.0.0" />
  <img src="https://img.shields.io/badge/Electron-33-47848F" alt="Electron 33" />
  <img src="https://img.shields.io/badge/Platform-Windows_10%2B-0078D6" alt="Windows" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/free-OmniRoute-8B5CF6" alt="Uses OmniRoute gateway" />
</p>

---

## Table of contents

1. [What is LimiAI](#what-is-limiai)
2. [Features](#features)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [Quick start](#quick-start)
6. [OmniRoute: installing and setting up the gateway](#omniroute-installing-and-setting-up-the-gateway)
7. [Working with the agent](#working-with-the-agent)
8. [Agent and Plan modes](#agent-and-plan-modes)
9. [ROLimi: Roblox Studio integration](#rolimi-roblox-studio-integration)
10. [Reminders](#reminders)
11. [Sounds and notifications](#sounds-and-notifications)
12. [Live site preview](#live-site-preview)
13. [MCP servers](#mcp-servers)
14. [Skills](#skills)
15. [Project memory](#project-memory)
16. [Interface and themes](#interface-and-themes)
17. [Configuration](#configuration)
18. [Troubleshooting](#troubleshooting)
19. [For developers](#for-developers)
20. [License](#license)

---

## What is LimiAI

LimiAI is a desktop chat UI built around **agents with real tools**. Instead of just replying, the model can inspect your project, edit files, execute commands, search the web, plan its work, and hand it back to you with questions when it is stuck — then keep going until the job is done.

It talks to models through **OmniRoute**, a free gateway that aggregates many OpenAI-compatible providers behind a single local API — no paid API keys required.

> **Heads-up:** image attachments are shown as labeled attachments and are **not** sent to the model for vision analysis. Text files are inserted directly into the message.

## Features

- **Tool-using agent** — file read/write/edit/delete, directory listings, terminal, web search and page reading, and interactive polls (with per-path permission prompts).
- **Agent / Plan modes** — a toggle next to the send button. *Agent* works with files and the terminal; *Plan* can only read and write its own plan (`.limi-plan.md`), which it always remembers across sessions.
- **ROLimi** — a dedicated section that connects to **Roblox Studio** over MCP: read and edit Luau scripts, inspect the game tree, run playtests, and more, in its own black-and-blue / white-and-blue theme.
- **Reminders** — a "Scheduled" section where you or the agent create one-time or repeating reminders; a toast and a Windows notification fire when it's time.
- **Sounds & notifications** — pick your own sound for sending a message, finishing a task, asking permission, and UI clicks; minimized-window alerts show "Task finished" and "Permission requested".
- **Live site preview** — when the agent writes or edits `.html` / `.css` / `.js`, a panel slides in from the right with a live preview and a Site/Code toggle.
- **Workspaces** — each project folder keeps its own chat history in the sidebar.
- **MCP servers** — attach external tools via `npx ...` commands or HTTP URLs: filesystems, databases, a browser, or your own services.
- **Skills** — personal instructions (`SKILL.md`) the model applies automatically when the situation matches their description.
- **Project memory** — key decisions and facts are remembered across sessions and injected into context, so the agent doesn't re-read everything from scratch on every message.
- **Smart routing** — pick `auto` and let the gateway choose a working provider, or select a specific model by hand.
- **Web access** — DuckDuckGo search and page reading right from the chat.
- **Agent loop protection** — max tool rounds and retries on empty replies keep runaway sessions in check.
- **Flexible UI** — light/dark themes, accent colors (terracotta, ocean, forest, violet, gold, mono), density, font size, rounding, message width.
- **Bilingual interface** — English and Russian UI that follows your system language by default, with a separate selectable response language for the model.
- **Onboarding wizard** — a step-by-step first-run flow: install OmniRoute with a live progress bar, connect a provider, choose autostart, and start working.

## Requirements

- Windows 10/11, 64-bit
- [Node.js](https://nodejs.org) 18+ (only needed to run from source)
- A running **OmniRoute** gateway with an authorized provider (default: `http://localhost:20128`)

## Installation

### Installer build

Download `LimiAI Setup 2.0.0.exe` from the [Releases](../../releases) page and run it. No extra runtime is required.

### From source

```bash
npm install
npm start
```

Build the installer:

```bash
npm run dist        # creates release/LimiAI Setup *.exe
npm run dist:dir    # just the unpacked app in release/win-unpacked
```

## Quick start

1. Launch the app. On the first run the onboarding wizard walks you through installing OmniRoute and connecting a provider. If you skip it, do it manually:
2. Open **Settings → Connection**, verify the gateway Base URL and click **"Test connection"**.
3. Click **"Add project folder"** in the sidebar and choose your folder.
4. Ask something like: *"Look at the project structure and tell me what's in it."*

> The first time the agent modifies a file or runs a command, the app asks for permission. You can relax this in **Settings → Agent & approvals**.

## OmniRoute: installing and setting up the gateway

LimiAI does not talk to paid APIs directly — it goes through **OmniRoute**, a gateway that aggregates many providers into a single OpenAI-compatible API. Without a running OmniRoute, the chat won't respond.

### Install and start OmniRoute

```bash
npm install -g omniroute
omniroute start
```

It listens on `http://localhost:20128` by default — exactly what LimiAI uses out of the box.

The app can also **start OmniRoute for you**: enable *"Start OmniRoute with the app"* in **Settings → Connection** (or pick it in the onboarding wizard). LimiAI then launches it hidden in the background on startup, watches the gateway every few seconds, and restarts it if it dies. When LimiAI started the gateway itself, it also stops it on exit; a manually started gateway is left alone.

### Connect a model (OAuth account)

1. Open the OmniRoute web UI (usually `http://localhost:20128`).
2. Add a provider account (e.g. **Kiro**) and authorize via OAuth.
3. Confirm working models appear in the list.

Once an account is authorized, keep `auto` in LimiAI's **Settings → Connection** — routing picks a working provider on its own.

> Stale tokens cause a "Token expired" error — refresh them in the OmniRoute web UI, then hit **"Refresh models"** in LimiAI.

### Verify the gateway

In LimiAI: **Settings → Connection → "Test connection"**. Success = the model list responds in a few dozen milliseconds.

## Working with the agent

This is an **agent** with tools. It can inspect and change files, run commands, search the web, ask you via polls, and use connected MCP servers on its own.

**How to ask better:**

- Be specific: *"Look at the files in src/ and find where network errors are handled"* beats *"fix bugs"*.
- Split large tasks into a numbered list — the agent will work through them one by one.
- State the expected result, format and constraints up front.
- After major changes, ask for a short summary of what was modified.

**What the agent does on its own:**

- Reads and inspects the project before acting.
- Applies changes through real tools, not guesses — results are always actual.
- Sends a clarifying poll when the task is ambiguous instead of guessing.
- Honestly reports errors and proposes a fix.
- Asks permission before modifying files or running commands (until auto-approval is on).

**Approval modes** (Settings → Agent & approvals):

| Mode | Behavior |
| --- | --- |
| `Ask` | Confirm before every action (safe, default) |
| `Allow reads` | Reads and listings run without prompts; changes still confirm |
| `Allow everything` | All actions run without prompts (only for trusted projects) |

## Agent and Plan modes

Next to the send button there is a two-segment toggle:

- **Agent** — the normal mode: the model changes files, runs terminal commands, uses every tool.
- **Plan** — planning mode: the model can only look (list directories, read files, search the web) and write its own plan. It cannot modify files or run terminal commands. The plan is saved to `.limi-plan.md` in the project folder and is always loaded into context at the start of a session, so the plan survives restarts and is never forgotten.

The choice is remembered in settings; switching to Plan and back is instant.

## ROLimi: Roblox Studio integration

The diamond button next to "New chat" (marked **BETA**) opens the **ROLimi** section — a Roblox Studio workspace with its own chats (no folder selection) and a black-and-blue / white-and-blue theme that follows the app's dark/light setting.

The connection is plain MCP: when Roblox Studio is running with *Studio as MCP server* enabled, LimiAI connects automatically and exposes the Roblox Studio tools to the model:

- `script_read`, `multi_edit`, `execute_luau` — read and edit scripts, run Luau code
- `search_game_tree`, `inspect_instance` — navigate and inspect the game tree
- `start_stop_play`, `screen_capture` — run the game and capture the viewport
- `generate_mesh/material`, `search_asset`, `insert_asset` — asset workflows
- `list_roblox_studios`, `subagent` — studio discovery and parallel tasks

On top of that, a bundled Lua plugin (`rolimi-plugin/init.server.lua`) adds extended `rolox_*` tools: creating and editing scripts, objects, GUI, camera control, playtesting, and console output.

The ROLimi system prompt is injected as a separate user message (not into the system prompt), so the model always understands what it works with — even on providers that override the system prompt.

## Reminders

The clock icon in the sidebar opens the **Scheduled** section:

- Create a reminder with a name, description, frequency (once / daily / weekly / monthly) and time.
- The agent can create, list, update and delete reminders itself when you ask, e.g. *"remind me tomorrow at 10 to call the bank"*.
- You can also type a request in plain words in the section — it goes to the chat and Limi creates the reminder.
- When the time comes, a toast pops up with the reminder; if the window is minimized, a Windows notification appears too.
- One-time reminders are removed after firing; repeating ones are shifted to the next period.
- Reminders survive restarts (stored in the app data folder).

## Sounds and notifications

**Settings → Sounds** lets you pick a sound (or turn it off) for each event:

- **Message sent** — when you press send
- **Task finished** — when Limi finishes answering
- **Permission requested** — when Limi asks for permission
- **UI clicks** — any button press in the interface

Several variants are bundled for each event (`assets/sounds/`), so you can pick the one you like.

**Windows notifications** (toggle in the same settings) fire when the window is minimized or unfocused:

- **"Task finished"** — Limi finished its work
- **"Permission requested"** — Limi is waiting for your approval

## Live site preview

When the agent writes or edits an `.html` file (or a `.css` / `.js` that belongs to a site), a preview panel slides in from the right edge of the window:

- **Site / Code** toggle — flip between the rendered page and the source.
- **Fullscreen** button — open the preview in a dedicated window.
- **Close** button — hide the panel.
- Each chat keeps its own preview; switching chats switches the panel (and closes it for chats without a site).
- The preview runs on a local server started by the app, so `fetch` and relative assets work.

## MCP servers

In **Settings → MCP servers** add a server:

- **As a command** — e.g. `npx -y @modelcontextprotocol/server-filesystem C:\Projects`
- **By URL** — e.g. `http://localhost:3001/mcp`

Each enabled server connects automatically and its tools are exposed to the model with the `mcp__server__tool` prefix.

## Skills

Skills are folders with a `SKILL.md` (frontmatter metadata: `name`, `description`). Create one in **Settings → Skills**, enable it, and the model will apply it whenever its description matches. Custom skills live in the app's data folder.

## Project memory

The agent keeps two kinds of memory per project:

- **Facts and decisions** — meaningful exchanges (decisions, project facts, explanations) are saved and injected into context, so you don't have to repeat yourself after a restart. Greetings, one-word replies and gateway errors are filtered out.
- **File cache** — the project tree is scanned on open and kept in context, so the agent doesn't re-list directories after every message.

Both are injected as separate user messages, which survives providers that override the system prompt.

## Interface and themes

The UI language follows your system by default and can be pinned explicitly (**Settings → System → Interface language**). The model's **response language** is a separate setting, so the interface can be English while the agent answers in Russian (and vice versa).

Visual options: light/dark theme, accent color, density, font size, window rounding, message width, smooth animations, auto-scroll, and code wrapping.

## Configuration

Settings are stored in the app data folder (`config.json` in `%APPDATA%`). Everything is manageable from the UI, but the file can be edited by hand too.

## Troubleshooting

- **Model loops or replies off-topic** — stop it, clarify the task, or switch models.
- **Gateway silent** — check that OmniRoute is running and the account isn't "Token expired". With autostart on, LimiAI starts it itself and restarts it if it dies.
- **"Token expired"** — reauthorize the provider in the OmniRoute web UI, then refresh models.
- **Model doesn't see tools** — make sure Agent mode is enabled in Settings → Agent.
- **OmniRoute doesn't start with the app** — check `_logs/omniroute-autostart.log` in the project folder for the exact step that failed.
- **SmartScreen warning on Windows** — the installer is unsigned; click "More info → Run anyway".

## For developers

```
main.js        # main process: window, tools, agent loop, gateway autostart
preload.js     # IPC bridge for the renderer
renderer/      # UI (HTML/CSS/JS) + i18n dictionaries + site preview panel
src/           # modules: settings, gateway, workspaces, fsx, shell, mcp, skills,
               #           reminders, plan, rolimi, filecache, webtools, texttools
rolimi-plugin/ # Lua plugin for Roblox Studio (rolox_* tools)
build/         # icons
_e2e/          # regression tests (run with node _e2e/<name>-test.js)
```

Architecture: the renderer talks to the main process over IPC; the agent loop cycles through *model → tools → result* rounds until the task is done. All tool execution (bash, files, web) happens in the main process; the renderer only streams and displays results.

## License

MIT