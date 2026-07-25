CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  content        TEXT NOT NULL,
  platform       TEXT NOT NULL,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','QUEUED','PUBLISHED','FAILED')),
  locked_at      TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker's poll query hits this directly: "give me PENDING posts due now"
CREATE INDEX IF NOT EXISTS idx_posts_due
  ON posts (scheduled_at)
  WHERE status = 'PENDING';

-- List endpoint filters by tenant constantly
CREATE INDEX IF NOT EXISTS idx_posts_tenant
  ON posts (tenant_id, created_at DESC);
