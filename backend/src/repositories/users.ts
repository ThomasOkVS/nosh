import type { Pool } from "pg";

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export async function createUser(pool: Pool, email: string, passwordHash: string): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, password_hash, created_at`,
    [email, passwordHash],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into users returned no row");
  }
  return toUser(row);
}

export async function findUserByEmail(pool: Pool, email: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function findUserById(pool: Pool, id: number): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, password_hash, created_at FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}
