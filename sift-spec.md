# Sift

**A fully conversational Telegram bot that turns brain dumps into organized, triaged tasks — powered by Cloudflare Workers, D1, and Workers AI.**

-----

## Concept

Sift is a personal triage agent. You open Telegram, dump whatever’s on your mind — text, voice notes, photos, links — and Sift processes it into structured, prioritized tasks stored in a D1 database. All interaction is natural language. No slash commands, no forms, no context switching. You talk to it like a person and it manages your kanban board for you.

-----

## Architecture

```
┌──────────────┐
│   Telegram   │  text / voice / photo / link
│   (You)      │────────────────────────────────┐
└──────────────┘                                │
                                                ▼
                                   ┌─────────────────────┐
                                   │   CF Worker: Sift    │
                                   │   (webhook handler)  │
                                   └──────────┬──────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                     │
                        ▼                     ▼                     ▼
              ┌──────────────┐    ┌──────────────────┐   ┌──────────────┐
              │  Workers AI  │    │   Workers AI      │   │  Workers AI  │
              │  Whisper     │    │   Llama 3.3 70B   │   │  Llama 4     │
              │  (audio)     │    │   (triage + NL)   │   │  Scout       │
              └──────┬───────┘    └────────┬─────────┘   └──────┬───────┘
                     │                     │                     │
                     └─────────────────────┼─────────────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │   D1 (SQLite)│
                                    │   tasks db   │
                                    └─────────────┘
```

### Components

**1. Telegram Webhook Handler (CF Worker — `fetch` handler)**
The main entry point for user interaction. Receives all message types from Telegram, classifies the input type, routes to the appropriate Workers AI model, and sends responses back via the Telegram Bot API. Single Worker, single deploy.

**1b. Schedule Runner (CF Worker — `scheduled` handler)**
Same Worker, different entry point. Fires every 5 minutes via Cron Trigger, checks the `schedules` table for anything due, creates tasks and/or sends notifications. Also handles the daily digest.

**2. Workers AI Models**

- **`@cf/openai/whisper`** — Transcribes voice notes to text. Free, runs on CF edge.
- **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** — The brain. Handles triage extraction, natural language query → D1 SQL, board management, proactive suggestions. 70B parameter model with strong reasoning and instruction following.
- **`@cf/meta/llama-4-scout-17b-16e-instruct`** — Native multimodal model for processing photos/screenshots. Handles vision + text in a single pass without a separate vision adapter.

**3. D1 Database**
Single database, simple schema. SQLite under the hood so queries are fast and free.

**4. Telegram Bot API**
Outbound only — formatted messages with inline keyboards for quick confirmations. No webhooks to manage beyond the initial setup.

-----

## D1 Schema

```sql
-- Core task table
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'archived')),
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('critical', 'high', 'medium', 'low', 'someday')),
  category    TEXT,            -- freeform: 'grove', 'personal', 'finance', 'health', etc.
  due_date    TEXT,            -- ISO 8601 date or datetime
  tags        TEXT,            -- JSON array of strings
  source_type TEXT NOT NULL    -- 'text', 'voice', 'photo', 'link'
                CHECK (source_type IN ('text', 'voice', 'photo', 'link')),
  raw_input   TEXT,            -- original message content / transcription
  ai_notes    TEXT,            -- AI-generated context, suggestions, reasoning
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- For fast queries by status (kanban columns)
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority, status);
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_category ON tasks(category) WHERE category IS NOT NULL;

-- Conversation context for multi-turn interactions
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  messages    TEXT NOT NULL,   -- JSON array of {role, content, timestamp}
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Brain dump log — keeps the raw stream before triage
CREATE TABLE dumps (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  telegram_message_id TEXT,
  input_type  TEXT NOT NULL,
  raw_content TEXT NOT NULL,   -- original text, transcription, image description, etc.
  processed   INTEGER NOT NULL DEFAULT 0,
  task_ids    TEXT,            -- JSON array of task IDs extracted from this dump
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Why three tables?

**`tasks`** is the kanban board — your source of truth for what needs doing.

**`dumps`** is the raw capture log — everything you’ve ever thrown at Sift, even if it didn’t produce a task. Useful for “what was that thing I mentioned last Tuesday?” queries.

**`conversations`** holds recent conversation context so the LLM can handle multi-turn interactions without you repeating yourself. Pruned to keep only the last ~20 messages.

-----

## Input Processing Pipeline

### Text Messages

```
User sends text
  → Classify intent (new task? query? update? just chatting?)
  → If new task/brain dump:
      → Extract: title, description, priority, category, due date, tags
      → Store in dumps + create task(s)
      → Respond with triage summary + proactive suggestions
  → If query:
      → Generate D1 query from natural language
      → Format results as kanban view / list / summary
  → If update:
      → Fuzzy match task by title/description
      → Apply update (status change, priority change, etc.)
      → Confirm with inline keyboard
