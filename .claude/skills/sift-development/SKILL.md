---
name: sift-development
description: Build and maintain Sift, the conversational Telegram task triage bot. Use when implementing features, debugging, or making architectural decisions for the Sift project.
---

# Sift Development Skill

## When to Activate

Activate this skill when:
- Implementing any Sift feature (pipeline, AI, scheduler, formatting)
- Working with the Sift codebase structure
- Making architectural decisions about the bot
- Debugging Telegram webhook handling or AI responses
- Working with the D1 database schema

## Project Overview

**Sift** is a personal task triage agent that lives in Telegram. Users dump thoughts (text, voice, photos, links) and Sift processes them into structured, prioritized tasks stored in D1. All interaction is natural language. No slash commands, no forms.

**Full specification:** `sift-spec.md` (read this first for any feature work)

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Cloudflare Workers | Webhook handler + scheduled triggers |
| Database | Cloudflare D1 (SQLite) | Task, conversation, dump, schedule storage |
| AI (text) | Workers AI, Llama 3.3 70B | Triage, NL query, suggestions |
| AI (vision) | Workers AI, Llama 4 Scout | Photo/screenshot processing |
| AI (audio) | Workers AI, Whisper | Voice note transcription |
| Interface | Telegram Bot API | All user interaction |
| Language | TypeScript | All source code |

## Project Structure

```
sift/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # fetch + scheduled handler entry points
│   ├── telegram.ts           # Telegram Bot API helpers
│   ├── pipeline/
│   │   ├── router.ts         # Classify input type + intent
│   │   ├── text.ts           # Text message processing
│   │   ├── voice.ts          # Whisper transcription
│   │   ├── vision.ts         # Llama 4 Scout image processing
│   │   └── links.ts          # URL fetch + summarize
│   ├── ai/
│   │   ├── triage.ts         # Brain dump → structured tasks
│   │   ├── query.ts          # Natural language → SQL
│   │   ├── suggest.ts        # Proactive suggestion engine
│   │   └── digest.ts         # Daily digest generation
│   ├── scheduler/
│   │   ├── cron.ts           # Cron expression parser
│   │   ├── runner.ts         # Scheduled handler logic
│   │   └── digest.ts         # Digest query aggregation + send
│   ├── db/
│   │   ├── schema.sql        # D1 schema (tasks, dumps, conversations, schedules)
│   │   ├── tasks.ts          # Task CRUD
│   │   ├── dumps.ts          # Dump log operations
│   │   ├── conversations.ts  # Conversation context
│   │   └── schedules.ts      # Schedule CRUD + next-fire
│   └── format/
│       ├── kanban.ts         # Kanban-style text formatting
│       ├── list.ts           # Priority/date list formatting
│       ├── card.ts           # Single task detail view
│       └── digest.ts         # Digest message formatting
```

## D1 Schema (4 tables)

- **tasks** — The kanban board. Status, priority, category, due dates, tags.
- **dumps** — Raw capture log. Everything thrown at Sift, even non-task items.
- **conversations** — Last ~20 messages for multi-turn context.
- **schedules** — Recurring tasks with cron expressions and precomputed `next_fire`.

## Key Patterns

### Input Pipeline

All input flows through classification first:
1. Detect input type (text / voice / photo / link)
2. Pre-process (transcribe audio, describe image, fetch URL)
3. Classify intent (new task? query? update? chat?)
4. Route to appropriate handler (triage / query / update)

### AI Tool Calling

The LLM system prompt defines tools the AI can call:
- `query_tasks(sql)` — SELECT against tasks table
- `create_task(task)` — Insert new task
- `update_task(id, changes)` — Update existing task
- `search_dumps(query)` — Search raw brain dump history

### Response Style

Sift uses Unicode symbols for visual scanning in Telegram:
- `●` critical/high priority
- `◐` medium priority
- `○` low/someday priority
- `✓` done
- `✗` blocked
- `▸` section headers
- `├─ └─` tree structures
- `→` implications

No emoji. No slash commands. Everything is conversational.

### Conversation Context

Store last 15-20 messages in `conversations` table. Include as context in every LLM call so references like "move that one to done" resolve correctly.

## Worker Entry Points

**`fetch` handler** — Telegram webhook. Receives all message types, routes through pipeline.

**`scheduled` handler** — Cron trigger (every 5 min). Checks `schedules` table for due items, creates tasks, sends notifications, generates daily digest.

## Environment & Secrets

```toml
# wrangler.toml bindings
[[d1_databases]]
binding = "DB"

[ai]
binding = "AI"

# Secrets (set via wrangler secret put)
# TELEGRAM_BOT_TOKEN
# TELEGRAM_WEBHOOK_SECRET
# TELEGRAM_CHAT_ID
```

## Implementation Phases

1. **Phase 0** — Scaffolding: spec, skill, project structure, AGENT.md
2. **Phase 1** — Core: wrangler config, D1 schema, Telegram webhook, text pipeline
3. **Phase 2** — AI: triage extraction, NL query, status updates
4. **Phase 3** — Media: voice (Whisper), photos (Llama 4 Scout), links
5. **Phase 4** — Scheduler: cron triggers, recurring tasks, daily digest
6. **Phase 5** — Polish: proactive suggestions, edge cases, conversation UX

## Related Skills

- `cloudflare-deployment` — Wrangler commands, D1, Workers AI bindings
- `database-management` — SQL patterns and D1 specifics
- `javascript-testing` — Vitest for Worker testing
- `secrets-management` — Telegram bot token, webhook secret
