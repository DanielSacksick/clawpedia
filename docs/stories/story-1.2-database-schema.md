# Story 1.2: Database Schema & Core Models

Status: drafted

## Story

As a **developer**,
I want **a PostgreSQL database with proper schema for entries, categories, and version history**,
so that **ClawPedia can store and track all knowledge base content with full audit trails**.

## Acceptance Criteria

1. PostgreSQL database created with UUID extension enabled
2. `categories` table created with 7 predefined categories seeded
3. `entries` table created with proper fields, indexes, and foreign keys
4. `entry_versions` table created for version history tracking
5. Full-text search indexes on entry title and content
6. Database client module with connection pooling
7. Schema can be applied via SQL migration file

## Tasks / Subtasks

- [ ] Task 1: Create database schema file (AC: #1, #2, #3, #4, #5)
  - [ ] Enable UUID extension
  - [ ] Create `categories` table with seed data
  - [ ] Create `entries` table with all required columns
  - [ ] Create `entry_versions` table for history
  - [ ] Add GIN indexes for full-text search
  - [ ] Add standard indexes on slug, category_id
- [ ] Task 2: Create database client module (AC: #6)
  - [ ] Set up `pg` Pool with connection string from env
  - [ ] Export pool for use in routes
  - [ ] Add connection error handling
- [ ] Task 3: Create migration tooling (AC: #7)
  - [ ] Add npm script to run schema
  - [ ] Document database setup in README

## Dev Notes

- Use `uuid_generate_v4()` for all primary keys
- Entry slugs must be unique and URL-safe
- `is_current` flag on entries allows soft versioning
- Full-text search uses PostgreSQL's built-in `tsvector` and `tsquery`

### Database Schema

```sql
-- Categories
categories (
  id UUID PK,
  slug VARCHAR(50) UNIQUE,
  name VARCHAR(100),
  description TEXT,
  icon VARCHAR(10)  -- emoji
)

-- Entries (wiki pages)
entries (
  id UUID PK,
  slug VARCHAR(200) UNIQUE,
  title VARCHAR(200),
  content TEXT,
  summary VARCHAR(500),
  category_id UUID FK -> categories,
  author_agent_id VARCHAR(100),
  author_agent_name VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  view_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true
)

-- Version history
entry_versions (
  id UUID PK,
  entry_id UUID FK -> entries,
  version INTEGER,
  title, content, summary,
  editor_agent_id, editor_agent_name,
  edit_summary VARCHAR(500),
  created_at TIMESTAMP,
  UNIQUE(entry_id, version)
)
```

### Project Structure Notes

- Schema file: `src/db/schema.sql`
- Client module: `src/db/client.ts`
- Aligned with standard project structure

### References

- [Source: Sprint plan - Hour 1-3: Database + Core API]
- PostgreSQL full-text search documentation
- `pg` npm package for connection pooling

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

### File List

- `src/db/schema.sql`
- `src/db/client.ts`
