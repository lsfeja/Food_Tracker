import Foundation
import Observation
import OSLog
import SwiftData

/// Imports activities from all connected `ActivitySource`s into SwiftData.
@MainActor
@Observable
final class ActivitySyncService {
    /// How far back each sync looks (the current week is always included).
    static let lookbackDays = 14
    /// Automatic syncs (app launch/foreground) run at most this often.
    static let minimumAutoSyncInterval: TimeInterval = 10 * 60

    private(set) var isSyncing = false
    private(set) var lastError: String?
    private(set) var lastSync: Date?

    @ObservationIgnored private let sources: [any ActivitySource]
    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let logger = Logger(subsystem: "Foodtracker", category: "ActivitySync")

    private static let lastSyncKey = "activitySync.lastSync"

    init(sources: [any ActivitySource], container: ModelContainer, defaults: UserDefaults = .standard) {
        self.sources = sources
        self.container = container
        self.defaults = defaults
        let stored = defaults.double(forKey: Self.lastSyncKey)
        lastSync = stored > 0 ? Date(timeIntervalSince1970: stored) : nil
    }

    var hasConnectedSource: Bool {
        sources.contains { $0.isConnected }
    }

    /// Syncs unless the last successful sync was very recent.
    func syncIfNeeded() async {
        if let lastSync, Date.now.timeIntervalSince(lastSync) < Self.minimumAutoSyncInterval { return }
        await sync()
    }

    /// Syncs all connected sources (pull-to-refresh, "Sync now").
    func sync() async {
        guard !isSyncing else { return }
        let connected = sources.filter { $0.isConnected }
        guard !connected.isEmpty else { return }

        isSyncing = true
        defer { isSyncing = false }

        let context = container.mainContext
        let since = Self.syncStartDate()
        var changed = false
        var errorMessage: String?

        for source in connected {
            do {
                let existing = try records(for: source.kind, since: since, in: context)
                var cached: [String: ImportedActivity] = [:]
                for record in existing where cached[record.externalID] == nil {
                    cached[record.externalID] = ImportedActivity(record: record)
                }
                let result = try await source.fetchActivities(since: since, cached: cached)
                if apply(result, kind: source.kind, existing: existing, in: context) {
                    changed = true
                }
            } catch {
                logger.error("Sync with \(source.kind.rawValue, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
                errorMessage = error.localizedDescription
            }
        }

        if changed {
            do {
                try context.save()
            } catch {
                logger.error("Saving activities failed: \(error.localizedDescription, privacy: .public)")
            }
            WidgetRefresher.reload()
        }

        lastError = errorMessage
        if errorMessage == nil {
            let now = Date.now
            lastSync = now
            defaults.set(now.timeIntervalSince1970, forKey: Self.lastSyncKey)
        }
    }

    /// Deletes all imported activities of a provider (e.g. after disconnecting).
    func deleteActivities(of kind: ActivitySourceKind) {
        let raw = kind.rawValue
        let context = container.mainContext
        let descriptor = FetchDescriptor<ActivityRecord>(predicate: #Predicate<ActivityRecord> { $0.sourceRaw == raw })
        for record in (try? context.fetch(descriptor)) ?? [] {
            context.delete(record)
        }
        try? context.save()
        WidgetRefresher.reload()
    }

    // MARK: - Helpers

    static func syncStartDate(now: Date = .now) -> Date {
        let calendar = BudgetCalculator.weekCalendar
        let today = calendar.startOfDay(for: now)
        let lookback = calendar.date(byAdding: .day, value: -(lookbackDays - 1), to: today) ?? today
        let weekStart = BudgetCalculator.week(containing: now, calendar: calendar).start
        return min(lookback, weekStart)
    }

    private func records(for kind: ActivitySourceKind, since: Date, in context: ModelContext) throws -> [ActivityRecord] {
        let raw = kind.rawValue
        let descriptor = FetchDescriptor<ActivityRecord>(
            predicate: #Predicate<ActivityRecord> { $0.sourceRaw == raw && $0.startDate >= since }
        )
        return try context.fetch(descriptor)
    }

    /// Upserts fetched activities; deletes local ones that disappeared at the source.
    /// Returns `true` if anything changed.
    private func apply(
        _ result: ActivityFetchResult,
        kind: ActivitySourceKind,
        existing: [ActivityRecord],
        in context: ModelContext
    ) -> Bool {
        var changed = false
        var byID: [String: ActivityRecord] = [:]
        for record in existing {
            if byID[record.externalID] == nil {
                byID[record.externalID] = record
            } else {
                context.delete(record) // duplicate
                changed = true
            }
        }

        let fetchedIDs = Set(result.activities.map(\.externalID))
        for activity in result.activities {
            if let record = byID[activity.externalID] {
                if ImportedActivity(record: record) != activity {
                    record.update(from: activity)
                    changed = true
                }
            } else {
                context.insert(ActivityRecord(source: kind, activity: activity))
                changed = true
            }
        }

        if result.isComplete {
            for (id, record) in byID where !fetchedIDs.contains(id) {
                context.delete(record)
                changed = true
            }
        }
        return changed
    }
}

extension ImportedActivity {
    init(record: ActivityRecord) {
        self.init(
            externalID: record.externalID,
            name: record.name,
            type: record.activityType,
            startDate: record.startDate,
            durationSeconds: record.durationSeconds,
            distanceMeters: record.distanceMeters,
            activeCalories: record.activeCalories,
            caloriesEstimated: record.caloriesEstimated,
            detailsComplete: record.detailsComplete
        )
    }
}

extension ActivityRecord {
    convenience init(source: ActivitySourceKind, activity: ImportedActivity) {
        self.init(
            source: source,
            externalID: activity.externalID,
            name: activity.name,
            activityType: activity.type,
            startDate: activity.startDate,
            durationSeconds: activity.durationSeconds,
            distanceMeters: activity.distanceMeters,
            activeCalories: activity.activeCalories,
            caloriesEstimated: activity.caloriesEstimated,
            detailsComplete: activity.detailsComplete
        )
    }

    func update(from activity: ImportedActivity) {
        name = activity.name
        activityType = activity.type
        startDate = activity.startDate
        durationSeconds = activity.durationSeconds
        distanceMeters = activity.distanceMeters
        activeCalories = activity.activeCalories
        caloriesEstimated = activity.caloriesEstimated
        detailsComplete = activity.detailsComplete
        updatedAt = .now
    }
}
