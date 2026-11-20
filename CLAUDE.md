# Foodtracker — notes for Claude

An all-in-one sports app for iPhone (SwiftUI, SwiftData, iOS 18+). It has three tabs:
**Nutrition** (calorie and macro tracking), **Plan** (training calendar with a workout
library, week templates and Strava matching) and **Stats** (endurance, strength, plan
and nutrition statistics). Private app, not for the App
Store. Main goal: **logging a meal or ticking off a workout takes seconds**.

The display name is still "Foodtracker" (`INFOPLIST_KEY_CFBundleDisplayName`). It can
be renamed later. Never change the bundle IDs (`BUNDLE_ID_PREFIX` + `.foodtracker`).

## Build & run

The project is a committed Xcode project (`Foodtracker.xcodeproj`, objectVersion 77)
that uses **file-system synchronized folders**. Any file placed in a target folder is
compiled automatically. Don't add per-file entries to `project.pbxproj`.

```sh
# One-time setup
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # then fill in values

# Build (simulator)
xcodebuild -project Foodtracker.xcodeproj -scheme Foodtracker \
  -destination 'platform=iOS Simulator,name=iPhone 16' build

# Unit tests (Swift Testing)
xcodebuild -project Foodtracker.xcodeproj -scheme Foodtracker \
  -destination 'platform=iOS Simulator,name=iPhone 16' test
```

Requirements: Xcode 16 or later, iOS 18.0 deployment target, iPhone only, portrait.

> Claude sessions often run in a Linux container without Xcode or Swift. Code written
> there is not compiled until the user builds on a Mac. Be conservative with APIs, and
> keep logic in pure Swift types that unit tests can cover.

## Targets & folders

| Folder               | Target(s)                          | Contents |
|----------------------|------------------------------------|----------|
| `Foodtracker/`       | app                                | App entry, views, view models, services |
| `Shared/`            | app **and** widget extension       | SwiftData models (nutrition, training, goals), settings, budget math, training and stats logic, App Intents, deep links |
| `FoodtrackerWidgets/`| widget extension                   | Lock Screen/Home Screen widgets, Control widget |
| `FoodtrackerTests/`  | unit tests (hosted in app)         | Swift Testing tests, `@testable import Foodtracker` |
| `Config/`            | (not a synchronized folder)        | xcconfigs, Info.plists, entitlements |

Code in `Shared/` must compile in the widget extension. No UIKit-only APIs that are
unavailable to extensions, and no app-only services.

### Where things live

