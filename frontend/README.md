# OMR Platform — Frontend

Next.js 14 (App Router) dashboard for the FastAPI OMR grading backend in the repo root.

## Setup

```bash
bun install          # also installs git hooks (lefthook) via the prepare script
cp .env.example .env.local   # then fill in real values
bun dev              # http://localhost:3000  (backend must run on :8000, see root CLAUDE.md)
```

## Clerk auth (one-time setup)

1. Create an application at <https://dashboard.clerk.com>, copy the publishable + secret keys into `.env.local`.
2. **Roles**: for each user, set `publicMetadata` in the Clerk dashboard (Users → select user → Metadata):
   ```json
   { "role": "ORG_ADMIN" }
   ```
   Valid roles: `SUPER_ADMIN`, `ORG_ADMIN`, `STUDENT`. Students may also get `"rollNo": "0421"` to prefill their result lookup.
3. **Session token claim** (needed for route-level role guarding in `src/middleware.ts`): Configure → Sessions → Customize session token, add:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```

Until step 2–3 are done, signed-in users land on `/` with instructions instead of a dashboard.

## Route map

| Route | Role | What |
|---|---|---|
| `/login` | public | Clerk sign-in |
| `/admin` | ORG_ADMIN, SUPER_ADMIN | Analytics dashboard (KPIs, distribution, subject radar, hardest questions, student table) |
| `/admin/upload` | ORG_ADMIN, SUPER_ADMIN | Upload Hub — start a grading job, live progress + preview |
| `/admin/checked-sheets/{jobId}` | ORG_ADMIN, SUPER_ADMIN | Split-pane sheet review |
| `/student` | STUDENT, SUPER_ADMIN | Personal scorecard: job id + roll no lookup, batch comparison, sheet review |
| `/super-admin` | SUPER_ADMIN | Guarded but unbuilt — the backend has no org/user/system endpoints to show yet |

## Tooling

- **knip** (`bun run knip`) — dead exports/files/deps; runs on pre-commit.
- **lefthook** (`../lefthook.yml`) — pre-commit runs typecheck + lint + knip on the frontend.
- **zod** (`src/lib/zod-schemas.ts`) — every backend response and uploaded CSV is runtime-validated; TS types are inferred from the schemas.

## Backend coupling notes

- Jobs live only in backend process memory; the persisted "recent jobs" list here can reference dead jobs (the UI shows a warning when `/progress` returns `unknown`).
- Analytics are computed client-side from the `/report/{job_id}` CSV — there is no analytics endpoint. Fine at batch scale (hundreds of sheets); add a backend endpoint if that changes.
- The answer key never comes back from the backend, so the frontend keeps the uploaded copy per job (localStorage) to power hardest-questions and per-question status.
