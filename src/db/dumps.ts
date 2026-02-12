// Sift — Brain Dump Log Operations

import type { Dump } from '../types';

/** Log a brain dump */
export async function createDump(
  db: D1Database,
  input: {
    telegram_message_id?: string;
    input_type: string;
    raw_content: string;
  }
): Promise<Dump> {
  const result = await db
    .prepare(
      `INSERT INTO dumps (telegram_message_id, input_type, raw_content)
       VALUES (?, ?, ?)
       RETURNING *`
    )
    .bind(
      input.telegram_message_id ?? null,
      input.input_type,
      input.raw_content
    )
    .first<Dump>();

  if (!result) {
    throw new Error('Failed to create dump');
  }
  return result;
}

/** Mark a dump as processed and link task IDs */
export async function markDumpProcessed(
  db: D1Database,
  id: string,
  taskIds: string[]
): Promise<void> {
  await db
    .prepare(
      `UPDATE dumps
       SET processed = 1, task_ids = ?
       WHERE id = ?`
    )
    .bind(JSON.stringify(taskIds), id)
    .run();
}

/** Search raw dumps by content */
export async function searchDumps(
  db: D1Database,
  query: string
): Promise<Dump[]> {
  const pattern = `%${query}%`;
  const { results } = await db
    .prepare(
      `SELECT * FROM dumps
       WHERE raw_content LIKE ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .bind(pattern)
    .all<Dump>();
  return results;
}

/** Get recent unprocessed dumps */
export async function getUnprocessedDumps(db: D1Database): Promise<Dump[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM dumps
       WHERE processed = 0
       ORDER BY created_at DESC
       LIMIT 10`
    )
    .all<Dump>();
  return results;
}
