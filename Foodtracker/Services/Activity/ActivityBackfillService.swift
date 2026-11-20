import Foundation
import Observation
import OSLog
import SwiftData

/// One-time import of a source's complete activity history (summaries only).
///
/// - Pages through everything that started before the regular sync window
///   (`fixedBefore`), `pageSize` activities per request.
/// - Progress is persisted after every page, so the import resumes where it stopped
///   (app restart, rate limit, network error).
/// - On a rate limit it pauses and resumes automatically when the window resets
///   (while the app is open) or on the next launch.
@MainActor
@Observable
final class ActivityBackfillService {
    enum Phase: Equatable {
        case idle
        case running
        case paused(until: Date)
        case completed
        case failed(String)
    }

    struct State: Codable, Equatable {
        var hasStarted = false
        var isComplete = false
        /// Only activities before this date are imported; newer ones belong to the regular sync.
        var fixedBefore: Date?
        var nextPage = 1
        var importedCount = 0
        var oldestDate: Date?
        var expectedTotal: Int?
    }

    static let pageSize = 200

    private(set) var phase: Phase = .idle
    private(set) var state: State

    @ObservationIgnored private let source: any ActivityHistorySource
    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var resumeTask: Task<Void, Never>?
    @ObservationIgnored private let logger = Logger(subsystem: "Foodtracker", category: "Backfill")

    private var storageKey: String { "backfill.\(source.kind.rawValue)" }

    init(source: any ActivityHistorySource, container: ModelContainer, defaults: UserDefaults = .standard) {
        self.source = source
        self.container = container
        self.defaults = defaults
        let key = "backfill.\(source.kind.rawValue)"
        if let data = defaults.data(forKey: key), let stored = try? JSONDecoder().decode(State.self, from: data) {
            state = stored
            phase = stored.isComplete ? .completed : .idle
        } else {
            state = State()
        }
    }

    var isRunning: Bool { phase == .running }

    /// 0…1 if the total is known.
    var progress: Double? {
        guard let total = state.expectedTotal, total > 0 else { return nil }
        return min(Double(state.importedCount) / Double(total), 1)
    }

    /// Starts the import (or restarts it from scratch).
    @discardableResult
    func start(restart: Bool = false) -> Task<Void, Never> {
        resumeTask?.cancel()
        if restart || !state.hasStarted {
            state = State(hasStarted: true)
            persist()
        }
        return Task { await run() }
    }

    /// Continues an unfinished import (called on launch/foreground).
    func resumeIfNeeded() {
        guard state.hasStarted, !state.isComplete, phase != .running else { return }
        if case .paused(let until) = phase, until > .now {
            scheduleResume(at: until)
            return
        }
        Task { await run() }
    }

    /// Forgets all progress (e.g. after deleting imported activities).
    func reset() {
        resumeTask?.cancel()
        state = State()
        phase = .idle
        persist()
    }

    /// Imports pages until done, paused or failed.
    func run() async {
        guard phase != .running, state.hasStarted, !state.isComplete else { return }
        guard source.isConnected else {
            phase = .failed("Connect \(source.kind.displayName) first.")
            return
        }
        resumeTask?.cancel()
        phase = .running

        if state.fixedBefore == nil {
            state.fixedBefore = ActivitySyncService.syncStartDate()
            persist()
        }
        if state.expectedTotal == nil {
            state.expectedTotal = await source.estimatedActivityCount()
            persist()
        }
        guard let before = state.fixedBefore else { return }

        let context = container.mainContext
        while true {
            do {
                let batch = try await source.fetchHistory(before: before, page: state.nextPage, perPage: Self.pageSize)
                if !batch.isEmpty {
                    upsert(batch, in: context)
                    try context.save()
                    state.importedCount += batch.count
                    let oldest = batch.map(\.startDate).min()
                    state.oldestDate = [state.oldestDate, oldest].compactMap { $0 }.min()
                    state.nextPage += 1
                }
                if batch.count < Self.pageSize {
                    state.isComplete = true
                    persist()
                    phase = .completed
                    WidgetRefresher.reload()
                    logger.info("Backfill complete: \(self.state.importedCount) activities")
                    return
                }
                persist()
            } catch {
                persist()
                if let retry = (error as? RetryAfterError)?.retryDate {
                    phase = .paused(until: retry)
                    scheduleResume(at: retry)
                } else {
                    phase = .failed(error.localizedDescription)
                }
                WidgetRefresher.reload()
                return
            }
        }
    }

    // MARK: - Helpers

    /// Inserts new activities; refreshes summary fields of known ones without touching
    /// their calories.
    private func upsert(_ activities: [ImportedActivity], in context: ModelContext) {
        let raw = source.kind.rawValue
        let ids = activities.map(\.externalID)
        let descriptor = FetchDescriptor<ActivityRecord>(
            predicate: #Predicate<ActivityRecord> { $0.sourceRaw == raw && ids.contains($0.externalID) }
        )
        var existing: [String: ActivityRecord] = [:]
        for record in (try? context.fetch(descriptor)) ?? [] where existing[record.externalID] == nil {
            existing[record.externalID] = record
        }
        for activity in activities {
            if let record = existing[activity.externalID] {
                record.name = activity.name
                record.activityType = activity.type
                record.startDate = activity.startDate
                record.durationSeconds = activity.durationSeconds
                record.distanceMeters = activity.distanceMeters
                record.elevationMeters = activity.elevationMeters
                record.isIndoor = activity.isIndoor
                record.updatedAt = .now
            } else {
                let record = ActivityRecord(source: source.kind, activity: activity)
                context.insert(record)
                existing[activity.externalID] = record
            }
        }
    }

    private func scheduleResume(at date: Date) {
        resumeTask?.cancel()
        resumeTask = Task { [weak self] in
            let delay = max(date.timeIntervalSinceNow, 0) + 5
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.run()
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(state) {
            defaults.set(data, forKey: storageKey)
        }
    }
}