```

### Voice Notes

```
User sends voice note
  → Download audio from Telegram
  → Whisper transcription via Workers AI
  → Feed transcription into text pipeline above
  → Include "[♪ Voice note]" tag in response
```

### Photos/Screenshots

```
User sends photo
  → Download image from Telegram
  → Llama 4 Scout processes image + text prompt natively
  → If screenshot of a to-do / email / message:
      → Extract actionable items
  → If whiteboard / handwritten notes:
      → OCR + extract tasks
  → Feed extracted text into triage pipeline
  → Include "[▦ From image]" tag
```

### Links

```
User sends URL
  → Fetch page content (respect robots.txt, use CF fetch)
  → Summarize via LLM
  → Extract any actionable items
  → Store link + summary as task or reference
  → Include "[⇗ From link]" tag
```

-----

## Conversation Design

### Brain Dump → Triage

```
You:   "ok so I need to finish the heartwood auth migration
        before friday, also remember to call the psychiatrist
        about the mood stabilizer thing, and at some point I
        should look into whether D1 supports triggers"

Sift:  Got it, I pulled 3 tasks from that:

        ● Heartwood auth migration
          Due: Friday Feb 14 · Priority: High · Category: Grove
          → This is launch-critical. Want me to break it down?

        ◐ Call psychiatrist re: mood stabilizer
          Due: This week · Priority: Medium · Category: Health
          → Seems time-sensitive. Should I bump to high?

        ○ Research D1 trigger support
          Priority: Low · Category: Dev/Research
          → Parked in backlog for when you have bandwidth.

        All three saved. Anything to adjust?
```

### Querying the Board

```
You:   "what's on my plate today"

Sift:  Here's your active board:

        ▸ In Progress (2)
        ├─ ● Heartwood auth migration (due Fri)
        └─ ◐ Fix Stripe webhook handler (due today)

        ▸ Todo (3)
        ├─ ◐ Call psychiatrist
        ├─ ◐ Write beta announcement post
        └─ ○ Update Grove pricing page

        ▸ Overdue (1)
        └─ ● Submit tax extension — was due yesterday

        That tax extension is overdue. Want to deal with
        that first, or should I snooze it?
```

### Status Updates

```
You:   "the stripe thing is done"

Sift:  ✓ Moved "Fix Stripe webhook handler" → Done

        Nice, that clears your today queue. The auth
        migration is your next high-priority item.
        Want to pull anything else into in-progress?
```

### Proactive Suggestions

The LLM system prompt instructs Sift to:

- Flag tasks approaching their due date
- Suggest priority bumps when context implies urgency
- Offer to break large tasks into subtasks
- Notice patterns (“you’ve added 4 Grove tasks today — want to batch those into a sprint?”)
- Gently surface forgotten backlog items (“this has been in backlog for 2 weeks — still relevant?”)

-----

## Workers AI System Prompt (Core)

```
You are Sift, a personal task triage assistant. You communicate
through Telegram with a single user. Your job is to:

1. CAPTURE: When the user brain-dumps thoughts, extract every
   actionable task. Be thorough — if something sounds like it
   needs doing, capture it.

