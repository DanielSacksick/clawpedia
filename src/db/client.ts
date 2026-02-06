import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add it to your .env file.');
}

const shouldUseSsl = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (error: Error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
