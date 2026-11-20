import SwiftUI

/// Strava connection and sync controls in Settings.
struct ActivitySettingsSection: View {
    @Environment(AppServices.self) private var services

    @State private var errorMessage: String?
    @State private var confirmDisconnect = false

    var body: some View {
        let strava = services.strava
        let sync = services.activitySync

        Section {
            if !strava.isConfigured {
                Label {
                    Text("Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to Config/Secrets.xcconfig and rebuild to connect Strava.")
                        .font(.footnote)
                } icon: {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            } else if strava.isConnected {
                LabeledContent("Strava", value: strava.athleteName ?? "Connected")
                Button {
                    Task { await sync.sync() }
                } label: {
                    HStack {
                        Text("Sync Now")
                        Spacer()
                        if sync.isSyncing {
                            ProgressView()
                        } else if let lastSync = sync.lastSync {
                            Text(lastSync, format: .relative(presentation: .named))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .disabled(sync.isSyncing)
                BackfillRow(backfill: services.backfill)
                Button("Disconnect Strava", role: .destructive) {
                    confirmDisconnect = true
                }
            } else {
                Button {
                    Task { await connect() }
                } label: {
                    HStack {
                        Label("Connect Strava", systemImage: "figure.outdoor.cycle")
                        Spacer()
                        if strava.isConnecting { ProgressView() }
                    }
                }
                .disabled(strava.isConnecting)
            }

            if let message = errorMessage ?? sync.lastError {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        } header: {
            Text("Activity")
        } footer: {
            Text("Activities and their calories from the last \(ActivitySyncService.lookbackDays) days are imported as active calories on the day they happened. Syncs when the app opens and on pull to refresh.")
        }
        .confirmationDialog("Disconnect Strava?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Disconnect, Keep Activities") {
                Task { await services.strava.disconnect() }
            }
            Button("Disconnect and Delete Activities", role: .destructive) {
                Task {
                    await services.strava.disconnect()
                    services.activitySync.deleteActivities(of: .strava)
                    services.backfill.reset()
                }
            }
        }
    }

    private func connect() async {
        errorMessage = nil
        do {
            try await services.strava.connect()
            await services.activitySync.sync()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Status and controls of the one-time history import.
struct BackfillRow: View {
    let backfill: ActivityBackfillService

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Activity History")
                Spacer()
                actionButton
            }
            switch backfill.phase {
            case .idle where !backfill.state.hasStarted:
                Text("Imports all past activities for the Stats tab (distance, time, elevation). Takes a few requests per 200 activities.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            case .running:
                if let progress = backfill.progress {
                    ProgressView(value: progress)
                }
                statusText
            default:
                statusText
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var actionButton: some View {
        switch backfill.phase {
        case .running:
            ProgressView()
        case .completed:
            Menu {
                Button("Import Again") { backfill.start(restart: true) }
            } label: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color.accentColor)
            }
        default:
            Button(backfill.state.hasStarted ? "Resume" : "Import") {
                backfill.start()
            }
            .buttonStyle(.borderless)
        }
    }

    private var statusText: some View {
        Text(statusMessage)
            .font(.footnote)
            .foregroundStyle(.secondary)
    }

    private var statusMessage: String {
        let state = backfill.state
        var parts: [String] = []
        if let total = state.expectedTotal, total > 0, !state.isComplete {
            parts.append("\(state.importedCount.formatted()) of ~\(total.formatted()) activities")
        } else {
            parts.append("\(state.importedCount.formatted()) activities")
        }
        if let oldest = state.oldestDate {
            parts.append("back to \(oldest.formatted(.dateTime.month(.abbreviated).year()))")
        }
        switch backfill.phase {
        case .paused(let until):
            parts.append("paused (rate limit), resumes \(until.formatted(date: .omitted, time: .shortened))")
        case .failed(let message):
            parts.append(message)
        case .completed:
            parts.insert("Done", at: 0)
        default:
            break
        }
        return parts.joined(separator: " · ")
    }
}
