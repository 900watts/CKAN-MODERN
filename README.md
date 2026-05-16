# CKAN Modern

A modernized mod manager for Kerbal Space Program, built with WPF + WebView2 + React.

[Download Latest Release](https://github.com/900watts/CKAN-MODERN/releases/latest)

## About

CKAN Modern is a fork of the [Comprehensive Kerbal Archive Network (CKAN)](https://github.com/KSP-CKAN/CKAN) with a completely redesigned UI. It provides the same powerful mod management backed by the CKAN metadata repository, wrapped in a modern React-based interface.

### Features

- Modern dark-themed UI built with React + TypeScript
- Browse, search, and install from 3,000+ KSP mods
- Automatic dependency resolution
- Built-in AI assistant for mod recommendations
- Multi-provider AI support (CKAN Cloud, OpenRouter, OpenAI, Google AI, Silicon Flow, Ollama)
- Multiple game instance management
- Auto-update from GitHub Releases
- AI-powered CLI tool for terminal-based mod management

## Downloads

| File | Size | Description |
|------|------|-------------|
| `CKAN-M.exe` | ~9 MB | Requires [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) |
| `CKAN-M-bundled.exe` | ~71 MB | Self-contained, no runtime needed |

## Building from Source

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/)

### Build

```bash
# Build the React frontend
cd src-ui
npm ci
npm run build

# Build the .NET app
cd ..
dotnet publish CKAN/CKAN-Modern.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

## Credits

- [CKAN](https://github.com/KSP-CKAN/CKAN) — the original Comprehensive Kerbal Archive Network
- [KSP-CKAN/CKAN-meta](https://github.com/KSP-CKAN/CKAN-meta) — the mod metadata repository

## License

This project is based on CKAN, licensed under the MIT License.