2. TRIAGE: For each task, determine:
   - title (concise, action-oriented)
   - description (context from the dump)
   - priority: critical/high/medium/low/someday
   - category (infer from context)
   - due_date (extract if mentioned, infer if implied)
   - tags (relevant keywords)

3. QUERY: When the user asks about their tasks, generate
   appropriate SQL queries against the D1 database and format
   results conversationally.

4. UPDATE: When the user wants to change a task, fuzzy-match
   by title/description and apply the update.

5. SUGGEST: Proactively notice patterns, approaching deadlines,
   overdue items, and forgotten tasks. Be helpful but not
   annoying — one suggestion per interaction max.

Response style:
- Concise, warm, slightly informal
- Use Unicode symbols for visual scanning: ● (critical/high) ◐ (medium) ○ (low/someday) ✓ (done) ✗ (blocked)
- Use ▸ for section headers, ├─ └─ for tree structures, → for implications
- Avoid emoji — use them only when no suitable Unicode equivalent exists
- Never ask the user to use commands — everything is natural language
- When uncertain, confirm with the user rather than guessing
- Format task lists for easy scanning in Telegram (use monospace where helpful)

You have access to the following tools:
- query_tasks(sql): Execute a SELECT query against the tasks table
- create_task(task): Insert a new task
- update_task(id, changes): Update an existing task
- search_dumps(query): Search the raw brain dump history
```

-----

## Technical Implementation Details

### Worker Structure

```
sift/
├── wrangler.toml          # CF Worker config + D1 binding + cron triggers
├── src/
│   ├── index.ts           # Webhook handler + scheduled handler entry points
│   ├── telegram.ts        # Telegram Bot API helpers
│   ├── pipeline/
│   │   ├── router.ts      # Classify input type + intent
│   │   ├── text.ts        # Text processing
│   │   ├── voice.ts       # Whisper transcription
│   │   ├── vision.ts      # Image processing (Llama 4 Scout)
│   │   └── links.ts       # URL fetch + summarize
│   ├── ai/
│   │   ├── triage.ts      # Brain dump → structured tasks
│   │   ├── query.ts       # Natural language → SQL
│   │   ├── suggest.ts     # Proactive suggestion engine
│   │   └── digest.ts      # Daily digest generation prompt + formatting
│   ├── scheduler/
│   │   ├── cron.ts        # Cron expression parser + next-fire computation
│   │   ├── runner.ts      # Scheduled handler: check due schedules, fire them
│   │   └── digest.ts      # Digest-specific logic: query aggregation + send
│   ├── db/
│   │   ├── schema.sql     # D1 schema (tasks + dumps + conversations + schedules)
│   │   ├── tasks.ts       # Task CRUD operations
│   │   ├── dumps.ts       # Dump log operations
│   │   ├── conversations.ts # Conversation context
│   │   └── schedules.ts   # Schedule CRUD + next-fire updates
│   └── format/
│       ├── kanban.ts      # Format tasks as kanban-style text
│       ├── list.ts        # Format as priority/date lists
│       ├── card.ts        # Single task detail view
│       └── digest.ts      # Digest message formatting
├── package.json
└── tsconfig.json
```

### wrangler.toml

```toml
name = "sift"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "sift-tasks"
database_id = "<your-d1-id>"

[ai]
binding = "AI"

[vars]
TELEGRAM_BOT_TOKEN = ""  # set via wrangler secret
TELEGRAM_WEBHOOK_SECRET = ""
TELEGRAM_CHAT_ID = ""    # your personal chat ID

