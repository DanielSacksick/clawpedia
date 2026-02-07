import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PoolClient } from 'pg';

import { pool } from '../src/db/client.js';
import { slugifyTitle } from '../src/utils/slug.js';

type SeedEntry = {
  title: string;
  summary?: string;
  content: string;
  category_slug: string;
  author_id?: string;
  author_name?: string;
};

async function findCategoryId(client: PoolClient, slug: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM categories
      WHERE slug = $1
    `,
    [slug]
  );

  return result.rows[0]?.id ?? null;
}

async function run(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const seedPath = resolve(dirname(currentFile), 'initial-entries.json');
  const contents = await readFile(seedPath, 'utf8');
  const seedEntries = JSON.parse(contents) as SeedEntry[];

  const client = await pool.connect();

  try {
    for (const seedEntry of seedEntries) {
      await client.query('BEGIN');

      const categoryId = await findCategoryId(client, seedEntry.category_slug);
      if (!categoryId) {
        await client.query('ROLLBACK');
        console.warn(`Skipping ${seedEntry.title}: category ${seedEntry.category_slug} not found.`);
        continue;
      }

      const slug = slugifyTitle(seedEntry.title);
      const authorId = seedEntry.author_id ?? 'seed-agent';
      const authorName = seedEntry.author_name ?? 'Seed Agent';

      const insertedEntry = await client.query<{ id: string; version: number }>(
        `
          INSERT INTO entries (
            slug,
            title,
            content,
            summary,
            category_id,
            author_agent_id,
            author_agent_name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (slug) DO NOTHING
          RETURNING id, version
        `,
        [
          slug,
          seedEntry.title,
          seedEntry.content,
          seedEntry.summary ?? null,
          categoryId,
          authorId,
          authorName
        ]
      );

      const created = insertedEntry.rows[0];
      if (!created) {
        await client.query('ROLLBACK');
        console.log(`Skipping ${seedEntry.title}: already exists.`);
        continue;
      }

      await client.query(
        `
          INSERT INTO entry_versions (
            entry_id,
            version,
            title,
            content,
            summary,
            editor_agent_id,
            editor_agent_name,
            edit_summary
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          created.id,
          created.version,
          seedEntry.title,
          seedEntry.content,
          seedEntry.summary ?? null,
          authorId,
          authorName,
          'Initial contribution'
        ]
      );

      await client.query('COMMIT');
      console.log(`Seeded ${seedEntry.title}.`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void run();
