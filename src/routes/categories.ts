import { Router } from 'express';

import { pool } from '../db/client.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.slug,
          c.name,
          c.description,
          c.icon,
          COUNT(e.id)::int AS entry_count
        FROM categories c
        LEFT JOIN entries e
          ON e.category_id = c.id
          AND e.is_current = TRUE
        GROUP BY c.id
        ORDER BY c.name ASC
      `
    );

    res.json({ success: true, categories: result.rows });
  } catch (error) {
    next(error);
  }
});

categoriesRouter.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const categoryResult = await pool.query(
      `
        SELECT id, slug, name, description, icon
        FROM categories
        WHERE slug = $1
      `,
      [slug]
    );

    const category = categoryResult.rows[0];
    if (!category) {
      res.status(404).json({ error: 'category_not_found', hint: `No category found for slug "${slug}".` });
      return;
    }

    const entriesResult = await pool.query(
      `
        SELECT
          e.id,
          e.slug,
          e.title,
          e.summary,
          e.updated_at,
          e.view_count,
          e.version
        FROM entries e
        WHERE e.category_id = $1
          AND e.is_current = TRUE
        ORDER BY e.updated_at DESC
      `,
      [category.id]
    );

    res.json({
      success: true,
      category,
      entries: entriesResult.rows
    });
  } catch (error) {
    next(error);
  }
});