[triggers]
crons = ["*/5 * * * *"]  # schedule checker runs every 5 minutes
```

### Key Technical Considerations

**Workers AI Limits:** Llama 3.3 70B is more expensive per neuron than smaller models, but at personal usage levels (dozens of interactions/day) you’re looking at pennies. No concern here.

**Whisper:** Free on Workers AI. Audio files up to 30 seconds process well; longer files may need chunking.

**Llama 4 Scout (Vision):** Native multimodal — accepts image + text prompt in a single call. No need for a separate OCR step or vision adapter. Send the base64 image directly with instructions to extract tasks.

**D1 Limits:** Free tier gives 5M rows read/day, 100K rows written/day, 5GB storage. More than enough for personal task management.

**Telegram File Downloads:** Voice notes and photos need to be fetched from Telegram’s servers before processing. The Worker fetches the file URL via `getFile` API, then downloads the binary. Keep in mind CF Workers has a 30-second CPU time limit (more than enough for this).

**Conversation Context:** Store the last 15-20 messages in the conversations table. Include this as context in every LLM call so Sift understands “move that one to done” (referring to a task mentioned 3 messages ago).

-----

## Deployment Steps

1. **Create Telegram Bot:** Talk to @BotFather, `/newbot`, get token
1. **Create D1 Database:** `wrangler d1 create sift-tasks`
1. **Run Schema:** `wrangler d1 execute sift-tasks --file=src/db/schema.sql`
1. **Set Secrets:** `wrangler secret put TELEGRAM_BOT_TOKEN`
1. **Deploy:** `wrangler deploy`
1. **Register Webhook:** Hit `https://sift.<your-subdomain>.workers.dev/register` to set the Telegram webhook
1. **Start dumping thoughts**

-----

## Scheduled & Recurring Tasks

### Concept

You say things like “remind me every Monday to review the board” or “every two weeks, bug me about checking the Grove analytics” and Sift creates a recurring schedule. Under the hood this is powered by **Cloudflare Cron Triggers** — the same Worker that handles Telegram webhooks also runs on a schedule, checks what’s due, and fires off Telegram messages.

### Schema Addition

```sql
CREATE TABLE schedules (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  priority      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('critical', 'high', 'medium', 'low', 'someday')),
  tags          TEXT,               -- JSON array

  -- Recurrence definition
  cron_expr     TEXT NOT NULL,       -- standard cron: "0 9 * * 1" = every Monday 9am
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  human_rule    TEXT NOT NULL,       -- "every Monday at 9:00 AM" (LLM-generated, for display)

  -- Behavior
  auto_create   INTEGER NOT NULL DEFAULT 1,  -- 1 = auto-create task on trigger
  notify        INTEGER NOT NULL DEFAULT 1,  -- 1 = send Telegram message on trigger
  template      TEXT,                -- optional: task description template with {date} etc.

  -- Lifecycle
  active        INTEGER NOT NULL DEFAULT 1,
  next_fire     TEXT NOT NULL,       -- precomputed next fire time (ISO 8601)
  last_fired    TEXT,
  fire_count    INTEGER NOT NULL DEFAULT 0,
  max_fires     INTEGER,            -- NULL = unlimited, set for "do this 5 times then stop"
  expires_at    TEXT,               -- NULL = never expires

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedules_next ON schedules(next_fire) WHERE active = 1;
CREATE INDEX idx_schedules_active ON schedules(active);
```

### How It Works

**1. Natural language → Cron expression**

The LLM parses recurrence from conversational input and generates both a cron expression and a human-readable rule:

```
You:   "every weekday morning, remind me to check Grove error logs"

Sift:  ✓ Scheduled: Check Grove error logs
       ▸ Repeats: weekdays at 9:00 AM ET
       ▸ Next: tomorrow (Wed Feb 12)
       ▸ Auto-creates a task each morning + notifies you

       Want to adjust the time or priority?
```

The LLM outputs structured JSON:

```json
{
  "title": "Check Grove error logs",
  "cron_expr": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "human_rule": "weekdays at 9:00 AM ET",
  "priority": "medium",
  "category": "Grove",
  "auto_create": true,
  "notify": true
}
```

**2. Cron Trigger fires the Worker**

In `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # check every 5 minutes
```

The Worker’s `scheduled` handler:

```
scheduled event fires (every 5 min)
  → Query: SELECT * FROM schedules WHERE active = 1 AND next_fire <= now()
  → For each due schedule:
      → If auto_create: INSERT new task with status 'todo'
      → If notify: send Telegram message
      → Update last_fired, fire_count, compute next_fire
      → If max_fires reached or expired: set active = 0
```

