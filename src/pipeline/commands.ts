// Sift — Command Handler
// Handles slash commands for quick actions and help

import type { Env } from '../types';
import { getActiveTasks, getTasksByStatus, getTasksDueBefore } from '../db/tasks';
import { getActiveSchedules, formatScheduleList } from '../db/schedules';
import { formatKanban } from '../format/kanban';
import {
  getAIProvider,
  getAIModel,
  getVisionModel,
  setAIConfig,
  listAvailableModels,
  type AIProvider,
} from '../ai/provider';

/** Check if a message is a command */
export function isCommand(text: string): boolean {
  return /^\/\w+/.test(text.trim());
}

/** Route a command to its handler */
export async function handleCommand(env: Env, text: string): Promise<string> {
  const [command, ...args] = text.trim().split(/\s+/);
  const cmd = command?.toLowerCase();

  switch (cmd) {
    case '/start':
      return handleStart();
    case '/help':
      return handleHelp();
    case '/board':
      return handleBoard(env);
    case '/today':
      return handleToday(env);
    case '/schedules':
    case '/recurring':
      return handleSchedules(env);
    case '/stats':
      return handleStats(env);
    case '/model':
      return handleModel(env, args);
    default:
      return `Unknown command: ${command}\n\nTry /help to see available commands.`;
  }
}

/** /start - Welcome message and walkthrough */
function handleStart(): string {
  return [
    '✨ Welcome to Sift',
    '',
    'I turn brain dumps into organized tasks. No forms, no fuss—just talk to me.',
    '',
    '▸ How it works',
    '  Dump anything on your mind and I\'ll extract tasks, set priorities,',
    '  figure out due dates, and organize everything for you.',
    '',
    '▸ What you can send',
    '  • Text — "I need to fix the auth bug and call the dentist"',
    '  • Photos — screenshots, whiteboards, receipts',
    '  • Links — I\'ll summarize and extract tasks',
    '',
    '▸ Quick tips',
    '  → Mention timeframes: "by Friday", "next week", "tomorrow"',
    '  → I understand priority: "urgent", "when I have time", "someday"',
    '  → Set recurring: "every Monday, review the board"',
    '',
    '▸ Useful commands',
    '  /board — See your full task board',
    '  /today — What\'s due today',
    '  /help — Full command list',
    '',
    'Ready? Dump something and I\'ll sort it out.',
  ].join('\n');
}

/** /help - Full command reference */
function handleHelp(): string {
  return [
    '📚 Sift Commands',
    '',
    '▸ Task Management',
    '  /board — View your full kanban board',
    '  /today — See what\'s due today',
    '  /stats — Task statistics and velocity',
    '',
    '▸ Schedules',
    '  /schedules — List recurring tasks',
    '  /recurring — (same as /schedules)',
    '',
    '▸ Configuration',
    '  /model — Show current AI provider and model',
    '  /model set <provider>:<model> — Change AI model',
    '  /model list — List available models',
    '',
    '▸ Help',
    '  /start — Welcome guide and tips',
    '  /help — This command list',
    '',
    '▸ Natural language works too',
    '  "what\'s on my plate?" — same as /board',
    '  "show my recurring tasks" — same as /schedules',
    '  "mark X as done" — update a task',
    '',
    'Most of the time you don\'t need commands—just talk to me.',
  ].join('\n');
}

/** /board - Show full kanban board */
async function handleBoard(env: Env): Promise<string> {
  const tasks = await getActiveTasks(env.DB);

  if (tasks.length === 0) {
    return [
      '📋 Your Board',
      '',
      'Nothing here yet. Dump some tasks and I\'ll organize them.',
    ].join('\n');
  }

  const board = formatKanban(tasks);
  return `📋 Your Board\n\n${board}`;
}

/** /today - Show tasks due today */
async function handleToday(env: Env): Promise<string> {
  const today = new Date().toISOString().split('T')[0]!;
  const [dueToday, inProgress, overdue] = await Promise.all([
    getTasksDueBefore(env.DB, today),
    getTasksByStatus(env.DB, 'in_progress'),
    getTasksDueBefore(env.DB, today).then((tasks) =>
      tasks.filter((t) => t.due_date !== null && t.due_date < today)
    ),
  ]);

  const todayTasks = dueToday.filter(
    (t) => t.due_date === today && t.status !== 'done' && t.status !== 'archived'
  );
  const overdueTasks = overdue.filter(
    (t) => t.status !== 'done' && t.status !== 'archived'
  );

  const lines = ['📅 Today'];

  if (overdueTasks.length > 0) {
    lines.push('', '⚠ Overdue');
    for (const task of overdueTasks) {
      const symbol = task.priority === 'critical' || task.priority === 'high' ? '●' : '◐';
      lines.push(`  ${symbol} ${task.title}`);
    }
  }

  if (todayTasks.length > 0) {
    lines.push('', '▸ Due Today');
    for (const task of todayTasks) {
      const symbol = task.priority === 'critical' || task.priority === 'high' ? '●' : '◐';
      lines.push(`  ${symbol} ${task.title}`);
    }
  }

  if (inProgress.length > 0) {
    lines.push('', '▸ In Progress');
    for (const task of inProgress) {
      const symbol = task.priority === 'critical' || task.priority === 'high' ? '●' : '◐';
      lines.push(`  ${symbol} ${task.title}`);
    }
  }

  if (overdueTasks.length === 0 && todayTasks.length === 0) {
    lines.push('', 'Nothing due today.');
    if (inProgress.length === 0) {
      lines.push('You\'re all clear—pull something from /board or take a break.');
    }
  }

  return lines.join('\n');
}

