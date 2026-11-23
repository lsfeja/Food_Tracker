# Foodtracker — notes for Claude

A private all-in-one sports app as a **PWA** on Cloudflare: **Nutrition** (calorie and macro
tracking, barcode scan, label OCR), **Plan** (training calendar, workout library, week
templates, Strava matching) and **Stats** (endurance, strength, plan and nutrition). Main
goal: **logging a meal or ticking off a workout takes seconds**. UI language: English.

The former native iOS app (SwiftUI) is archived in the git tag `ios-final`. Don't bring
Swift/Xcode code back.

## Stack

- **Frontend** (`src/web/`): Vite + React 19 + TypeScript, React Router (data router),
  TanStack Query (cache persisted to IndexedDB via idb-keyval), Recharts, dnd-kit,
  lucide-react icons, vite-plugin-pwa (generateSW, app shell only).
- **Backend** (`src/worker/`): one Cloudflare Worker with Static Assets. Hono app with
  `basePath("/api")`; everything else is the SPA (`not_found_handling =
  "single-page-application"`, `run_worker_first = ["/api/*"]`). Cron trigger every 30 min.
- **Database**: Cloudflare D1, migrations in `migrations/` (append-only).
- **Shared** (`src/shared/`): pure logic and API types used by both. Must not import DOM or
  Worker APIs.

## Commands

```sh
npm ci
cp .dev.vars.example .dev.vars   # local vars/secrets for wrangler dev (gitignored)
npm run db:migrate:local         # local D1 in .wrangler/
npm run build                    # tsc -b + vite build → dist/client (copies OCR assets first)
npm run dev:worker               # wrangler dev on :8787 (serves dist/client + API)
npm run dev                      # Vite HMR on :5173, proxies /api to :8787
npm test                         # vitest: "shared" (node) + "worker" (Miniflare, local D1)
npm run typecheck                # tsc -b (app, worker, node configs)
npm run deploy                   # remote migrations + wrangler deploy (used by Workers Builds)
```

Check the exit code of `tsc` directly (`npx tsc -b; echo $?`) — piping hides failures.
`scripts/copy-ocr-assets.mjs` (pre-dev/pre-build) copies the Tesseract worker, WASM cores and
`deu`/`eng` traineddata into `public/ocr/` (gitignored); they are cached at runtime, not
precached.

## Configuration & secrets

- `wrangler.toml`: D1 binding `DB` (`database_id` must be the real ID), cron, `[vars]`
  `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (non-secret), `preview_urls = false`.
- Secrets only via `wrangler secret put`: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY`. Locally from `.dev.vars`. **Never** put secrets in code,
  `wrangler.toml`, the frontend or tests (tests use dummy values in `vitest.config.ts`).
- `DEV_USER_EMAIL` exists only in `.dev.vars` / tests. Never set it in production.
- Env type: `src/worker/env.ts` (`Env`, `AppContext` with `userId` and `email` variables).

## Auth (Cloudflare Access, no own login)

