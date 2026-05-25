-- Run this in the Supabase SQL Editor:
-- https://app.supabase.com → Your Project → SQL Editor

CREATE TABLE IF NOT EXISTS inquiries (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  name        text        NOT NULL,
  phone       text        NOT NULL,
  email       text,
  address     text,
  city        text,
  province    text,
  postcode    text,
  message     text,
  status      text        DEFAULT 'new',
  
  -- Input Constraints
  CONSTRAINT phone_format CHECK (phone ~ '^\d{10}$'),
  CONSTRAINT email_format CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT postcode_format CHECK (postcode IS NULL OR postcode ~ '^[A-Z]\d[A-Z] \d[A-Z]\d$')
);

-- Restrict direct public access; the API uses the service role key
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Admin policies: authenticated users (logged-in admins) can read and update
CREATE POLICY "admin_select" ON inquiries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_update" ON inquiries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ── Admin user setup ──────────────────────────────────────────
-- After running this file, create your admin account in Supabase:
-- Authentication → Users → Add user
-- Use a strong password. This is the login for admin.html.