/** /schedules - List recurring tasks */
async function handleSchedules(env: Env): Promise<string> {
  const schedules = await getActiveSchedules(env.DB);

  if (schedules.length === 0) {
    return [
      '🔁 Recurring Tasks',
      '',
      'No recurring tasks set up yet.',
      '',
      'Try: "every Monday at 9am, review the board"',
    ].join('\n');
  }

  return formatScheduleList(schedules);
}

/** /stats - Show task statistics */
async function handleStats(env: Env): Promise<string> {
  const tasks = await getActiveTasks(env.DB);

  const byStatus = tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const byPriority = tasks.reduce(
    (acc, task) => {
      acc[task.priority] = (acc[task.priority] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = tasks.length;
  const backlog = byStatus.backlog ?? 0;
  const todo = byStatus.todo ?? 0;
  const inProgress = byStatus.in_progress ?? 0;
  const review = byStatus.review ?? 0;
  const done = byStatus.done ?? 0;

  const critical = byPriority.critical ?? 0;
  const high = byPriority.high ?? 0;
  const medium = byPriority.medium ?? 0;
  const low = byPriority.low ?? 0;
  const someday = byPriority.someday ?? 0;

  return [
    '📊 Task Statistics',
    '',
    `▸ Total Active: ${total}`,
    '',
    '▸ By Status',
    `  Backlog: ${backlog}`,
    `  Todo: ${todo}`,
    `  In Progress: ${inProgress}`,
    `  Review: ${review}`,
    `  Done: ${done}`,
    '',
    '▸ By Priority',
    `  Critical: ${critical}`,
    `  High: ${high}`,
    `  Medium: ${medium}`,
    `  Low: ${low}`,
    `  Someday: ${someday}`,
  ].join('\n');
}

/** /model - Show or change AI model configuration */
async function handleModel(env: Env, args: string[]): Promise<string> {
  const subcommand = args[0]?.toLowerCase();

  // /model list - List available models
  if (subcommand === 'list') {
    return handleModelList();
  }

  // /model set <provider>:<model> - Set new model
  if (subcommand === 'set' && args[1]) {
    return handleModelSet(env, args[1]);
  }

  // /model - Show current configuration
  return handleModelShow(env);
}

/** Show current AI model configuration */
async function handleModelShow(env: Env): Promise<string> {
  const provider = await getAIProvider(env.DB);
  const model = await getAIModel(env.DB);
  const visionModel = await getVisionModel(env.DB);

  const lines = [
    '🤖 AI Configuration',
    '',
    `▸ Provider: ${provider}`,
    `▸ Model: ${model}`,
  ];

  if (provider === 'cloudflare') {
    lines.push(`▸ Vision Model: ${visionModel}`);
  }

  lines.push(
    '',
    'Use /model list to see available models',
    'Use /model set <provider>:<model> to change'
  );

  return lines.join('\n');
}

/** List available models */
function handleModelList(): string {
  const lines = [
    '🤖 Available Models',
    '',
    '▸ OpenRouter (Recommended)',
  ];

  const openrouterModels = listAvailableModels('openrouter');
  for (const [id, desc] of Object.entries(openrouterModels)) {
    lines.push(`  ${id}`);
    lines.push(`  └─ ${desc}`);
  }

  lines.push('', '▸ Cloudflare AI');

  const cloudflareModels = listAvailableModels('cloudflare');
  for (const [id, desc] of Object.entries(cloudflareModels)) {
    lines.push(`  ${id}`);
    lines.push(`  └─ ${desc}`);
  }

  lines.push(
    '',
    'Examples:',
    '  /model set openrouter:anthropic/claude-3.5-haiku',
    '  /model set cloudflare:llama-3.3-70b'
  );

  return lines.join('\n');
}

/** Set AI model */
async function handleModelSet(env: Env, modelSpec: string): Promise<string> {
  const [providerStr, model] = modelSpec.split(':');

  if (!providerStr || !model) {
    return 'Invalid format. Use: /model set <provider>:<model>\n\nExample: /model set openrouter:anthropic/claude-3.5-haiku';
  }

  const provider = providerStr.toLowerCase() as AIProvider;

  if (provider !== 'openrouter' && provider !== 'cloudflare') {
    return `Unknown provider: ${provider}\n\nAvailable providers: openrouter, cloudflare`;
  }

  // Validate OpenRouter API key is set
  if (provider === 'openrouter' && !env.OPENROUTER_API_KEY) {
    return [
      '⚠ OpenRouter API key not configured',
      '',
      'Set it up:',
      '  wrangler secret put OPENROUTER_API_KEY',
      '',
      'Or add to .dev.vars for local development',
    ].join('\n');
  }

  try {
    await setAIConfig(env.DB, provider, model);

    return [
      '✓ AI model updated',
      '',
      `▸ Provider: ${provider}`,
      `▸ Model: ${model}`,
      '',
      'New model will be used for all AI operations.',
    ].join('\n');
  } catch (err) {
    console.error('Failed to set AI model:', err);
    return 'Failed to update model configuration. Check logs for details.';
  }
}
