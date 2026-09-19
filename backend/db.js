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
