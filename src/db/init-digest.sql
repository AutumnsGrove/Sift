-- Initialize the daily digest schedule (run once after schema creation)
-- This creates a system schedule that fires every day at 9:00 AM ET

INSERT OR IGNORE INTO schedules (
  id,
  title,
  description,
  category,
  priority,
  cron_expr,
  timezone,
  human_rule,
  auto_create,
  notify,
  active,
  next_fire
) VALUES (
  '_digest',
  'Daily Digest',
  'Morning task board summary',
  '_system',
  'medium',
  '0 9 * * *',
  'America/New_York',
  'every day at 9:00 AM ET',
  0,
  1,
  1,
  datetime('now', 'localtime', 'start of day', '+1 day', '+9 hours')
);