`src/worker/auth.ts`: with `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` set, the Access JWT
(`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie) is verified with `jose`
against the team's JWKS and its email is used; otherwise the
`Cf-Access-Authenticated-User-Email` header; locally `DEV_USER_EMAIL`. Emails are
lower-cased; `userIdFor` creates `users` + `settings` rows. Every query must filter by
`user_id` (tests check that users can't touch each other's rows). `/api/health` is the only
unauthenticated route.

## Worker layout

```
src/worker/
  index.ts        Hono app, auth middleware, error handling, routes, scheduled()
  auth.ts env.ts http.ts (badRequest/notFound/jsonBody/requireDay/num/optNum/str)
  db.ts           row → DTO mappers, settings, totalsBetween
  linker.ts       autoLink (ActivityMatcher over D1), clearLink/markDoneByLink
  crypto.ts       AES-GCM token encryption ("v1:" + base64(iv‖ciphertext))
  routes/nutrition.ts  settings, day view, totals, foods, entries
  routes/off.ts        Open Food Facts proxy (User-Agent, edge cache)
  routes/training.ts   sessions, move/duplicate/link, library, week templates
  routes/strava.ts     OAuth connect/callback, status, sync, backfill, disconnect, cron
  routes/stats.ts      stats snapshots, data range, yearly goals
  strava/client.ts     config, token exchange/refresh, authorized GET, models, kJ fallback
  strava/rateLimiter.ts D1 counter per provider (shared by all users), headers, 429
  strava/sync.ts       14-day window + catch-up (max 60 days), detail per new activity
  strava/backfill.ts   resumable history import (200/page, pauses on rate limit)
```

## Frontend layout

```
src/web/
  main.tsx App.tsx      SW registration, router (lazy chart pages), Layout (toast, add-food
                        provider, offline banner, tab bar, Strava auto-sync, tz sync)
  api/                  client (fetch wrapper, ApiError), queryClient (persisted cache),
                        nutrition, training, activity (Strava), stats hooks
  components/           NavBar/BackButton/BarButton, Sheet/ActionSheet, SwipeRow, TabBar,
                        PullToRefresh, PromptDialog, Toast, ui (Section, Row, inputs, …)
  lib/                  dates (Intl, UTC-safe day formatting), useToday, useOnline,
                        usePersistentState, useThemeColors, ocr (Tesseract)
  nutrition/            NutritionHome/DayPage, DayDashboard, DayWidgets, EditEntrySheet,
                        HistoryPage, SettingsPage, ActivitySettingsSection,
                        add/ (AddFoodSheet stack: search, portion, food editor, quick add),
                        scan/ (BarcodeScreen with ZXing, LabelScreen with OCR)
  plan/                 PlanPage (week strip, menu), WeekList (dnd-kit), SessionRow,
                        SessionDetailPage, AddSessionSheet, LinkSheets, LibraryPage,
                        WeekTemplatesPage, WeekTemplateSheets, editor/ (Content/Details)
  stats/                StatsPage, Endurance/Strength/Plan/NutritionSection, components
  styles/global.css     the whole design system (CSS variables, light/dark)
```

Routes: `/`, `/day/:day`, `/history`, `/settings`, `/add?mode=search|barcode|label&day=`,
`/plan?week=`, `/plan/session/:id`, `/plan/library`, `/plan/templates[/:id]`, `/stats`,
`/stats/exercises`, `/stats/exercise/:key`. The tab bar remembers each tab's last location.

## Data & domain rules

- **Days** are `YYYY-MM-DD` strings in the user's local calendar (`src/shared/days.ts`, UTC
  arithmetic, weeks start Monday). Timestamps are epoch ms. Strava activities use the date
  of `start_date_local`. The client syncs its time zone into `settings.timezone`.
- `food_entries` store **absolute** nutrients (snapshot); editing a food never rewrites
  history. Foods are hidden, not deleted. `source` manual/barcode/label/ai, `is_estimated`.
- Budget (`shared/budget.ts`): remaining = target + counted active − eaten; counted active =
  Strava kcal × 50–100 %; weekly mode = rolling Monday-based allowance.
- Workout payload (`shared/workout.ts`): `WorkoutDetails` union `strength | endurance |
  general`; parse leniently with `parseDetails/parseContent` (defaults for missing fields).
  `WorkoutContent` is copied by value (library → session, week → template);
  `resetContent` strips progress.
- Plan writes go through `routes/training.ts`, which keeps `position` consistent and calls
  `autoLink` for touched days. Matching: same day, same `MatchGroup`, day order, each
  activity once; a link marks the session done (`completed_by_link`); manual unlink sets
  `auto_link_suppressed`; manual links to activities on other days survive while the
  activity exists.
- Week template apply: `add` appends per day; `replace` deletes the week's sessions that are
  not done.
- Strava: tokens only encrypted in D1; never log or return them. Detail requests are capped
  per sync (subrequest budget); `details_complete` activities are never re-fetched; the
  backfill never overwrites exact calories. Rate limits are per app, so the limiter is global
  per provider.
- Stats are computed **on the client** from raw snapshots (`/stats/activities`,
  `/stats/sessions`, `/strength-sessions`, `/totals`) with the pure engines in
  `src/shared/stats/`. No cached aggregates.
- Room for later (don't implement unasked): AI estimates (`food_entries.source = 'ai'`),
  Garmin (`connections.provider`, `activities.source`, per-provider `rate_limits` and
  `backfill_state`; add a client + sync like `strava/`).

## Migrations

Never edit an applied migration's SQL; add `migrations/000N_description.sql`. New columns
need defaults. Tests apply all migrations to a fresh local D1 (`test/worker/setup.ts`).

## Testing

- Shared logic: `src/shared/**/*.test.ts` (Vitest, node, locale en-US).
- Worker: `test/worker/*.test.ts` with `@cloudflare/vitest-plugin` (`SELF.fetch`, `env.DB`).
  Use `api(email)` from `helpers.ts` and a distinct email per test. Mock outbound fetches
  with `vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(...))` —
  create responses inside the implementation (Workers I/O isolation).
- When changing `labelParser.ts`, add a fixture for the label layout that motivated it.
- UI changes: build, run `wrangler dev` and check with Playwright (iPhone viewport, light
  and dark). There is no OFF/Strava network access from local workerd in the sandbox.

## Conventions

- Look and feel like the iOS app: grouped background, inset cards, system font, one green
  accent (`--accent`), orange only for "over budget/behind", light and dark via CSS variables.
  Inputs ≥ 16 px (no iOS zoom), safe-area insets, mobile first (max width 640 px).
- Swipe actions on rows are delete/duplicate (or hide/edit for foods); week navigation swipes
  on the week strip, not the list. Long press = drag (plan) / quick menu (+ button).
- Metric units only (g, kcal, km, kg); format with `src/shared/format.ts`, parse decimals
  with `parseDecimal` (accepts `,` and `.`).
- Mutations invalidate the affected query keys (`day`, `totals`, `foods`, `plan`, `stats`,
  `strava`, `library`, `weekTemplates`, `goals`); use optimistic updates for taps that must
  feel instant (tick off, delete, drag & drop).
- Keep components small; speed of logging beats feature count. Commit in small, working
  steps with clear messages.
