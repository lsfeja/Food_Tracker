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
