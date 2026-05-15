# CKAN-CLI — Project Context

CKAN-CLI is an AI-powered terminal REPL for managing Kerbal Space Program mods through CKAN (Comprehensive Kerbal Archive Network).

## Architecture

- **CLI/** — standalone console app (net8.0), the AI-powered REPL
- **Core/** — CKAN library with mod registry, installer, repository management
- **ModernGUI/** — WPF GUI with WebView2 frontend
- **CKAN-M.exe** — pre-built main executable (~9MB)

## CLI Source Files

| File | Purpose |
|------|---------|
| `CLI/Program.cs` | Entry point, REPL loop, slash commands, interactive provider/model setup |
| `CLI/AiClient.cs` | Multi-provider AI client (Ollama, OpenAI, Anthropic, Groq, OpenRouter) |
| `CLI/ActionExecutor.cs` | Parses AI action commands (`[INSTALL:mod]`, `[SEARCH:query]`, etc.) and executes via CKAN Core |
| `CLI/ConsoleRenderer.cs` | Terminal rendering: colors, spinner, menu, tables, markdown stripping |
| `CLI/ProviderConfig.cs` | Provider definitions, endpoints, model lists, API key resolution |
| `CLI/log4net.xml` | Logging config — routes to `ckan-cli.log` file (not console) |

## AI Action Commands

The AI embeds these commands in responses. ActionExecutor parses and runs them:

- `[INSTALL:identifier]` — Install a mod
- `[UNINSTALL:identifier]` — Uninstall a mod
- `[UPGRADE:identifier]` — Upgrade a specific mod to latest version
- `[UPGRADE_ALL]` — Upgrade all outdated mods at once
- `[SEARCH:query]` — Search mods
- `[REFRESH_REPO]` — Refresh mod repository metadata
- `[LIST_INSTALLED]` — List installed mods

## Key Design Decisions

- **Standalone CLI** — built as independent exe, shares `JsonConfiguration` with main app for same API keys/config
- **Multi-provider** — supports 5 AI backends, factory pattern in AiClient.cs
- **Safe rendering** — no ANSI cursor movement or SetCursorPosition (unreliable on Windows cmd.exe); uses `\r` + `Console.WriteLine` for menu interaction
- **Markdown stripping** — AI responses are cleaned of `**bold**`, `*italic*`, `` `code` `` before display

## Build

```powershell
dotnet build CLI/CKAN-CLI.csproj
```
Output: `CLI/bin/Debug/net8.0/CKAN-CLI.exe`

## Run

```powershell
.\CLI\bin\Debug\net8.0\CKAN-CLI.exe
```
