import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

let internalPool: Pool | null = null;

function getPool(): Pool {
  if (internalPool) {
    return internalPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Configure it in your environment.');
  }

  const shouldUseSsl = process.env.NODE_ENV === 'production';
  internalPool = new Pool({
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
  });

  internalPool.on('error', (error: Error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
  });

  return internalPool;
}

export const pool = {
  query: <T extends QueryResultRow = any>(text: string, values?: unknown[]) =>
    getPool().query<T>(text, values as any),
  connect: () => getPool().connect(),
  end: () => (internalPool ? internalPool.end() : Promise.resolve())
};
