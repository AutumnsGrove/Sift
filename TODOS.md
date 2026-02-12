# Sift — TODOs

## Phase 0: Scaffolding (Current)
- [x] Format sift-spec.md with Grove spec standards
- [x] Create sift-development skill
- [x] Update AGENT.md with project details
- [x] Update TODOS.md with implementation phases
- [x] Update README.md for Sift
- [ ] Commit and push phase 0

## Phase 1: Core Infrastructure
- [ ] Initialize TypeScript project (package.json, tsconfig.json)
- [ ] Create wrangler.toml with D1 binding, AI binding, cron triggers
- [ ] Write D1 schema (schema.sql) with all 4 tables + indexes
- [ ] Implement Telegram Bot API helpers (telegram.ts)
- [ ] Build fetch handler entry point (index.ts) with webhook verification
- [ ] Implement basic text message pipeline (router.ts, text.ts)
- [ ] Set up local development with wrangler dev

## Phase 2: AI Triage + Query
- [ ] Implement brain dump triage (ai/triage.ts) with structured task extraction
- [ ] Implement NL-to-SQL query engine (ai/query.ts)
- [ ] Implement task update handler with fuzzy matching
- [ ] Build task CRUD operations (db/tasks.ts, db/dumps.ts, db/conversations.ts)
- [ ] Implement conversation context management
- [ ] Build response formatting (format/kanban.ts, format/list.ts, format/card.ts)

## Phase 3: Media Processing
- [ ] Implement voice note pipeline (pipeline/voice.ts) with Whisper transcription
- [ ] Implement photo pipeline (pipeline/vision.ts) with Llama 4 Scout
- [ ] Implement link pipeline (pipeline/links.ts) with URL fetch + summarize
- [ ] Add source type tags in responses ([Voice note], [From image], [From link])

## Phase 4: Scheduler + Digest
- [ ] Implement cron expression parser (scheduler/cron.ts)
- [ ] Build schedule runner (scheduler/runner.ts) for the scheduled handler
- [ ] Implement schedule CRUD (db/schedules.ts) with next-fire precomputation
- [ ] Build daily digest generation (ai/digest.ts, scheduler/digest.ts, format/digest.ts)
- [ ] Add NL schedule creation ("remind me every Monday...")

## Phase 5: Polish
- [ ] Implement proactive suggestion engine (ai/suggest.ts)
- [ ] Handle edge cases (timezone, missed fires, overdue items)
- [ ] Add inline keyboard confirmations for updates
- [ ] Test end-to-end conversation flows
- [ ] Deploy to Cloudflare Workers
- [ ] Register Telegram webhook

## Future (V2)
- [ ] MCP server for task access from Claude/agents
- [ ] Export (JSON/CSV backup)
- [ ] Sub-tasks ("break this down")
- [ ] Habit tracking with streak/consistency
