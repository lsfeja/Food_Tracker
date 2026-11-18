# Foodtracker — notes for Claude

A minimalist calorie and macro tracker for iPhone (SwiftUI, SwiftData, iOS 18+).
Private app, not for the App Store. Main goal: **logging a meal takes seconds**.

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
| `Shared/`            | app **and** widget extension       | SwiftData models, settings, budget math, App Intents, deep links |
| `FoodtrackerWidgets/`| widget extension                   | Lock Screen/Home Screen widgets, Control widget |
| `FoodtrackerTests/`  | unit tests (hosted in app)         | Swift Testing tests, `@testable import Foodtracker` |
| `Config/`            | (not a synchronized folder)        | xcconfigs, Info.plists, entitlements |

Code in `Shared/` must compile in the widget extension. No UIKit-only APIs that are
unavailable to extensions, and no app-only services.

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
- `AppRouter` owns the global navigation state (the add-food sheet) and handles deep links.

### Data model (SwiftData, `Shared/Models`)

- `Food`: catalog item with **per-100 g** nutrients, an optional barcode, `source`
  (custom / openFoodFacts / label), and usage stats (`lastUsedAt`, `useCount`) that
  drive the recent/frequent ordering.
- `FoodEntry`: a logged item. It stores **absolute** nutrient values as a snapshot, so
  editing a `Food` never rewrites history. It also has optional `grams`, a `source`
  (manual / barcode / label / ai), an `isEstimated` flag, and an optional link to its
  `Food`. AI estimates (planned) become entries with `source = .ai`,
  `isEstimated = true`, and no food.
- `ActivityRecord`: an imported activity, keyed by `(source, externalID)`, with
  `activeCalories`.

The store lives in the App Group container (`SharedModelContainer`). Widgets read it
directly.

### Budget rules (`BudgetCalculator`)

- Remaining kcal = target + counted active kcal − eaten.
- Counted active kcal = Strava kcal × percentage (50–100 %), or 0 if disabled.
- Weekly mode (rolling, week starts Monday): today's allowance =
  (weekly limit + counted active kcal of earlier days − kcal eaten on earlier days) ÷ days
  left, including today. The weekly balance = limit + active − eaten so far.

### Widgets & intents

- `TodayWidget`: accessoryCircular / accessoryRectangular / accessoryInline / systemSmall.
- `AddFoodControl` (ControlWidget, iOS 18): opens the app into add food, barcode scan or
  label photo (configured per control).
- `OpenAddFoodIntent` lives in `Shared/` (both targets) with `openAppWhenRun = true`. It
  posts a `DeepLink` through `DeepLinkInbox` (App Group defaults + notification), and
  `AppRouter` consumes it.
- URL scheme `foodtracker://` handles deep links (`foodtracker://add?mode=barcode`). Strava's
  OAuth callback `foodtracker://foodtracker` is captured by `ASWebAuthenticationSession`.
- After every data change, call `WidgetRefresher.reload()`. `FoodLogger` and
  `ActivitySyncService` already do this.

### Extension points (planned, not implemented)

- **AI estimation**: add an `AIEstimationService`. It creates `FoodEntry`s with
  `source = .ai` and `isEstimated = true`. No schema change is needed.
- **Garmin**: implement `ActivitySource` (`kind = .garmin`) and register it in
  `AppServices.activitySources`. The sync logic and the budget math stay unchanged.

## Conventions

- Swift 5 language mode, SwiftUI only (UIKit only for wrapped controllers such as the
  camera and the data scanner).
- System fonts and SF Symbols. One accent color (green, `AccentColor`). Light and dark
  mode via semantic colors.
- Metric units only: grams and kcal. Format numbers with the helpers in `Formatting.swift`.
- Parse user-entered decimals with `DecimalParser` (accepts `,` and `.`).
- Keep views small. Speed of logging beats feature count. Avoid extra taps.
- Use the `@MainActor` view-model pattern. Network code is `async`/`await`.
- Commit in small, working milestones with clear messages.
