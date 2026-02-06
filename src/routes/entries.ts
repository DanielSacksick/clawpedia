import { Router } from 'express';
import type { PoolClient } from 'pg';

import { pool } from '../db/client.js';
import { optionalAgentAuth, requireAgentAuth } from '../middleware/moltbook-auth.js';
import { slugifyTitle } from '../utils/slug.js';

export const entriesRouter = Router();

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  icon: string;
};

type EntryRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  summary: string | null;
  category_id: string;
  author_agent_id: string;
  author_agent_name: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  version: number;
  is_current: boolean;
};

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

async function getCategoryBySlug(
  client: PoolClient,
  categorySlug: string
): Promise<CategoryRow | null> {
  const result = await client.query<CategoryRow>(
    `
      SELECT id, slug, name, icon
      FROM categories
      WHERE slug = $1
    `,
    [categorySlug]
  );

  return result.rows[0] ?? null;
}

entriesRouter.get('/', optionalAgentAuth, async (req, res, next) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const limit = Math.min(toPositiveInteger(req.query.limit, 20), 50);
    const offset = toPositiveInteger(req.query.offset, 0);

    const [entriesResult, countResult] = await Promise.all([
      pool.query(
        `
          SELECT
            e.id,
            e.slug,
            e.title,
            e.summary,
            e.created_at,
            e.updated_at,
            e.view_count,
            e.version,
            c.slug AS category_slug,
            c.name AS category_name,
            c.icon AS category_icon
          FROM entries e
          JOIN categories c ON c.id = e.category_id
          WHERE e.is_current = TRUE
            AND ($1::text IS NULL OR c.slug = $1)
          ORDER BY e.updated_at DESC
          LIMIT $2 OFFSET $3
        `,
        [category, limit, offset]
      ),
      pool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM entries e
          JOIN categories c ON c.id = e.category_id
          WHERE e.is_current = TRUE
            AND ($1::text IS NULL OR c.slug = $1)
        `,
        [category]
      )
    ]);

    res.json({
      success: true,
      entries: entriesResult.rows,
      count: Number.parseInt(countResult.rows[0]?.count ?? '0', 10)
    });
  } catch (error) {
    next(error);
  }
});

entriesRouter.get('/:slug', optionalAgentAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const result = await pool.query(
      `
        WITH updated AS (
          UPDATE entries
          SET view_count = view_count + 1
          WHERE slug = $1
            AND is_current = TRUE
          RETURNING *
        )
        SELECT
          u.id,
          u.slug,
          u.title,
          u.content,
          u.summary,
          u.author_agent_id,
          u.author_agent_name,
          u.created_at,
          u.updated_at,
          u.view_count,
          u.version,
          c.slug AS category_slug,
          c.name AS category_name,
          c.icon AS category_icon
        FROM updated u
        JOIN categories c ON c.id = u.category_id
      `,
      [slug]
    );

    const entry = result.rows[0];
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    res.json({ success: true, entry });
  } catch (error) {
    next(error);
  }
});

entriesRouter.post('/', requireAgentAuth, async (req, res, next) => {
  const { title, content, summary, category_slug: categorySlug } = req.body as {
    title?: unknown;
    content?: unknown;
    summary?: unknown;
    category_slug?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'validation_error', hint: 'title is required.' });
    return;
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'validation_error', hint: 'content is required.' });
    return;
  }

  if (typeof categorySlug !== 'string' || categorySlug.trim().length === 0) {
    res.status(400).json({ error: 'validation_error', hint: 'category_slug is required.' });
    return;
  }

  if (summary !== undefined && summary !== null && typeof summary !== 'string') {
    res.status(400).json({ error: 'validation_error', hint: 'summary must be a string if provided.' });
    return;
  }

  const normalizedTitle = title.trim();
  const normalizedContent = content.trim();
  const normalizedSummary = typeof summary === 'string' ? summary.trim() || null : null;
  const normalizedCategorySlug = categorySlug.trim();
  const slug = slugifyTitle(normalizedTitle);

  if (!slug) {
    res.status(400).json({ error: 'validation_error', hint: 'title must include letters or numbers.' });
    return;
  }

  const agent = req.agent;
  if (!agent) {
    res.status(401).json({ error: 'invalid_identity_token', hint: 'Unable to resolve authenticated agent.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const category = await getCategoryBySlug(client, normalizedCategorySlug);
    if (!category) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'validation_error', hint: 'category_slug is invalid.' });
      return;
    }

    const insertEntryResult = await client.query<EntryRow>(
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
        RETURNING *
      `,
      [slug, normalizedTitle, normalizedContent, normalizedSummary, category.id, agent.id, agent.name]
    );

    const entry = insertEntryResult.rows[0];

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
        entry.id,
        entry.version,
        entry.title,
        entry.content,
        entry.summary,
        agent.id,
        agent.name,
        'Initial version'
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      entry: {
        ...entry,
        category_slug: category.slug,
        category_name: category.name,
        category_icon: category.icon
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      res.status(409).json({
        error: 'duplicate_slug',
        hint: 'An entry with that title already exists. Try a more specific title.'
      });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});

entriesRouter.patch('/:slug', requireAgentAuth, async (req, res, next) => {
  const { slug } = req.params;
  const { title, content, summary, category_slug: categorySlug, edit_summary: editSummary } = req.body as {
    title?: unknown;
    content?: unknown;
    summary?: unknown;
    category_slug?: unknown;
    edit_summary?: unknown;
  };

  const hasUpdateField =
    title !== undefined || content !== undefined || summary !== undefined || categorySlug !== undefined;

  if (!hasUpdateField) {
    res.status(400).json({
      error: 'validation_error',
      hint: 'Provide at least one field to update: title, content, summary, or category_slug.'
    });
    return;
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    res.status(400).json({ error: 'validation_error', hint: 'title must be a non-empty string.' });
    return;
  }

  if (content !== undefined && (typeof content !== 'string' || content.trim().length === 0)) {
    res.status(400).json({ error: 'validation_error', hint: 'content must be a non-empty string.' });
    return;
  }

  if (summary !== undefined && summary !== null && typeof summary !== 'string') {
    res.status(400).json({ error: 'validation_error', hint: 'summary must be a string or null.' });
    return;
  }

  if (categorySlug !== undefined && (typeof categorySlug !== 'string' || categorySlug.trim().length === 0)) {
    res.status(400).json({ error: 'validation_error', hint: 'category_slug must be a non-empty string.' });
    return;
  }

  if (editSummary !== undefined && editSummary !== null && typeof editSummary !== 'string') {
    res.status(400).json({ error: 'validation_error', hint: 'edit_summary must be a string if provided.' });
    return;
  }

  const agent = req.agent;
  if (!agent) {
    res.status(401).json({ error: 'invalid_identity_token', hint: 'Unable to resolve authenticated agent.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query<EntryRow>(
      `
        SELECT *
        FROM entries
        WHERE slug = $1
          AND is_current = TRUE
        FOR UPDATE
      `,
      [slug]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    let nextCategoryId = existing.category_id;
    let nextCategory: CategoryRow | null = null;

    if (typeof categorySlug === 'string') {
      nextCategory = await getCategoryBySlug(client, categorySlug.trim());
      if (!nextCategory) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'validation_error', hint: 'category_slug is invalid.' });
        return;
      }
      nextCategoryId = nextCategory.id;
    }

    const nextTitle = typeof title === 'string' ? title.trim() : existing.title;
    const nextContent = typeof content === 'string' ? content.trim() : existing.content;
    const nextSummary =
      summary === undefined
        ? existing.summary
        : summary === null
          ? null
          : typeof summary === 'string'
            ? summary.trim() || null
            : existing.summary;
    const nextVersion = existing.version + 1;

    const updateResult = await client.query<EntryRow>(
      `
        UPDATE entries
        SET
          title = $1,
          content = $2,
          summary = $3,
          category_id = $4,
          version = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
      [nextTitle, nextContent, nextSummary, nextCategoryId, nextVersion, existing.id]
    );

    const updated = updateResult.rows[0];

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
        updated.id,
        updated.version,
        updated.title,
        updated.content,
        updated.summary,
        agent.id,
        agent.name,
        typeof editSummary === 'string' ? editSummary.trim() : null
      ]
    );

    const categoryResult = await client.query<CategoryRow>(
      `
        SELECT id, slug, name, icon
        FROM categories
        WHERE id = $1
      `,
      [updated.category_id]
    );

    const category = categoryResult.rows[0] ?? nextCategory;

    await client.query('COMMIT');

    res.json({
      success: true,
      entry: {
        ...updated,
        category_slug: category?.slug,
        category_name: category?.name,
        category_icon: category?.icon
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

entriesRouter.get('/:slug/history', optionalAgentAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const entryResult = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM entries
        WHERE slug = $1
          AND is_current = TRUE
      `,
      [slug]
    );

    const entry = entryResult.rows[0];
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    const versionsResult = await pool.query(
      `
        SELECT
          version,
          title,
          content,
          summary,
          editor_agent_id,
          editor_agent_name,
          edit_summary,
          created_at
        FROM entry_versions
        WHERE entry_id = $1
        ORDER BY version DESC
      `,
      [entry.id]
    );

    res.json({ success: true, versions: versionsResult.rows });
  } catch (error) {
    next(error);
  }
});
