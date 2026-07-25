import { pool } from './pool.js';

export async function createPost({ tenantId, content, platform, scheduledAt }) {
  const { rows } = await pool.query(
    `INSERT INTO posts (tenant_id, content, platform, scheduled_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenantId, content, platform, scheduledAt]
  );
  return rows[0];
}

export async function getPostById(id) {
  const { rows } = await pool.query(`SELECT * FROM posts WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listPostsByTenant(tenantId) {
  const { rows } = await pool.query(
    `SELECT * FROM posts WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

// Find posts that are due, WITHOUT locking them yet — just candidates.
export async function findDuePosts(limit = 20) {
  const { rows } = await pool.query(
    `SELECT id FROM posts
     WHERE status = 'PENDING' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// THE IDEMPOTENCY GUARANTEE:
// This UPDATE only succeeds if the row is still PENDING at the moment it runs.
// Postgres takes a row lock during the UPDATE, so two workers racing on the
// same id can't both succeed — whichever commits first wins, the other's
// WHERE clause fails to match (status is no longer PENDING) and it gets 0 rows back.
// No read-then-write gap, because the check and the write are the same statement.
export async function claimPost(id) {
  const { rows } = await pool.query(
    `UPDATE posts
     SET status = 'QUEUED', locked_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id]
  );
  return rows[0] || null; // null means someone else already claimed it
}

export async function markPublished(id) {
  const { rows } = await pool.query(
    `UPDATE posts
     SET status = 'PUBLISHED', published_at = NOW()
     WHERE id = $1 AND status = 'QUEUED'
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

export async function markFailed(id, reason) {
  const { rows } = await pool.query(
    `UPDATE posts
     SET status = 'FAILED', failure_reason = $2
     WHERE id = $1 AND status = 'QUEUED'
     RETURNING *`,
    [id, reason]
  );
  return rows[0] || null;
}
