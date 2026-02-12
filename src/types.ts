// Sift — Shared Type Definitions

// ── Cloudflare Worker Environment ──

export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_CHAT_ID: string;
}

// ── Database Types ──

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'archived';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'someday';
export type SourceType = 'text' | 'voice' | 'photo' | 'link';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  due_date: string | null;
  tags: string | null; // JSON array of strings
  source_type: SourceType;
  raw_input: string | null;
  ai_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  due_date?: string;
  tags?: string[];
  source_type: SourceType;
  raw_input?: string;
  ai_notes?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  due_date?: string | null;
  tags?: string[];
  ai_notes?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  messages: string; // JSON-encoded ConversationMessage[]
  created_at: string;
  updated_at: string;
}

export interface Dump {
  id: string;
  telegram_message_id: string | null;
  input_type: string;
  raw_content: string;
  processed: number;
  task_ids: string | null; // JSON array of task IDs
  created_at: string;
}

export interface Schedule {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: TaskPriority;
  tags: string | null;
  cron_expr: string;
  timezone: string;
  human_rule: string;
  auto_create: number;
  notify: number;
  template: string | null;
  active: number;
  next_fire: string;
  last_fired: string | null;
  fire_count: number;
  max_fires: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Telegram Types ──

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  photo?: TelegramPhotoSize[];
  caption?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  file_size?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

// ── AI Types ──

export type InputIntent = 'brain_dump' | 'query' | 'update' | 'chat' | 'schedule';

export interface ClassifiedInput {
  intent: InputIntent;
  raw_text: string;
}

export interface TriagedTask {
  title: string;
  description?: string;
  priority: TaskPriority;
  category?: string;
  due_date?: string;
  tags?: string[];
  ai_notes?: string;
}

export interface TriageResult {
  tasks: TriagedTask[];
  response: string;
}

export interface QueryResult {
  sql: string;
  response: string;
}

// ── AI Tool Calling Types ──

export interface AiToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolResult {
  name: string;
  result: string;
}
