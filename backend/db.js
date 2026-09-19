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
    created_at timestamptz not null default now()
  );

  create table if not exists login_codes (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    attempts integer not null default 0,
    created_at timestamptz not null default now()
  );

  create index if not exists login_codes_email_idx on login_codes (email, created_at desc);
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

export async function findRecentLoginCode(email) {
  const result = await query(
    "select * from login_codes where email = $1 order by created_at desc limit 1",
    [email],
  );
  return result.rows[0] || null;
}

export async function createLoginCode({ email, codeHash, expiresAt }) {
  const result = await query(
    `insert into login_codes (email, code_hash, expires_at)
     values ($1, $2, $3)
     returning *`,
    [email, codeHash, expiresAt],
  );
  return result.rows[0];
}

export async function consumeLoginCode(id) {
  await query("update login_codes set consumed_at = now() where id = $1", [id]);
}

export async function incrementLoginCodeAttempts(id) {
  const result = await query(
    "update login_codes set attempts = attempts + 1 where id = $1 returning attempts",
    [id],
  );
  return result.rows[0]?.attempts ?? 0;
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