```
Foodtracker/
  App/          FoodtrackerApp (entry), RootView (TabView), AppRouter (AppTab, PlanRoute),
                AppServices, FoodtrackerShortcuts
  Home/         HomeView (Nutrition tab root), DayDashboard (today or any day), ring, bars, rows
  AddFood/      AddFoodView (sheet + NavigationStack), AddFoodFlow/AddFoodRoute,
                FoodSearchView, PortionView, FoodEditorView, QuickAddView, FoodDraft
  Barcode/      BarcodeFlowView (lookup + fallbacks), BarcodeScannerView (DataScanner)
  Label/        LabelScanView (camera/library → OCR → editor), CameraPicker
  Entry/        EditEntryView
  History/      HistoryView (Swift Charts), HistoryStats (pure aggregation)
  Settings/     SettingsView, ActivitySettingsSection (Strava)
  Plan/         PlanView (Plan tab root, week navigation, menu), PlanWeekContent (week strip
                + day list, drag & drop), SessionRow, AddSessionSheet, LinkSessionSheet
    Detail/     SessionDetailLoader, SessionDetailView (set tracking, rest timer),
                LinkedActivitySection (actual vs. plan, link/unlink)
    Editor/     SessionEditorView, WorkoutDetailsEditor (strength/endurance/general)
    Library/    WorkoutLibraryView, NewWorkoutSheet
    WeekTemplates/ WeekTemplatesView + editor, LoadWeekTemplateView, SaveWeekTemplateView
  Stats/        StatsView (Stats tab root: period, year, category, StatsRoute destinations),
                StatsComponents (StatsCard, MetricTile, MetricGrid, ChipPicker),
                Endurance/Strength/Plan/NutritionStatsSection, ExerciseListView,
                ExerciseDetailView, GoalEditor
  Components/   NumberField, OptionalNumberField, IntensityPicker, ProgressBar
  Services/     FoodLogger, FoodCatalog, KeychainStore,
                FoodDatabase/ (Open Food Facts), Label/ (OCR + parser),
                Activity/ (ActivitySource + ActivityHistorySource, ActivitySyncService,
                ActivityBackfillService), Strava/,
                Training/ (PlanActions, LibraryActions, WeekTemplateActions, TrainingLinker)
Shared/
  Models/       Food, FoodEntry, ActivityRecord, Nutrients, source enums
  Persistence/  SharedModelContainer (App Group store), NutritionStore (fetch helpers)
  Budget/       BudgetCalculator (pure)
  Settings/     SettingsKey/SettingsDefault, UserSettings
  Training/     SportType, WorkoutDetails (Codable payload) + WorkoutContent,
                TrainingModels (PlannedSession, WorkoutTemplate, WeekTemplate), TrainingStore,
                ActivityMatcher, WeekPlanner, ExerciseHistory (all pure logic except models)
  Stats/        StatsPeriod (+ StatsBuckets), StatsSport + ActivitySnapshot, EnduranceStats
                (+ StatsSportFilter, GoalProgress), StrengthStats, PlanStats, NutritionStats
                (pure), YearlyGoal (model)
  Intents/      AddFoodMode (AppEnum), OpenAddFoodIntent, DeepLink + DeepLinkInbox
  Support/      AppGroup, Format/DecimalParser, WidgetRefresher
FoodtrackerWidgets/
  TodayWidget + TodayProvider, TrainingWidget (+ provider), StatsWidget (configurable,
  AppIntentConfiguration), AddFoodControl, FoodtrackerWidgetsBundle
```

## Configuration & secrets

- `Config/Base.xcconfig` holds the project-level settings: `BUNDLE_ID_PREFIX`,
  `APP_GROUP_ID` (= `group.$(BUNDLE_ID_PREFIX).foodtracker`), `DEVELOPMENT_TEAM`, and
  empty Strava keys. At the end it runs `#include? "Secrets.xcconfig"`.
- `Config/Secrets.xcconfig` is **gitignored**. It holds `STRAVA_CLIENT_ID`,
  `STRAVA_CLIENT_SECRET`, and optional signing overrides. `Secrets.example.xcconfig`
  is the committed template.
- Build settings reach code through Info.plist keys: `AppGroupIdentifier`,
  `StravaClientID`, `StravaClientSecret`. Read them via `Bundle.main`.
- OAuth tokens are stored **only in the Keychain** (`KeychainStore`). Never log them.
- Never commit secrets, tokens or API keys.

## Architecture

MVVM-ish, SwiftUI-first:

- **Views** use `@Query` for reactive SwiftData lists and `@AppStorage(store: AppGroup.defaults)`
  for settings. Screens with non-trivial logic get an `@Observable` view model.
- **Pure logic** (budget math, label parsing, nutrient scaling, API decoding) lives in
  plain structs/enums without UI dependencies and is unit tested.
- **Services** (in `Foodtracker/Services/`) wrap I/O:
  - `FoodDatabaseService` (Open Food Facts: barcode lookup + text search)
  - `OCRService` (Apple Vision text recognition) + `NutritionLabelParser` (DE/EN)
  - `StravaService` (OAuth via `ASWebAuthenticationSession`, token refresh, rate limiting)
  - `ActivitySyncService` syncs every `ActivitySource` into `ActivityRecord`s
- `AppServices` is the dependency container. It is injected with `.environment(...)`.
- `RootView` hosts the `TabView` (`AppTab`: `.nutrition`, `.plan`, `.stats`; add cases
  for new areas). App-wide concerns live there: the add-food sheet, deep links, and the Strava
  sync on launch/foreground. Each tab owns its `NavigationStack`.
- `AppRouter` owns the global navigation state: the selected tab, the add-food sheet, and
  the Plan stack's `planPath` (a `NavigationPath`, so pushed screens can push their own
  value types). It also handles deep links.
