# KSC Mission Control — AI Kerbal Council

**Date:** 2026-05-09
**Status:** Approved
**Project:** CKAN Modern — KSP Mod Manager

---

## Overview

Add a "Mission Control" tab to CKAN Modern that renders a living 2.5D KSP Mission Control room populated with AI-powered Kerbals. Each Kerbal has a distinct personality defined by a soul file, with courage/stupidity stats mechanically mapped to API parameters. Kerbals work in shifts, move around the room, and can be summoned off-shift via an in-app smartphone. They talk to each other when the user is idle.

---

## Architecture

```
src-ui/src/kerbal-control/
├── MissionControl.tsx          — Page container
├── Room/
│   ├── RoomCanvas.tsx           — 2.5D Canvas renderer
│   ├── KerbalSprite.ts          — Sprite animation states
│   ├── RoomLayout.ts            — Desk/monitor positions, zones
│   └── TimeSystem.ts            — In-game clock, shift engine, lighting
├── Chat/
│   ├── ChatBar.tsx              — Text input + message history
│   ├── MessageRouter.ts         — @mention parser, auto-response routing
│   ├── IdleBanter.ts            — Kerbal-to-Kerbal conversations when idle
│   └── SmartphoneModal.tsx      — Contacts list, off-shift summon
├── Souls/
│   ├── SoulLoader.ts            — Loads soul.md, injects into system prompt
│   ├── jebediah.md
│   ├── bob.md
│   ├── valentina.md
│   ├── bill.md
│   ├── gene.md
│   ├── wernher.md
│   ├── walt.md
│   ├── mortimer.md
│   └── linus.md
├── Settings/
│   └── ShiftConfig.tsx          — Customizable shift assignments
└── KerbalStore.ts               — State: present, off-shift, moods, history
```

---

## 1. The 2.5D Room

- Canvas-rendered with PixiJS or raw Canvas API
- Parallax layers: background (wall/screens) → mid (desks/consoles) → foreground (Kerbals)
- Kerbals are animated sprites with states: idle, walking, typing, stretching, arriving, leaving, drinking coffee
- Real-time clock synced to system time; ambient lighting shifts warm/cool based on time of day
- Kerbals autonomously: get coffee, stretch, walk off-screen for bathroom breaks, return
- Desk positions: multiple monitor stations with seated Kerbals, standing areas for hangout

---

## 2. Shift System

**Default shifts (user-customizable in Settings):**

Day Shift (06:00–18:00):
| Kerbal | Role | Why |
|--------|------|-----|
| Gene Kerman | Flight Director | Natural authority, runs the room |
| Valentina | Pilot | Professional, sharp |
| Bill | Engineer | Technical work in daylight |
| Wernher von Kerman | Rocket Scientist | R&D is business hours |
| Walt Kerman | PR/Comms | Media relations = daytime |

Night Shift (18:00–06:00):
| Kerbal | Role | Why |
|--------|------|-----|
| Jebediah | Pilot | Thrill-seeker, quiet chaos of night |
| Bob | Scientist | Quiet hours = focused analysis |
| Linus Kerman | Experimental R&D | Weird stuff happens at night |
| Mortimer Kerman | Finance | Crunching numbers in peace |

- Shift change animation: departing Kerbals gather belongings, walk off; arriving Kerbals enter, settle
- Users customize shifts in Settings via drag-and-drop between day/night columns
- Off-shift Kerbals appear grayed-out in Contacts

---

## 3. Soul Files

Each `souls/{name}.md` is a markdown file loaded as the system prompt for that Kerbal's AI calls:

- **Personality**: speech patterns, quirks, catchphrases, emotional range
- **Knowledge domain**: what this Kerbal is expert in
- **Response style**: tone, verbosity, humor level, caution level
- **Stat block**: courage/stupidity values (parsed by the system for API params)

Example — `souls/bob.md`:
```
- Role: Chief Scientist
- Courage: 30% → temperature: 0.3
- Stupidity: 10% → top_p: 0.7
- Personality: Brilliant, anxious, overthinks everything
- Knowledge: Science mods, experiment mechanics, KSP physics, mod compatibility
- Speech: Apologetic, qualifies everything, occasionally panics mid-sentence
- Catchphrases: "Oh dear...", "This is fine.", "Please don't make me EVA."
```

Users can edit soul files to customize Kerbal personalities.

---

## 4. Stats → AI Parameters

| Stat | Maps to | Effect |
|------|---------|--------|
| Courage | `temperature` | High courage = high temp (creative, bold). Low = precise, safe |
| Stupidity | `top_p` | High stupidity = wide token pool (random, chaotic). Low = focused |
| BadS | overrides both | Locks temp high, ignores danger signals, always grinning |

Combined: soul file provides the personality prompt + stats mechanically enforce behavior.

---

## 5. Chat Interaction

- **@mention routing**: "Hey Bob, what mods fix aerodynamics?" → routes to Bob's soul
- **Auto-routing**: No @mention → AI evaluates the message and picks the most relevant Kerbal to respond
- **Broadcast**: Addressing "everyone" or "all" → multiple Kerbals respond in sequence
- **Unprompted chime-in**: Other Kerbals can jump in after the primary responder (e.g., Jeb interrupts Bob's careful analysis with a reckless suggestion)
- Chat bar at bottom of screen shows all dialogue as a scrollable transcript

---

## 6. Smartphone / Off-Shift Summoning

- Smartphone icon on a desk → opens Contacts modal
- Shows all Kerbals with status: "On shift", "Sleeping (3h until shift)", "On break"
- Summon off-shift Kerbal → sends message with:
  - 5–15 second artificial delay (waking up)
  - 30% chance no response (deep sleeper)
  - Groggy response variants: "ugh... what time is it..."
  - Higher error rate, shorter responses, annoyed tone

---

## 7. Idle Kerbal Banter

- When user is idle for N minutes (configurable, default 3 min):
  - Kerbals begin talking to each other autonomously
  - Conversations are contextual: discuss mods, complain about management, debate rocket designs
  - Each exchange consumes tokens (API calls), so it's **toggleable in Settings** with a "Save Tokens" mode
- Settings: `idleBanter: boolean`, `idleBanterDelay: number (minutes)`, `idleBanterFrequency: "occasional" | "chatty" | "never"`

---

## 8. Sidebar Integration

New nav item in the existing sidebar:

```
🚀 Mission Control    → Kerbal Council (this feature)
```

Placed between "Instances" and "Settings" in the nav rail.

---

## 9. Token Economy

All Kerbal AI calls use the user's configured API provider. Token-saving features:
- Idle banter off by default or set to "occasional"
- Off-shift summons incur standard API cost (one response)
- Multiple Kerbals responding to broadcast messages counts as N API calls
- Warning in Settings: "Estimated token usage: X/day with current config"

---

## Implementation Order

1. Soul files + SoulLoader (foundation of all AI behavior)
2. KerbalStore + TimeSystem (state management + shift logic)
3. RoomCanvas + KerbalSprite + RoomLayout (the 2.5D room)
4. ChatBar + MessageRouter (text interaction)
5. SmartphoneModal (off-shift summoning)
6. IdleBanter (autonomous Kerbal conversations)
7. ShiftConfig settings UI
8. Sidebar integration + MissionControl page container
