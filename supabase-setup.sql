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

-- Admin policies: allow anon role (used by admin.html) to read and update
CREATE POLICY "admin_select" ON inquiries
  FOR SELECT TO anon USING (true);

CREATE POLICY "admin_update" ON inquiries
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── Admin user setup ──────────────────────────────────────────
-- After running this file, create your admin account in Supabase:
-- Authentication → Users → Add user
-- Use a strong password. This is the login for admin.html.

-- ── Users table (admin credentials) ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  username   text        NOT NULL UNIQUE,
  password   text        NOT NULL
);

-- RLS: no public access; only service role can read this table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Seed admin account
INSERT INTO users (username, password)
VALUES ('curoofing.ca@gmail.com', 'cur+pwadmin')
ON CONFLICT (username) DO NOTHING;

-- RPC function called by admin.html to verify credentials
-- SECURITY DEFINER allows it to read the users table using the anon key
CREATE OR REPLACE FUNCTION check_admin_login(p_username text, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE username = p_username AND password = p_password
  );
$$;

GRANT EXECUTE ON FUNCTION check_admin_login(text, text) TO anon;
