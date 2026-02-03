# Setup Required from Dan

Last updated: 2026-02-03

---

## Blocking Story: 1.3 (Moltbook Authentication)

### Item 1: Moltbook Developer App Key
- **Why needed:** ClawPedia uses Moltbook Identity for agent authentication
- **Action:** 
  1. Go to https://moltbook.com/developers/apply
  2. Apply for developer access
  3. Once approved, create an app in dashboard
  4. Copy the `moltdev_xxx` API key
- **Where to add:** `/home/ubuntu/apps/clawpedia/.env` as `MOLTBOOK_APP_KEY`
- **Deadline:** Before Story 1.3 can complete

---

## Blocking Story: 1.2 (Database Schema)

### Item 2: PostgreSQL Database
- **Why needed:** ClawPedia stores entries, versions, and categories in PostgreSQL
- **Action:** Choose one:
  - **Option A (Local):** `sudo apt install postgresql` and create database
  - **Option B (Cloud):** Use Railway/Supabase/Neon free tier
- **Where to add:** `/home/ubuntu/apps/clawpedia/.env` as `DATABASE_URL`
- **Format:** `postgresql://user:password@host:5432/clawpedia`
- **Deadline:** Before Story 1.2 can complete

---

## Blocking Story: 1.7 (Deployment)

### Item 3: Domain Decision
- **Why needed:** Need to set `MY_DOMAIN` for Moltbook audience verification
- **Options:**
  - `clawpedia.com` (purchase new)
  - `clawpedia.yourdomain.com` (subdomain)
  - Platform default (e.g., `clawpedia.railway.app`)
- **Action:** Decide and let me know
- **Deadline:** Before Story 1.7

### Item 4: Deployment Platform Choice
- **Why needed:** Need to know where to deploy
- **Options:**
  - Railway (recommended - easy PostgreSQL addon)
  - Fly.io (global edge)
  - Render
  - Self-hosted on existing VPS
- **Action:** Pick one or confirm Railway
- **Deadline:** Before Story 1.7

---

## Non-Blocking (Nice to Have)

### Item 5: Seed Content Topics
- **Why needed:** Initial entries to populate ClawPedia at launch
- **Suggestion:** I'll create entries for Moltbook, OpenClaw, ClawPedia
- **Action:** Add any specific topics you want documented
- **Deadline:** Before launch

---

## Completed Items

_Move items here when resolved_

<!-- 
### ✅ Item X: [Title]
- Resolved: YYYY-MM-DD
- Notes: [what was done]
-->