**3. Precomputed `next_fire`**

Rather than parsing cron expressions on every check, we precompute `next_fire` whenever a schedule is created or fires. This makes the scheduled query a simple datetime comparison — fast and index-friendly on D1.

The cron → next datetime computation happens in the Worker using a lightweight cron parser (e.g., `cron-parser` npm package, ~3KB).

### Conversation Patterns

```
You:   "every friday afternoon remind me to do a weekly review"

Sift:  ✓ Scheduled: Weekly review
       ▸ Repeats: Fridays at 2:00 PM ET
       ▸ Creates a task + notifies you each week
```

```
You:   "show me my recurring stuff"

Sift:  You have 3 active schedules:

       ▸ Check Grove error logs
         weekdays at 9:00 AM · next: tomorrow
       ▸ Weekly review
         Fridays at 2:00 PM · next: Fri Feb 14
       ▸ Water plants
         every 3 days at 10:00 AM · next: Thu Feb 13
```

```
You:   "pause the error logs one, I'm taking a break"

Sift:  ✓ Paused "Check Grove error logs"
       It won't fire until you reactivate it.
```

```
You:   "remind me to take out the trash every Tuesday
        but only for the next 8 weeks"

Sift:  ✓ Scheduled: Take out the trash
       ▸ Repeats: Tuesdays at 9:00 AM ET
       ▸ Runs 8 times, then auto-stops
       ▸ Final fire: April 7
```

### Edge Cases

- **Timezone handling:** All schedules store an explicit timezone. Cron is evaluated in that timezone, so “every morning at 9am” stays at 9am even through DST transitions.
- **Missed fires:** If the Worker was somehow delayed and a schedule was due 15 minutes ago, it still fires. The `next_fire` recalculation skips past any missed windows to the genuine next occurrence.
- **Multiple fires in one check:** The 5-minute interval means at most one fire per schedule per check. If a schedule somehow has two pending fires (shouldn’t happen with precomputed `next_fire`), it processes one and the next check catches the other.

-----

## Daily Digest

### Concept

Every morning, Sift sends you an unprompted Telegram message summarizing your day: what’s due, what’s overdue, what’s in progress, and any proactive observations. It’s your morning briefing without having to ask.

### Implementation

The daily digest runs on the same Cron Trigger infrastructure as scheduled tasks. It’s essentially a built-in schedule that can’t be deleted, only configured.

**Dedicated cron (separate from the 5-min schedule checker):**

```toml
[triggers]
crons = ["*/5 * * * *", "0 9 * * *"]  # schedule check + daily digest at 9am UTC
```

Or better — make the digest time configurable and handle it as part of the 5-minute schedule check with a system-level schedule row:

```sql
-- Inserted on first deploy, user can update the time
INSERT INTO schedules (
  id, title, cron_expr, timezone, human_rule,
  auto_create, notify, active, next_fire, category
) VALUES (
  '_digest', 'Daily Digest', '0 9 * * *', 'America/New_York',
  'every day at 9:00 AM ET',
  0, 1, 1, '...', '_system'
);
```

This way the digest is just another schedule row — the user can say “move my morning digest to 7:30” and Sift updates the cron expression naturally.

### Digest Generation Pipeline

```
Cron fires for _digest schedule
  → Query D1 for:
      ├─ tasks WHERE due_date = today AND status != 'done'
      ├─ tasks WHERE due_date < today AND status NOT IN ('done', 'archived')
      ├─ tasks WHERE status = 'in_progress'
      ├─ tasks WHERE status = 'todo' ORDER BY priority, created_at LIMIT 5
      └─ schedules WHERE next_fire between now and end_of_day
  → Feed all results to Llama 3.3 with digest prompt
  → LLM generates a natural, opinionated morning briefing
  → Send via Telegram
```

### Digest System Prompt

