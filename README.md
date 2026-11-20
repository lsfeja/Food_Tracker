# Foodtracker

A minimalist all-in-one sports app for iPhone (SwiftUI, SwiftData, iOS 18+): nutrition
tracking, a training plan and statistics. It is built for private use. Logging a meal or ticking off
a workout should take seconds.

## Nutrition tab

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

## Plan tab

- **Training calendar**: the week as a to-do list grouped by day, with today highlighted.
  Swipe the week strip to change weeks, and switch between day and week view.
- **Sessions**: tick them off, add with + per day, drag & drop between days, swipe to
  delete or duplicate.
- **Session details by sport**:
  - Strength: sets × reps × weight, rest timer, tick off sets with actual values, and
    your values from last time.
  - Endurance: duration, distance, zones/RPE and intervals.
  - Mobility, yoga, rest days and custom sessions: notes and duration.
- **Workout library**: reusable workouts, copied when used, so editing one never changes
  past sessions.
- **Week templates**: build them, save a week as one, and load one into any week with a
  preview (add or replace).
- **Strava**: imported activities are matched to planned sessions on the same day by
  sport and marked done, with actual duration and distance shown. Unplanned activities
  appear in the day list. You can link and unlink manually.
- **Widgets**: today's training on the Lock Screen (rectangular) and Home Screen
  (small). Tapping one opens the session.

## Stats tab

- **Period**: week, month, year or all time, plus a year picker.
- **Endurance** (per sport or cycling combined): distance, time, elevation and activity
  counts; weekly and monthly volume; this year vs. last year (cumulative); longest
  activity, most elevation, best week and month; indoor vs. outdoor share; optional
  yearly goals with "on track / behind".
- **Strength**: max weight, best set, estimated 1RM (Epley) and volume per exercise;
  personal records (new ones are highlighted when a workout is finished); progress
  charts and full history per exercise; weekly volume and session counts.
- **Plan**: planned vs. completed sessions, and training time per sport.
- **Nutrition**: daily averages vs. targets, days within or over budget, and eaten vs.
  active calories.
- **History import**: Settings › Activity History imports your full Strava history
  once. It respects rate limits and resumes automatically.
- **Widget**: a Home Screen "Year to Date" widget (small/medium) for a chosen sport,
  with goal progress.

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
