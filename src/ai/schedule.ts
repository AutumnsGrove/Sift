// Sift — NL Schedule Creation
// Converts natural language recurrence descriptions to cron expressions

import type { Env, ConversationMessage } from '../types';
import { createSchedule } from '../db/schedules';
import { isValidCron } from '../scheduler/cron';
import { callAI } from './provider';

const SCHEDULE_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user wants to set up a recurring task or reminder.

Your job: Parse their natural language into a cron schedule.

Cron format: minute hour day-of-month month day-of-week
- Minute: 0-59
- Hour: 0-23
- Day of month: 1-31
- Month: 1-12
- Day of week: 0-6 (0=Sunday) or 1-5 for weekdays

Common patterns:
- "every morning" → "0 9 * * *" (9:00 AM daily)
- "every weekday morning" → "0 9 * * 1-5"
- "every Monday" → "0 9 * * 1" (Monday at 9 AM)
- "every Friday afternoon" → "0 14 * * 5" (Friday at 2 PM)
- "every day at 7:30" → "30 7 * * *"
- "every two weeks" → "0 9 * * 1" with max_fires note
- "every month on the 1st" → "0 9 1 * *"

Default time: 9:00 AM if no time specified.
Default timezone: America/New_York.

Respond with valid JSON only. No markdown, no code fences.

Response format:
{
  "title": "Short action-oriented title for the recurring task",
  "description": "Optional context",
  "cron_expr": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "human_rule": "weekdays at 9:00 AM ET",
  "priority": "medium",
  "category": "inferred category",
  "auto_create": true,
  "notify": true,
  "max_fires": null,
  "response": "Conversational confirmation. Use ✓ symbol. Include the schedule details using ▸ for each detail line."
}`;

/** Process a natural language schedule creation request */
export async function processScheduleCreation(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SCHEDULE_SYSTEM_PROMPT },
  ];

  for (const msg of conversationHistory.slice(-6)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: text });

  const response = await callAI(env, {
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    max_tokens: 512,
    temperature: 0.2,
  });

  return parseAndCreateSchedule(env, response.text, text);
}

async function parseAndCreateSchedule(
  env: Env,
  raw: string,
  originalText: string
): Promise<string> {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      title?: string;
      description?: string;
      cron_expr?: string;
      timezone?: string;
      human_rule?: string;
      priority?: string;
      category?: string;
      auto_create?: boolean;
      notify?: boolean;
      max_fires?: number | null;
      response?: string;
    };

    if (!parsed.title || !parsed.cron_expr || !parsed.human_rule) {
      return "I couldn't quite figure out the schedule from that. Could you try something like \"every Monday at 9am, remind me to review the board\"?";
    }

    if (!isValidCron(parsed.cron_expr)) {
      return "I generated an invalid cron expression. Could you try rephrasing the schedule?";
    }

    const validPriorities = ['critical', 'high', 'medium', 'low', 'someday'];
    const priority = validPriorities.includes(parsed.priority ?? '')
      ? (parsed.priority as 'critical' | 'high' | 'medium' | 'low' | 'someday')
      : 'medium';

    await createSchedule(env.DB, {
      title: String(parsed.title).slice(0, 200),
      description: parsed.description ? String(parsed.description).slice(0, 1000) : undefined,
      cron_expr: parsed.cron_expr,
      timezone: parsed.timezone ?? 'America/New_York',
      human_rule: String(parsed.human_rule).slice(0, 200),
      priority,
      category: parsed.category ? String(parsed.category).slice(0, 50) : undefined,
      auto_create: parsed.auto_create !== false,
      notify: parsed.notify !== false,
      max_fires: typeof parsed.max_fires === 'number' ? parsed.max_fires : undefined,
    });

    return parsed.response ?? `✓ Scheduled: ${parsed.title}\n▸ Repeats: ${parsed.human_rule}\n▸ Auto-creates a task + notifies you`;
  } catch {
    return "Something went wrong setting up that schedule. Could you try again?";
  }
}