```
You are generating a daily morning digest for the user's task board.
Be concise but opinionated. Don't just list — prioritize, suggest,
and call out anything concerning (overdue items, too much WIP, etc.).

Structure:
1. Lead with the most important thing (highest priority due today, or worst overdue item)
2. Quick summary of today's commitments
3. What's in progress (keep WIP awareness high)
4. One proactive suggestion (clear old backlog, re-prioritize something, take a break if overloaded)

Keep it tight — this should be scannable in 15 seconds. Use the
standard Unicode symbol system for priority.

If there's genuinely nothing pressing, say so briefly and
encourage the user. Don't manufacture urgency.
```

### Example Digests

**Busy day:**

```
Sift:  ─── Morning Digest · Wed Feb 12 ───

       ⚠ Overdue
       └─ ● Submit tax extension (2 days overdue)

       ▸ Due Today
       ├─ ● Finalize Heartwood auth flow
       └─ ◐ Write beta invite email copy

       ▸ In Progress
       ├─ ● Heartwood auth migration
       └─ ◐ Stripe webhook error handling

       ▸ Coming Up
       └─ ○ Weekly review (Fri)

       The tax extension has been sitting for 2 days.
       Might be worth 10 minutes to knock it out before
       you dive into the auth work.
```

**Light day:**

```
Sift:  ─── Morning Digest · Thu Feb 13 ───

       Nothing due today. You have 2 items in progress:
       ├─ ● Heartwood auth migration
       └─ ◐ Stripe webhook error handling

       Good day to make a dent in the auth migration
       or pull something from your backlog (you have
       7 items parked there).
```

**Overloaded:**

```
Sift:  ─── Morning Digest · Fri Feb 14 ───

       You have 6 items due today and 3 in progress.
       That's a lot of WIP. Here's what I'd focus on:

       ▸ Must ship (launch day)
       ├─ ● Heartwood auth migration
       ├─ ● Beta invite emails
       └─ ● Grove landing page final review

       ▸ Can probably slip
       ├─ ◐ Update pricing page copy
       ├─ ○ Research D1 triggers
       └─ ○ Organize Obsidian vault

       Consider moving the bottom 3 to next week.
       Launch day — keep the scope tight.
```

### Configuration via Conversation

```
You:   "move my morning digest to 7:30"

Sift:  ✓ Digest now fires at 7:30 AM ET every day.
       Tomorrow's will arrive at 7:30.
```

```
You:   "skip the digest tomorrow, I'm sleeping in"

Sift:  ✓ Skipping tomorrow's digest. It'll resume
       Saturday morning.
```

```
You:   "add my recurring tasks to the digest"

Sift:  ✓ The digest will now include any scheduled
       tasks firing today.
```

-----

## V2 Roadmap: MCP Integration

### Concept

Expose Sift’s entire task system as an **MCP (Model Context Protocol) server** so that Claude, other AI agents, or any MCP-compatible client can read, query, create, and update tasks programmatically. This turns Sift from a personal Telegram bot into a composable productivity primitive.

### Why This Matters

Right now Sift has one interface: Telegram. With MCP, your tasks become accessible from anywhere:

- **Claude (claude.ai or Claude Code)** can check your task board mid-conversation: “What’s on Autumn’s plate today?” → Sift MCP → live task data
- **Grove ecosystem agents** could create tasks when they detect issues: deploy failure → auto-create high-priority task in Sift
- **Other MCP clients** (VS Code extensions, custom tools) get native access to your task system
- **Agent-to-agent workflows**: a research agent finishes work → creates a “review research on X” task in Sift → you see it in your next digest

### Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Claude / Agent  │────▶│  Sift MCP Server │────▶│  D1 Database │
│  (MCP Client)    │◀────│  (CF Worker)     │◀────│  (tasks,     │
└──────────────────┘     └──────────────────┘     │   schedules) │
                                                   └──────────────┘
         ┌──────────────┐        │
         │  Telegram Bot │◀───────┘  (same D1, same data)
         │  (existing)   │
         └──────────────┘
