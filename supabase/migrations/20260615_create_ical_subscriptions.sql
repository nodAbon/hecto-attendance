-- SA_ical_subscriptions: private iCal subscription registry
CREATE TABLE IF NOT EXISTS SA_ical_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  label       VARCHAR(200) NOT NULL,
  depts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope       VARCHAR(50) NOT NULL DEFAULT 'leave-calendar',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

ALTER TABLE SA_ical_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_ical_subscriptions_admin"
  ON SA_ical_subscriptions
  FOR ALL
  USING (SA_is_admin())
  WITH CHECK (SA_is_admin());

CREATE INDEX IF NOT EXISTS idx_sa_ical_subscriptions_created_at
  ON SA_ical_subscriptions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sa_ical_subscriptions_active
  ON SA_ical_subscriptions (is_active, revoked_at);