- The add-food sheet has its own `NavigationStack` driven by `AddFoodFlow.path`. Screens
  push/replace `AddFoodRoute`s (scanner → portion uses `replaceTop` so Back skips the
  scanner) and call `flow.finish()` after logging.

### External APIs

- **Open Food Facts**: `GET /api/v2/product/{barcode}` and `/cgi/search.pl` (search is
  rate limited by OFF, so it only runs on explicit user action). Sends the User-Agent
  `Foodtracker/1.0 (iOS; private use)`. Decoding is lenient (numbers may be strings).
- **Strava v3**: OAuth `/oauth/mobile/authorize` → `/oauth/token`. Data comes from
  `GET /athlete/activities?after=…` (list) plus `GET /activities/{id}` (detail, for
  `calories`). Detail is fetched once per activity, and activities whose details are
  complete are reused from the cache. Fallback: kcal ≈ kJ of work (rides with power).
  `StravaRateLimiter` keeps a margin below 100 requests/15 min and 1,000/day, reads the
  `X-ReadRateLimit-*` headers, and backs off on 429. Auto-sync runs at most every 10 min.
  Pull-to-refresh forces a sync, still subject to the limiter.

### Data model (SwiftData, `Shared/Models`)

- `Food`: catalog item with **per-100 g** nutrients, an optional barcode, `source`
  (custom / openFoodFacts / label), and usage stats (`lastUsedAt`, `useCount`) that
  drive the recent/frequent ordering.
- `FoodEntry`: a logged item. It stores **absolute** nutrient values as a snapshot, so
  editing a `Food` never rewrites history. It also has optional `grams`, a `source`
  (manual / barcode / label / ai), an `isEstimated` flag, and an optional link to its
  `Food`. AI estimates (planned) become entries with `source = .ai`,
  `isEstimated = true`, and no food.
- `ActivityRecord`: an imported activity, keyed by `(source, externalID)`. It holds
  `activeCalories`, distance, moving time, `elevationMeters` and `isIndoor` (trainer or
  virtual).
- `YearlyGoal`: an optional distance and/or hours target per year and
  `StatsSportFilter` (e.g. 8,000 km cycling).

- `PlannedSession`: one session on a day (`date` = start of day, `order` within the day).
  It holds `sport`, `title`, `status` (planned/done/skipped) and `detailsData`. It can
  link to an activity via `linkedActivityKey` (= `ActivityRecord.linkKey`, e.g.
  `strava:123`), with `isLinkManual`, `autoLinkSuppressed` and `completedByLink`.
- `WorkoutTemplate`: a library workout (`name`, `sport`, `detailsData`, usage stats).
- `WeekTemplate`: a named week (`sessionsData` = JSON `[TemplateSession]`, where each
  entry has a weekday 0 = Mon … 6 = Sun, an order and its `WorkoutContent`).

The store lives in the App Group container (`SharedModelContainer`). Widgets read it
directly. New models must be added to `SharedModelContainer.schema`. New stored
properties need default values so lightweight migration keeps working.

### Training content (Codable payload)

- `WorkoutDetails` is an enum with one case per `SportCategory`:
  - `.strength(StrengthWorkout)`: exercises → sets, each with planned and actual reps and
    weight, `isDone`, rest seconds and notes.
  - `.endurance(EnduranceWorkout)`: duration, distance, `Intensity` (zone 1–5 or RPE 1–10),
    `IntervalBlock`s (repeats × steps) and notes.
  - `.general(GeneralWorkout)`: duration and notes.
- `WorkoutContent` (sport + title + details) is the value that gets copied: from a
  template to a session ("copy on use"), from a session to the library, and from a week
  to a week template. `resettingProgress()` strips the done flags and actual values.
  Editing a template never changes sessions.
- Decoders are **lenient** (custom `init(from:)` with defaults in `WorkoutDetails.swift`).
  When you add a field, give it a default and decode it with `value(_:default:)` or
  `optional(_:)`.
- **Adding a sport**: add a `SportType` case (name, SF Symbol, category, optional
  `MatchGroup`, Strava mapping in `fromActivityType`). Add a new `SportCategory` +
  `WorkoutDetails` case + editor/detail view only if it needs its own payload.