```

The MCP server is a separate CF Worker (or a route on the existing one) that speaks the MCP protocol over SSE. It shares the same D1 database, so anything created via MCP shows up in Telegram and vice versa.

### Planned MCP Tools

```
sift_list_tasks
  Filter tasks by status, priority, category, due date range.
  Returns structured task objects.

sift_get_task
  Get full details of a single task by ID or fuzzy title match.

sift_create_task
  Create a new task with title, description, priority, category,
  due date, tags. Skips the NL triage — accepts structured input.

sift_update_task
  Update any field on a task: status, priority, due date, etc.

sift_search
  Full-text search across tasks and raw brain dumps.
  "What did I say about the auth migration last week?"

sift_get_board
  Returns the full kanban board state: all tasks grouped by
  status column. Designed for dashboard rendering.

sift_list_schedules
  List all active recurring tasks and their next fire times.

sift_create_schedule
  Create a new recurring task from structured input.

sift_brain_dump
  Accept raw text and run it through the full triage pipeline,
  just like sending a Telegram message. Returns extracted tasks.
  Useful for agents that want to delegate task creation.
```

### MCP Resources

```
sift://board
  Live kanban board state (subscribable for real-time updates)

sift://tasks/{id}
  Individual task details

sift://digest
  Today's digest content (same as the morning Telegram message)

sift://stats
  Task velocity, completion rate, category breakdown
```

### Authentication

Since this is a personal single-user system, MCP auth can be simple:

- **Bearer token** stored as a CF Worker secret
- MCP clients include the token in their connection
- Optionally: restrict to specific CF Access policies if exposing publicly

### Implementation Notes

- The MCP server should use the **Cloudflare MCP protocol** (SSE transport) since you’re already in the CF ecosystem
- Reuse all the D1 query logic from the Telegram bot — the MCP tools are thin wrappers around the same CRUD operations
- The `sift_brain_dump` tool is the interesting one: it calls the same Llama 3.3 triage pipeline, meaning any MCP client gets the same smart extraction you get in Telegram
- Consider adding **MCP notifications** so connected clients get pinged when tasks are created/updated (useful for dashboard UIs)

### V2 Stretch Goals

- **Bidirectional sync with Grove:** if a Grove deploy fails, an agent creates a Sift task; when you mark it done in Sift, it updates a status somewhere in Grove
- **Claude memory bridge:** Sift MCP feeds task context into Claude conversations so Claude always knows what you’re working on without you explaining
- **Multi-user:** if Sift ever grows beyond personal use, the MCP layer is where auth and permissions would live
- **Webhook outbound:** fire webhooks when tasks change state, enabling integrations with anything that accepts webhooks (GitHub Issues, Discord, etc.)

-----

## Future Enhancements (Beyond V2)

- **Export** — dump all tasks as JSON/CSV for backup
- **Calendar integration** — sync due dates with Google Calendar via API
- **Sub-tasks** — break down large tasks with “break this down”
- **Multiple boards** — separate personal vs. Grove vs. health contexts
- **Web dashboard** — eventual React UI if you outgrow Telegram’s formatting
- **Location-based reminders** — “remind me about X when I’m near Rev Coffee” (requires Telegram location sharing)
- **Habit tracking** — recurring tasks that track streak/consistency over time

-----

## Cost

|Component                 |Free Tier        |Your Usage          |Monthly Cost   |
|--------------------------|-----------------|--------------------|---------------|
|CF Worker                 |100K requests/day|~50-100/day         |**$0**         |
|D1                        |5M reads/day, 5GB|Minimal             |**$0**         |
|Workers AI (Llama 3.3 70B)|10K neurons/day  |~50-100 interactions|**~$1-5**      |
|Workers AI (Llama 4 Scout)|10K neurons/day  |A few/day           |**~$0.10**     |
|Workers AI (Whisper)      |Free             |A few/day           |**$0**         |
|Telegram Bot API          |Free             |Unlimited           |**$0**         |
|**Total**                 |                 |                    |**~$1-5/month**|

Essentially free. Heavy usage days might spike slightly but you’d have to really try to spend more than $5/month.
