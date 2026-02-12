// Sift — Command Handler
// Handles slash commands for quick actions and help

import type { Env } from '../types';
import { getActiveTasks, getTasksByStatus, getTasksDueBefore } from '../db/tasks';
import { getActiveSchedules, formatScheduleList } from '../db/schedules';
import { formatKanban } from '../format/kanban';

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
