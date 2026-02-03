# Story 1.1: Project Setup & Infrastructure

Status: drafted

## Story

As a **developer**,
I want **a properly configured Node.js/TypeScript project with all dependencies and tooling**,
so that **I can begin implementing the ClawPedia API with a solid foundation**.

## Acceptance Criteria

1. Project initialized with `package.json` containing all required dependencies
2. TypeScript configured with strict mode and proper paths
3. Express server scaffolded and responding on configured port
4. Environment variables loaded from `.env` file
5. Basic health check endpoint returns `{ status: "ok" }`
6. Development scripts (`dev`, `build`, `start`) working
7. `.gitignore` properly excludes `node_modules`, `.env`, `dist`

## Tasks / Subtasks

- [ ] Task 1: Initialize npm project (AC: #1)
  - [ ] Run `npm init -y`
  - [ ] Add production dependencies: `express`, `cors`, `helmet`, `dotenv`, `pg`, `uuid`
  - [ ] Add dev dependencies: `typescript`, `@types/express`, `@types/node`, `@types/pg`, `@types/uuid`, `tsx`
- [ ] Task 2: Configure TypeScript (AC: #2)
  - [ ] Create `tsconfig.json` with strict mode
  - [ ] Set up path aliases for clean imports
  - [ ] Configure output to `dist/` directory
- [ ] Task 3: Create Express server scaffold (AC: #3, #4, #5)
  - [ ] Create `src/index.ts` with basic Express setup
  - [ ] Add middleware: `helmet`, `cors`, `express.json`
  - [ ] Create health check endpoint at `/health`
  - [ ] Load environment from `.env`
- [ ] Task 4: Set up development workflow (AC: #6)
  - [ ] Add `dev` script using `tsx watch`
  - [ ] Add `build` script using `tsc`
  - [ ] Add `start` script for production
- [ ] Task 5: Create configuration files (AC: #7)
  - [ ] Create `.gitignore`
  - [ ] Create `.env.example` with required variables
  - [ ] Create `README.md` with setup instructions

## Dev Notes

- Use `tsx` for development (faster than `ts-node`)
- Keep dependencies minimal for MVP
- Port should default to 3000 but be configurable via `PORT` env var
- All env vars should have sensible defaults where possible

### Project Structure Notes

```
clawpedia/
├── src/
│   ├── index.ts          # Entry point
│   ├── routes/           # API routes (to be added)
│   ├── middleware/       # Express middleware
│   ├── db/               # Database client & queries
│   └── utils/            # Shared utilities
├── docs/
│   └── stories/          # Implementation stories
├── seed/                 # Seed data for initial content
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

### References

- [Source: Sprint plan - Hour 0-1: Setup & Architecture]
- Express.js best practices for TypeScript projects
- Node.js 20+ required for native fetch support

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

### File List

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `.env.example`
- `.gitignore`
- `README.md`