- "Last time" values (`ExerciseHistory`) match exercises by normalized name
  (case/diacritics/whitespace-insensitive). The editor suggests known names.

### Plan rules

- All calendar writes go through `PlanActions` (keeps orders consistent, saves, reloads
  widgets, re-runs matching for touched days). Library writes go through
  `LibraryActions`, and week templates through `WeekTemplateActions`.
- Loading a week template: `.add` appends after existing sessions per day. `.replace`
  deletes the week's sessions that are not done (completed sessions are kept).
- Strava matching (`ActivityMatcher` + `TrainingLinker`): runs after every activity sync
  and when sessions are added or moved. It matches on the same day and the same
  `SportType.MatchGroup` (e.g. indoor ride ↔ Ride/VirtualRide), in day order, with each
  activity linked at most once. A new link marks the session done (`completedByLink`).
  If the activity disappears, the link is removed and the status reverted. A manual
  unlink sets `autoLinkSuppressed`. Activities that aren't linked show as "Unplanned" in
  the day list.
- Training analytics are out of scope for now. The data is ready for them: sessions
  carry `sport`, `status`, `completedAt`, actual sets and `templateID`.

### Budget rules (`BudgetCalculator`)

- Remaining kcal = target + counted active kcal − eaten.
- Counted active kcal = Strava kcal × percentage (50–100 %), or 0 if disabled.
- Weekly mode (rolling, week starts Monday): today's allowance =
  (weekly limit + counted active kcal of earlier days − kcal eaten on earlier days) ÷ days
  left, including today. The weekly balance = limit + active − eaten so far.

### Stats

- **Data sources**: endurance stats use `ActivityRecord`s (Strava). Strength stats use
  strength `PlannedSession`s, counting only ticked-off sets; actual reps/weight fall back
  to the plan. Plan stats use sessions plus activities. Nutrition stats use
  `FoodEntry`s plus activities (`BudgetCalculator.totalsByDay`).
- **Computed on the fly, no cached aggregates**. Each section converts its `@Query`
  results into Sendable snapshots (`ActivitySnapshot`, `StrengthSessionSnapshot`,
  `PlanSessionSnapshot`) and runs the pure `*Stats.report(...)` in a detached task. The
  task is keyed on period + a data signature. If it ever becomes slow with huge
  histories, add a persisted aggregate then, not before.
- **Periods** (`StatsPeriod`): week and month are the ones containing the reference date
  (today for the current year, otherwise 31 Dec of the selected year). Year is the
  calendar year; all time runs from the earliest data. `buckets` defines the chart
  granularity per period.
- **Endurance**: `StatsSport` buckets activities (ride, run, swim, indoor ride, other;
  indoor = `VirtualRide` or trainer). `StatsSportFilter` adds "all" and "cycling" (ride +
  indoor) for filters and goals. Goal status compares actual progress with an even pace
  through the year (`EnduranceStats.goalProgress`).
- **Strength**: Epley 1RM (`w × (1 + reps/30)`, a single rep is the weight itself), volume
  = reps × weight, exercises matched by normalized name. `StrengthStats.newRecords`
  compares a session with all earlier ones. A first-ever exercise isn't a record. The
  session detail shows new records once a strength session is done.
- **Plan**: adherence counts workouts up to today (rest days excluded). Training time
  uses the linked activity's moving time, otherwise the planned duration of a completed
  session, plus unplanned activities. Strength sessions without a linked activity have
  no duration.
- **History backfill** (`ActivityBackfillService`, one per `ActivityHistorySource`): a
  one-time, page-based import (200 per page, summaries only, no per-activity detail
  calls) of everything before the regular sync window. State is persisted in
  `UserDefaults` after every page. A rate limit (`RetryAfterError`) pauses the import,
  which resumes automatically or on the next launch. It never overwrites exact calories
  of known activities. Old activities get kJ-based calorie estimates (or 0).
- **Regular sync catch-up**: the sync window extends back to shortly before the last
  successful sync (max. 60 days), so nothing falls between the backfill and the 14-day
  window.

### Widgets & intents

