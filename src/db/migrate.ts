import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './client.js';

async function runMigration(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const schemaPath = resolve(dirname(currentFile), 'schema.sql');
  const schema = await readFile(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Schema applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Schema migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void runMigration();
