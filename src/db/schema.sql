-- Sift D1 Schema
-- Core tables for task management, brain dumps, conversations, and schedules

-- Core task table
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'archived')),
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('critical', 'high', 'medium', 'low', 'someday')),
  category    TEXT,
  due_date    TEXT,
  tags        TEXT,
  source_type TEXT NOT NULL DEFAULT 'text'
                CHECK (source_type IN ('text', 'voice', 'photo', 'link')),
  raw_input   TEXT,
  ai_notes    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category) WHERE category IS NOT NULL;

-- Conversation context for multi-turn interactions
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  messages    TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Brain dump log
CREATE TABLE IF NOT EXISTS dumps (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  telegram_message_id TEXT,
  input_type          TEXT NOT NULL,
  raw_content         TEXT NOT NULL,
  processed           INTEGER NOT NULL DEFAULT 0,
  task_ids            TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recurring schedules
CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  priority      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('critical', 'high', 'medium', 'low', 'someday')),
  tags          TEXT,
  cron_expr     TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  human_rule    TEXT NOT NULL,
  auto_create   INTEGER NOT NULL DEFAULT 1,
  notify        INTEGER NOT NULL DEFAULT 1,
  template      TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  next_fire     TEXT NOT NULL,
  last_fired    TEXT,
  fire_count    INTEGER NOT NULL DEFAULT 0,
  max_fires     INTEGER,
  expires_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_next ON schedules(next_fire) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active);

-- Configuration settings (key-value store)
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