- `TodayWidget`: accessoryCircular / accessoryRectangular / accessoryInline / systemSmall.
- `StatsWidget`: systemSmall / systemMedium. Shows year-to-date distance for a configured
  `StatsSportFilter` (`AppEnum` conformance lives in the widget target), progress toward
  the `YearlyGoal`, the delta vs. last year, and monthly bars (medium). Tapping it
  opens `foodtracker://stats`.
- `TrainingWidget`: accessoryRectangular / systemSmall with today's sessions. Tapping it
  opens `foodtracker://session?id=…` for the next open session (or `foodtracker://plan`).
- `AddFoodControl` (ControlWidget, iOS 18): opens the app into add food, barcode scan or
  label photo (configured per control).
- `OpenAddFoodIntent` lives in `Shared/` (both targets) with `openAppWhenRun = true`. It
  posts a `DeepLink` through `DeepLinkInbox` (App Group defaults + notification), and
  `AppRouter` consumes it.
- URL scheme `foodtracker://` handles deep links (`foodtracker://add?mode=barcode`,
  `foodtracker://plan`, `foodtracker://session?id=<UUID>`, `foodtracker://stats`). Strava's
  OAuth callback `foodtracker://foodtracker` is captured by `ASWebAuthenticationSession`.
- After every data change, call `WidgetRefresher.reload()`. `FoodLogger`, `PlanActions`
  and `ActivitySyncService` already do this.

### Extension points (planned, not implemented)

- **AI estimation**: add an `AIEstimationService`. It creates `FoodEntry`s with
  `source = .ai` and `isEstimated = true`. No schema change is needed.
- **Garmin**: implement `ActivitySource` (`kind = .garmin`) and add it to the `sources`
  array passed to `ActivitySyncService` in `AppServices.init`. Also implement
  `ActivityHistorySource` and create an `ActivityBackfillService` for it to import its
  history. The sync logic, budget
  math and session matching stay unchanged (map Garmin sport names in
  `SportType.fromActivityType` or a Garmin-specific mapper).

## Testing

Unit tests use Swift Testing (`import Testing`, `@Test`, `#expect`) in `FoodtrackerTests/`:
budget math, history aggregation, nutrient scaling, decimal parsing, deep links, the
label parser (DE/EN fixtures), Open Food Facts decoding, and Strava decoding plus rate
limiting. Training tests (`TrainingTests.swift`) cover payload coding and summaries,
the training models, `ActivityMatcher`, `WeekPlanner`, `ExerciseHistory`, applying and
saving week templates, moving sessions, and `TrainingLinker`. Stats tests cover
`StatsPeriod`, the backfill (with a fake `ActivityHistorySource`: paging, pause/resume,
upsert), `EnduranceStats` (totals, buckets, records, indoor share, YoY, goals),
`StrengthStats` (1RM, records, new-record detection) and `PlanStats`/`NutritionStats`. Use `testCalendar` and `day(_:_:_:)` from `TestSupport.swift` for
deterministic dates, and `SharedModelContainer.make(inMemory: true)` for SwiftData.

When changing `NutritionLabelParser`, add a fixture row set to
`NutritionLabelParserTests` for the label layout that motivated the change.

## Conventions

- Swift 5 language mode, SwiftUI only (UIKit only for wrapped controllers such as the
  camera and the data scanner).
- System fonts and SF Symbols. One accent color (green, `AccentColor`). Light and dark
  mode via semantic colors.
- Metric units only: grams and kcal. Format numbers with the helpers in `Formatting.swift`.
- Parse user-entered decimals with `DecimalParser` (accepts `,` and `.`).
- Keep views small. Speed of logging beats feature count. Avoid extra taps.
- All tabs share the same visual language: inset-grouped lists or `StatsCard`s on the
  grouped background, the green accent for progress and done states, orange only for
  "over budget"/"behind", and SF Symbols per sport. Charts use Swift Charts. Series per
  sport use `SportPalette` (green/blue family).
- Swipe actions on rows are delete/duplicate. Week navigation in Plan swipes on the
  week strip, not the list, so the two horizontal gestures don't conflict.
- Use the `@MainActor` view-model pattern. Network code is `async`/`await`.
- Commit in small, working milestones with clear messages.
