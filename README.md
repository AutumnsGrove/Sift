# Sift

**A conversational Telegram bot that turns brain dumps into organized, triaged tasks.**

Powered by Cloudflare Workers, D1, and Workers AI.

---

## What It Does

Open Telegram, dump whatever's on your mind (text, voice notes, photos, links), and Sift processes it into structured, prioritized tasks. All interaction is natural language. No slash commands, no forms, no context switching.

```
You:   "ok so I need to finish the auth migration before friday,
        also remember to call the psychiatrist, and at some point
        I should look into whether D1 supports triggers"

Sift:  Got it, I pulled 3 tasks from that:

        ● Finish auth migration
          Due: Friday · Priority: High · Category: Dev

        ◐ Call psychiatrist
          Due: This week · Priority: Medium · Category: Health

        ○ Research D1 trigger support
          Priority: Low · Category: Dev/Research

        All three saved. Anything to adjust?
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| AI (text) | Workers AI, Llama 3.3 70B |
| AI (vision) | Workers AI, Llama 4 Scout |
| AI (audio) | Workers AI, Whisper |
| Interface | Telegram Bot API |
| Language | TypeScript |

## Features

- **Text brain dumps** — dump thoughts, get structured tasks back
- **Voice notes** — Whisper transcription, then triage
- **Photos/screenshots** — Llama 4 Scout extracts actionable items
- **Links** — fetch, summarize, create tasks from content
- **Natural language queries** — "what's on my plate today?"
- **Status updates** — "the stripe thing is done"
- **Recurring tasks** — "remind me every Monday to review the board"
- **Daily digest** — morning briefing with priorities and suggestions
- **Proactive suggestions** — deadline warnings, backlog nudges, WIP awareness

## Project Status

**Phase 2: AI Triage + Query** (complete) — Core infrastructure and AI pipeline built. Phases 3-5 pending.

See `TODOS.md` for the full implementation roadmap and `sift-spec.md` for the complete specification.

## Cost

Essentially free. ~$1-5/month at personal usage levels.

---

*Pour your mind out. Keep what matters.*
