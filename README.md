# Foodtracker

A minimalist, fast calorie and macro tracker for iPhone (SwiftUI, SwiftData, iOS 18+).

## Setup

1. **Secrets**: `cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig`, then set
   `STRAVA_CLIENT_SECRET` (and optionally `DEVELOPMENT_TEAM` / `BUNDLE_ID_PREFIX`).
   This file is gitignored.
2. **Bundle ID prefix**: set `BUNDLE_ID_PREFIX` (default `com.example`) to something
   unique for your team, either in `Secrets.xcconfig` or in `Config/Base.xcconfig`.
   The App Group becomes `group.<prefix>.foodtracker`.
3. **Signing**: open `Foodtracker.xcodeproj`. For the *Foodtracker* and
   *FoodtrackerWidgetsExtension* targets, select your team under
   *Signing & Capabilities* (automatic signing). Xcode registers the App Group.
4. **Strava**: in your Strava API application, set *Authorization Callback Domain* to
   `foodtracker`.
5. Build and run the *Foodtracker* scheme on your iPhone.

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
