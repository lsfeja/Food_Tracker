# Foodtracker

A minimalist, fast calorie and macro tracker for iPhone (SwiftUI, SwiftData, iOS 18+).
It is built for private use. Logging a meal should take seconds.

## Features

- **Home**: a ring with the calories you have left (target + Strava active kcal − eaten),
  protein and carb bars (fat smaller), today's entries (swipe to edit or delete), and a
  big **+** button (long-press it to scan or photograph a label).
- **Add food**: search your recent, frequent and saved foods. Enter grams, and nutrients
  scale from per-100 g values. You can also create foods or quick-add calories.
- **Barcode**: VisionKit scanner with Open Food Facts lookup. If a product isn't found,
  you can photograph its label or enter the values manually.
- **Label photo**: on-device OCR (Vision) reads per-100 g values from German and
  English labels. You confirm them before saving.
- **Targets**: daily calories and macros, plus an optional rolling weekly budget with
  carry-over.
- **History**: daily and weekly totals with charts. Tap a day to see or edit its entries.
- **Strava**: OAuth login, with tokens kept in the Keychain. Activity calories count as
  active calories (toggle, 50–100 %).
- **Widgets**: Lock Screen circular, rectangular and inline widgets, a Home Screen small
  widget, and a **Log Food** control for the Lock Screen and Control Center.

## Setup

1. **Secrets**: run `cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig`, then
   set `STRAVA_CLIENT_SECRET`. This file is gitignored.
2. **Bundle ID prefix**: set `BUNDLE_ID_PREFIX` (default `com.example`) to something
   unique to your team, in `Secrets.xcconfig` or `Config/Base.xcconfig`. The App Group
   becomes `group.<prefix>.foodtracker`.
3. **Signing**: open `Foodtracker.xcodeproj`. For the *Foodtracker* and
   *FoodtrackerWidgetsExtension* targets, pick your team under *Signing & Capabilities*
   (automatic signing registers the App Group), or set `DEVELOPMENT_TEAM` in
   `Secrets.xcconfig`.
4. **Strava**: in your [Strava API settings](https://www.strava.com/settings/api), set
   *Authorization Callback Domain* to `foodtracker`.
5. Build and run the *Foodtracker* scheme on your iPhone. Run the tests with ⌘U.

To add the control, long-press the Lock Screen, tap *Customize*, then *Lock Screen*,
then tap a bottom control slot and choose *Foodtracker › Log Food*. Pick what it opens:
add food, barcode scanner or label photo.

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.
