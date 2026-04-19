import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function getDb() {
  const p = getPool();
  const client = await p.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS face_descriptors (
      id        SERIAL PRIMARY KEY,
      name      TEXT    NOT NULL,
      descriptor JSONB   NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  return client;
}

export default { getPool };
