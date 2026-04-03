# CKAN Modern (CKAN-M)🚀

> A modern, native Windows mod manager for Kerbal Space Program — built with **.NET 8 WPF + WebView2 + React 18**. No Electron. Proper `.exe`.

[![.NET 8](https://img.shields.io/badge/.NET-8.0-blue)](https://dotnet.microsoft.com/download)
[![React 18](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)]()

---

## ✨ Features

- **🎮 Native Windows EXE** — No Electron, no Node.js runtime. A proper compiled `.exe` powered by WebView2.
- **🔍 Mod Browsing** — Search, filter, install, and manage KSP mods with a responsive React UI.
- **🤖 AI Assistant** — Built-in chat for mod recommendations, troubleshooting, and playthrough help (Silicon Flow API).
- **🛤️ Steam Integration** — Auto-detects KSP installations from your Steam library via registry scanning.
- **📂 Multi-Instance** — Manage multiple KSP installations with separate mod profiles.
- **📥 Download Queue** — Real-time download progress tracking.
- **🗃️ Repositories** — Configure and switch CKAN mod repositories.
- **💾 Supabase Backend** — Authentication, AI credit tracking, and user preferences sync.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | .NET 8 WPF (C#) |
| **UI** | React 18 + TypeScript |
| **Webview** | Microsoft WebView2 |
| **IPC** | Custom JSON-RPC bridge (C# ↔ React) |
| **Database** | Supabase (auth, credits) |
| **AI** | Silicon Flow API |
| **DI** | Autofac with direct-instantiation fallback |
| **Detection** | Windows Registry + Steam library scanning |

## 📦 Requirements

- **Windows 10/11** (x64)
- **WebView2 Runtime** — Pre-installed on most Windows. [Download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download)
- **.NET 8 SDK** — For building. [Download](https://dotnet.microsoft.com/download/dotnet/8.0)

## 🚀 Quick Start

1. Download **CKAN-Modern.exe** from [Releases](../../releases)
2. Double-click to run
3. KSP auto-detected from Steam

## 💻 Build from Source

```powershell
# 1. Clone
git clone https://github.com/900watts/CKAN-MODERN.git
cd CKAN-MODERN

# 2. Build React frontend
cd CKAN-MODERN-PROJECT/src-ui
npm install
npm run build

# 3. Build .NET app
cd ../../ModernGUI
dotnet build -c Release
