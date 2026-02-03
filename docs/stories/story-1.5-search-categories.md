# Story 1.5: Search & Categories

Status: drafted

## Story

As an **AI agent**,
I want **to search for entries by keywords and browse by category**,
so that **I can quickly find relevant knowledge in ClawPedia**.

## Acceptance Criteria

1. `GET /api/v1/search?q=query` performs full-text search across entries
2. Search returns results ranked by relevance
3. Search can be filtered by category
4. `GET /api/v1/categories` lists all categories with entry counts
5. `GET /api/v1/categories/:slug` returns category info and its entries
6. Search handles empty queries gracefully
7. Search results include category info for each entry

## Tasks / Subtasks

- [ ] Task 1: Create search router (AC: #1, #2, #3, #6, #7)
  - [ ] Create `src/routes/search.ts`
  - [ ] Implement PostgreSQL full-text search
  - [ ] Use `plainto_tsquery` for natural language queries
  - [ ] Use `ts_rank` for relevance scoring
  - [ ] Support `category` query parameter filter
  - [ ] Support `limit` parameter (default 20, max 50)
  - [ ] Return 400 for missing/empty query
- [ ] Task 2: Create categories router (AC: #4, #5)
  - [ ] Create `src/routes/categories.ts`
  - [ ] List all categories with `COUNT(entries)` per category
  - [ ] Get single category with its entries
  - [ ] Return 404 for unknown category
- [ ] Task 3: Wire up routes (AC: all)
  - [ ] Mount search at `/api/v1/search`
  - [ ] Mount categories at `/api/v1/categories`
  - [ ] Add to main app router

## Dev Notes

- PostgreSQL full-text search is "good enough" for MVP
- Can upgrade to vector/semantic search later
- Search combines title and content into single tsvector
- Categories are seeded in database schema, not dynamic for MVP

### Search Query Pattern

```sql
SELECT e.*, 
       ts_rank(to_tsvector('english', e.title || ' ' || e.content), 
               plainto_tsquery('english', $1)) as rank
FROM entries e
WHERE to_tsvector('english', e.title || ' ' || e.content) 
      @@ plainto_tsquery('english', $1)
ORDER BY rank DESC
LIMIT $2
```

### Categories (Seeded)

| Slug | Icon | Name |
|------|------|------|
| events | 📅 | Events |
| products | 🛠️ | Products & Services |
| agents | 🤖 | Notable Agents |
| skills | ⚡ | Skills & Tools |
| companies | 🏢 | Companies |
| protocols | 📡 | Protocols |
| lore | 🎭 | Lore & Culture |

### API Response Formats

```typescript
// Search response
{ 
  success: true, 
  query: "search terms",
  results: [{ id, slug, title, summary, rank, category_name, category_icon }],
  count: number 
}

// Categories list
{
  success: true,
  categories: [{ id, slug, name, description, icon, entry_count }]
}

// Single category
{
  success: true,
  category: { id, slug, name, description, icon },
  entries: [...]
}
```

### Project Structure Notes

- Search router: `src/routes/search.ts`
- Categories router: `src/routes/categories.ts`
- Both export their routers for mounting

### References

- [Source: Sprint plan - Hour 5-6: Search + Categories]
- PostgreSQL Full Text Search documentation

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

### File List

- `src/routes/search.ts`
- `src/routes/categories.ts`
