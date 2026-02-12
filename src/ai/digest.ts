// Sift — Daily Digest AI Generation
// Generates an opinionated morning briefing from task data

import type { Env, Task, Schedule } from '../types';
import { callAI } from './provider';

const DIGEST_SYSTEM_PROMPT = `You are generating a daily morning digest for the user's task board.
Be concise but opinionated. Don't just list — prioritize, suggest,
and call out anything concerning (overdue items, too much WIP, etc.).

Structure:
1. Lead with the most important thing (highest priority due today, or worst overdue item)
2. Quick summary of today's commitments
3. What's in progress (keep WIP awareness high)
4. One proactive suggestion (clear old backlog, re-prioritize something, take a break if overloaded)

Keep it tight — this should be scannable in 15 seconds. Use the
standard Unicode symbol system for priority: ● (critical/high) ◐ (medium) ○ (low/someday)
Use ▸ for section headers, ├─ └─ for tree structures, → for implications.

If there's genuinely nothing pressing, say so briefly and encourage the user.
Don't manufacture urgency.

Respond with the digest text directly — no JSON, no code fences. Just the formatted message.`;

export interface DigestData {
  dueToday: Task[];
  overdue: Task[];
  inProgress: Task[];
  topTodo: Task[];
  schedulesToday: Schedule[];
  totalActive: number;
}

/** Generate the digest message using AI */
export async function generateDigest(env: Env, data: DigestData): Promise<string> {
  const today = new Date().toISOString().split('T')[0]!;

  const context = buildDigestContext(data, today);

  // If there's truly nothing, skip the AI call
  if (
    data.dueToday.length === 0 &&
    data.overdue.length === 0 &&
    data.inProgress.length === 0 &&
    data.topTodo.length === 0
  ) {
    return formatEmptyDigest(today);
  }

  const messages = [
    { role: 'system', content: DIGEST_SYSTEM_PROMPT },
    { role: 'user', content: context },
  ];

  const response = await callAI(env, {
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    max_tokens: 1024,
    temperature: 0.4,
  });

  if (!response.text.trim()) {
    return formatFallbackDigest(data, today);
  }

  // Prepend the header
  return `─── Morning Digest · ${formatDate(today)} ───\n\n${response.text.trim()}`;
}

/** Build the context string for the AI */
function buildDigestContext(data: DigestData, today: string): string {
  const sections: string[] = [`Today is ${today}. Here's the user's task board state:`];

  if (data.overdue.length > 0) {
    sections.push(`\nOVERDUE (${data.overdue.length}):`);
    for (const t of data.overdue) {
      sections.push(`  - [${t.priority}] ${t.title} (due ${t.due_date})`);
    }
  }

  if (data.dueToday.length > 0) {
    sections.push(`\nDUE TODAY (${data.dueToday.length}):`);
    for (const t of data.dueToday) {
      sections.push(`  - [${t.priority}] ${t.title}`);
    }
  }

  if (data.inProgress.length > 0) {
    sections.push(`\nIN PROGRESS (${data.inProgress.length}):`);
    for (const t of data.inProgress) {
      sections.push(`  - [${t.priority}] ${t.title}`);
    }
  }

  if (data.topTodo.length > 0) {
    sections.push(`\nTOP TODO (${data.topTodo.length}):`);
    for (const t of data.topTodo) {
      sections.push(`  - [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`);
    }
  }

  if (data.schedulesToday.length > 0) {
    sections.push(`\nSCHEDULED TODAY (${data.schedulesToday.length}):`);
    for (const s of data.schedulesToday) {
      sections.push(`  - ${s.title} (${s.human_rule})`);
    }
  }

  sections.push(`\nTotal active tasks: ${data.totalActive}`);

  return sections.join('\n');
}

function formatEmptyDigest(today: string): string {
  return [
    `─── Morning Digest · ${formatDate(today)} ───`,
    '',
    'Nothing due today. No items in progress.',
    '',
    "Your board is clear — good time to pull something",
    "from your backlog or enjoy the breathing room.",
  ].join('\n');
}

/** Fallback when AI fails */
function formatFallbackDigest(data: DigestData, today: string): string {
  const lines: string[] = [`─── Morning Digest · ${formatDate(today)} ───`];

  if (data.overdue.length > 0) {
    lines.push('', `⚠ Overdue (${data.overdue.length})`);
    for (const t of data.overdue) {
      lines.push(`└─ ● ${t.title} (due ${t.due_date})`);
    }
  }

  if (data.dueToday.length > 0) {
    lines.push('', `▸ Due Today (${data.dueToday.length})`);
    for (const t of data.dueToday) {
      const sym = t.priority === 'critical' || t.priority === 'high' ? '●' : '◐';
      lines.push(`├─ ${sym} ${t.title}`);
    }
  }

  if (data.inProgress.length > 0) {
    lines.push('', `▸ In Progress (${data.inProgress.length})`);
    for (const t of data.inProgress) {
      const sym = t.priority === 'critical' || t.priority === 'high' ? '●' : '◐';
      lines.push(`├─ ${sym} ${t.title}`);
    }
  }

  return lines.join('\n');
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}
