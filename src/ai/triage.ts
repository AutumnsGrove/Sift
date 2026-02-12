// Sift — Brain Dump Triage Engine
// Extracts structured tasks from freeform text using Workers AI

import type { Env, ConversationMessage, TriagedTask, TriageResult } from '../types';

const TRIAGE_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user just sent a brain dump — freeform text containing one or more things they need to do.

Your job:
1. Extract EVERY actionable task from the text. Be thorough — if something sounds like it needs doing, capture it.
2. For each task, determine:
   - title: concise, action-oriented (3-8 words)
   - description: relevant context from the dump (optional, only if there's useful detail)
   - priority: critical | high | medium | low | someday
   - category: infer from context (e.g., "dev", "health", "personal", "finance", "work")
   - due_date: extract if mentioned, infer if implied (ISO 8601 format YYYY-MM-DD). Use null if no date.
   - tags: relevant keywords as an array (optional)
   - ai_notes: your reasoning or suggestions (optional, e.g., "sounds urgent", "might want to break this down")

Priority guide:
- critical: blocking everything else, needs immediate action
- high: important and time-sensitive
- medium: should be done soon but not urgent
- low: nice to do when there's time
- someday: aspirational, no timeline

Respond with valid JSON only. No markdown, no code fences, no explanation.

Response format:
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "priority": "...",
      "category": "...",
      "due_date": "...",
      "tags": ["..."],
      "ai_notes": "..."
    }
  ],
  "response": "A conversational response summarizing what you extracted. Use Unicode symbols: ● (critical/high) ◐ (medium) ○ (low/someday). Be warm and concise."
}`;

/** Run the triage pipeline on a brain dump */
export async function triageBrainDump(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<TriageResult> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
  ];

  // Include recent conversation for context
  for (const msg of conversationHistory.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: text });

  const response = await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    {
      messages,
      max_tokens: 2048,
      temperature: 0.3,
    }
  );

  const responseText = typeof response === 'string'
    ? response
    : 'response' in response
      ? (response.response ?? '')
      : '';

  return parseTriage(responseText, text);
}

/** Parse the LLM triage response into structured data */
function parseTriage(raw: string, originalText: string): TriageResult {
  try {
    // Try to extract JSON from the response (handle markdown fences if present)
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks?: TriagedTask[];
      response?: string;
    };

    const tasks: TriagedTask[] = (parsed.tasks ?? []).map((t) => ({
      title: String(t.title ?? '').slice(0, 200),
      description: t.description ? String(t.description).slice(0, 1000) : undefined,
      priority: validatePriority(t.priority),
      category: t.category ? String(t.category).slice(0, 50) : undefined,
      due_date: t.due_date ? String(t.due_date) : undefined,
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 10) : undefined,
      ai_notes: t.ai_notes ? String(t.ai_notes).slice(0, 500) : undefined,
    }));

    return {
      tasks,
      response: parsed.response ?? formatDefaultResponse(tasks),
    };
  } catch {
    // If parsing fails, create a single task from the raw text
    return {
      tasks: [
        {
          title: originalText.slice(0, 100),
          priority: 'medium',
          category: undefined,
          ai_notes: 'Auto-captured: AI triage parsing failed, saved as-is.',
        },
      ],
      response: `Got it — saved that as a task. I had trouble parsing the details, so you might want to review it.`,
    };
  }
}

function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

function formatDefaultResponse(tasks: TriagedTask[]): string {
  if (tasks.length === 0) return "I couldn't pull any tasks from that. Could you rephrase?";

  const prioritySymbol = (p: string) => {
    switch (p) {
      case 'critical':
      case 'high':
        return '●';
      case 'medium':
        return '◐';
      default:
        return '○';
    }
  };

  const lines = tasks.map(
    (t) =>
      `${prioritySymbol(t.priority)} ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`
  );

  return `Got it, I pulled ${tasks.length} task${tasks.length > 1 ? 's' : ''} from that:\n\n${lines.join('\n')}\n\nAll saved. Anything to adjust?`;
}
