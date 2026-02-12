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
- **Voice notes** — Whisper transcription, then triage (coming soon)
- **Photos/screenshots** — Llama 4 Scout extracts actionable items
- **Links** — fetch, summarize, create tasks from content
- **Natural language queries** — "what's on my plate today?"
- **Status updates** — "the stripe thing is done"
- **Recurring tasks** — "remind me every Monday to review the board"
- **Daily digest** — morning briefing with priorities and suggestions
- **Proactive suggestions** — deadline warnings, backlog nudges, WIP awareness
- **Slash commands** — `/board`, `/today`, `/stats`, `/help` for quick actions
- **Rate limit handling** — automatic retry with exponential backoff

## Project Status

**Phase 4+5: Complete** — All core features implemented except voice notes. Ready for production deployment.

See `TODOS.md` for remaining polish items and `sift-spec.md` for the complete specification.

## Setup & Deployment

### Prerequisites

- Cloudflare account
- Telegram account
- Node.js 22+ and pnpm

### 1. Create Telegram Bot

```bash
# Talk to @BotFather on Telegram
/newbot
# Follow prompts, save your bot token

# Get your user ID from @userinfobot
# Save this value
```

### 2. Create Cloudflare D1 Database

```bash
wrangler d1 create sift-tasks
# Copy the database_id to wrangler.toml
```

### 3. Configure Secrets

For local development:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values
```

For production:
```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put TELEGRAM_CHAT_ID
```

### 4. Initialize Database

```bash
# Local
pnpm run db:init

# Production
pnpm run db:init:remote
wrangler d1 execute sift-tasks --file=src/db/init-digest.sql
```

### 5. Deploy

```bash
pnpm run deploy
# Or push to main branch for GitHub Actions deployment
```

### 6. Register Webhook

```bash
curl "https://sift.YOUR_SUBDOMAIN.workers.dev/register?secret=YOUR_WEBHOOK_SECRET"
```

### 7. Start Using

Open Telegram, message your bot, and start dumping tasks!

## Development

```bash
# Install dependencies
pnpm install

# Run locally with wrangler
pnpm run dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Cost

Essentially free. ~$1-5/month at personal usage levels.

---

*Pour your mind out. Keep what matters.*
