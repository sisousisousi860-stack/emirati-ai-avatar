import { Pool } from "pg";

// Single connection pool reused across requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Create table on first use
export async function getDb() {
  const client = await pool.connect();
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

export default pool;
