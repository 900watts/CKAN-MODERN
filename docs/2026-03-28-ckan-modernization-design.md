# CKAN Modernization — Design Specification

**Date:** 2026-03-28  
**Author:** Claw (AI Assistant)  
**Status:** Draft  
**Version:** 2.0

---

## 1. Overview

Modernize the Comprehensive Kerbal Archive Network (CKAN) with three major additions:

1. **Modern UI** — React + WebView2, no Electron, true Windows .exe
2. **AI Assistant** — Embedded chat assistant that understands KSP mods, can search/read codebase, and execute installs
3. **Dispatch System** — Remote AI execution node that an external AI (e.g., phone assistant) can command to install mods on the PC

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS + Framer Motion |
| Desktop runtime | .NET 8 WPF + WebView2 |
| Backend | C# (.NET 8) — Core logic preserved |
| AI Provider | Silicon Flow (free + paid models) |
| Backend-as-a-Service | Supabase (Auth, Database, Edge Functions) |
| Real-time | Supabase Realtime |
| Embeddings | Silicon Flow (free embedding models) |

### Architecture

```
┌─────────────────────────────────────────────┐
│          CKAN.exe (single .exe)             │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐    │
│  │   WebView2 (React Frontend)          │    │
│  │   mod list, chat, settings, UI      │    │
│  └──────────────┬──────────────────────┘    │
│                 │ JSInterop / IPC            │
│  ┌──────────────▼──────────────────────┐    │
│  │   .NET 8 (C# Backend)               │    │
│  │   Core logic, Silicon Flow, Supabase │    │
│  │   Game detection, file operations    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 2. Modern UI Specification

### 2.1 Design Principles

- **Web-first UI** — React frontend rendered in WebView2
- **Fluent-inspired design** — Mica-like surfaces, smooth animations, clean typography
- **Dark mode default** — KSP players prefer dark rooms
- **No functionality loss** — Every existing CKAN feature must work in the new UI

### 2.2 Color Palette

| Role | Light | Dark |
|---|---|---|
| Background | `#F3F3F3` | `#1A1A1A` |
| Surface | `#FFFFFF` | `#252525` |
| Primary | `#0078D4` | `#60CDFF` |
| Accent | `#FF8C00` | `#FFB347` |
| Text Primary | `#1A1A1A` | `#FFFFFF` |
| Text Secondary | `#666666` | `#9E9E9E` |
| Success | `#107C10` | `#6CCB5F` |
| Warning | `#C19C00` | `#FCE100` |
| Error | `#D13438` | `#FF6B6B` |

### 2.3 Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  Title Bar (native Windows frame, standard controls)         │
├────────┬─────────────────────────────────────────────┬───────┤
│        │                                             │       │
│  Nav   │           Content Area                      │  AI   │
│  Rail  │       (Mod list / Settings / etc)          │ Panel │
│  64px  │                                             │ 320px │
│        │                                             │       │
│        │                                             │       │
│        │                                             │       │
├────────┴─────────────────────────────────────────────┴───────┤
│  Status Bar (download progress, connection, version)         │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 Screens

| Screen | Priority |
|---|---|
| Mod List (Available) | P0 |
| Mod List (Installed) | P0 |
| Mod Detail | P0 |
| Settings | P0 |
| Game Instance Manager | P0 |
| AI Chat Panel | P0 |
| Download Manager | P1 |
| Repository Manager | P1 |

---

## 3. AI Assistant Specification

### 3.1 AI Features

1. **"I Don't Know What I Want" Search** — Describe playstyle, AI finds matching mods
2. **Paste-and-Walk-Away Install** — Paste mod list, AI silently installs everything
3. **Mod Deep-Dive** — AI reads mod code/README, explains in plain English
4. **Dependency Explainer** — See what breaks before removing a mod

### 3.2 AI Models

**Free Tier (Silicon Flow Free):**
- Chat: `Qwen/Qwen2.5-7B-Instruct`
- Embeddings: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

**Paid Tier (Silicon Flow Paid):**
- Smart Search: `anthropic/claude-3-5-sonnet-20241022`
- Code Analysis: `openai/gpt-4o`

### 3.3 Points Economy

| Action | Free (pts) | Paid (pts) |
|---|---|---|
| Simple chat | 0 | 0 |
| Mod search | 0 | 5 |
| "I want..." recommendation | 10 | 20 |
| Paste-and-walk install | 5 | 10 |

---

## 4. Dispatch System Specification

Allows external AI (phone) to command CKAN on PC to install mods.

- One-time pairing via 6-digit code
- Supabase Edge Functions handle routing
- CKAN acts as a "node" — polls for commands, executes, reports back

---

## 5. Implementation Phases

### Phase 1: Project Scaffold ✅ Planned
- .NET 8 WPF project with WebView2
- React frontend (blank shell)
- IPC bridge working

### Phase 2: Core UI (Mod List, Settings, Navigation)
### Phase 3: Supabase Auth + Points System
### Phase 4: AI Chat Panel
### Phase 5: AI Search + Embeddings
### Phase 6: Dispatch System
### Phase 7: Polish + Release

---

*Next step: Phase 1 implementation*
