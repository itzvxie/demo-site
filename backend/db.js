import pg from "pg";

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Add it to your environment (see .env.example).");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

const SCHEMA_SQL = `
  create extension if not exists pgcrypto;

  create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    first_name text,
    provider text not null,
    provider_account_id text,
    password_hash text,
    created_at timestamptz not null default now()
  );

  alter table users add column if not exists password_hash text;
  alter table users add column if not exists reset_token_hash text;
  alter table users add column if not exists reset_token_expires_at timestamptz;

  create table if not exists study_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    subject text not null,
    title text not null,
    source_type text not null,
    study_package jsonb not null,
    created_at timestamptz not null default now()
  );

  create index if not exists study_history_user_id_created_at_idx
    on study_history (user_id, created_at desc);

  -- The original text/file/YouTube URl a package was generated from, so a
  -- reopened chat can still request an output it wasn't originally given -
  -- nullable because entries saved before this column existed have none.
  alter table study_history add column if not exists source jsonb;
`;

export async function migrate() {
  await getPool().query(SCHEMA_SQL);
}

export async function findUserByEmail(email) {
  const result = await query("select * from users where email = $1", [email]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query("select * from users where id = $1", [id]);
  return result.rows[0] || null;
}

export async function updateUserFirstName(id, firstName) {
  const result = await query(
    "update users set first_name = $2 where id = $1 returning *",
    [id, firstName],
  );
  return result.rows[0] || null;
}

/**
 * Creates a brand-new password account. Returns null (instead of throwing)
 * when the email is already taken, via `on conflict do nothing` - the
 * caller turns that into a friendly "already have an account" message.
 */
export async function createUserWithPassword({ email, passwordHash, firstName }) {
  const result = await query(
    `insert into users (email, first_name, provider, password_hash)
     values ($1, $2, 'password', $3)
     on conflict (email) do nothing
     returning *`,
    [email, firstName || null, passwordHash],
  );
  return result.rows[0] || null;
}

export async function setPasswordResetToken(userId, tokenHash, expiresAt) {
  await query(
    "update users set reset_token_hash = $2, reset_token_expires_at = $3 where id = $1",
    [userId, tokenHash, expiresAt],
  );
}

/** Looks up a user by a hashed reset token, honoring expiry in the query itself. */
export async function findUserByResetTokenHash(tokenHash) {
  const result = await query(
    "select * from users where reset_token_hash = $1 and reset_token_expires_at > now()",
    [tokenHash],
  );
  return result.rows[0] || null;
}

/** Sets a new password and invalidates the reset token in one step, so a token can never be reused. */
export async function resetUserPassword(userId, passwordHash) {
  const result = await query(
    `update users
     set password_hash = $2, reset_token_hash = null, reset_token_expires_at = null
     where id = $1
     returning *`,
    [userId, passwordHash],
  );
  return result.rows[0] || null;
}

/** Newest-first, capped list of a user's saved study packages (list view only - no full package payload). */
export async function listHistoryForUser(userId, limit = 50) {
  const result = await query(
    `select id, subject, title, source_type, created_at
     from study_history
     where user_id = $1
     order by created_at desc
     limit $2`,
    [userId, limit],
  );
  return result.rows;
}

/** Scoped to the owning user, so one account can never fetch another's entry by guessing an id. */
export async function findHistoryEntry(id, userId) {
  const result = await query(
    "select * from study_history where id = $1 and user_id = $2",
    [id, userId],
  );
  return result.rows[0] || null;
}

export async function createHistoryEntry({ userId, subject, title, sourceType, studyPackage, source }) {
  const result = await query(
    `insert into study_history (user_id, subject, title, source_type, study_package, source)
     values ($1, $2, $3, $4, $5, $6)
     returning id, subject, title, source_type, created_at`,
    [userId, subject, title, sourceType, JSON.stringify(studyPackage), source ? JSON.stringify(source) : null],
  );
  return result.rows[0];
}

/** Overwrites a saved package (e.g. after adding a missing output to a chat still in view). */
export async function updateHistoryEntry(id, userId, studyPackage) {
  const result = await query(
    `update study_history
     set study_package = $3
     where id = $1 and user_id = $2
     returning id, subject, title, source_type, created_at`,
    [id, userId, JSON.stringify(studyPackage)],
  );
  return result.rows[0] || null;
}

export async function deleteHistoryEntry(id, userId) {
  const result = await query(
    "delete from study_history where id = $1 and user_id = $2 returning id",
    [id, userId],
  );
  return Boolean(result.rows[0]);
}

export async function upsertUser({ email, firstName, provider, providerAccountId }) {
  const result = await query(
    `insert into users (email, first_name, provider, provider_account_id)
     values ($1, $2, $3, $4)
     on conflict (email) do update
       set first_name = coalesce(users.first_name, excluded.first_name)
     returning *, (xmax = 0) as inserted`,
    [email, firstName || null, provider, providerAccountId || null],
  );
  return result.rows[0];
}
