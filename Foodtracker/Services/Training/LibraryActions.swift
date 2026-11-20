import Foundation
import SwiftData

/// Writes to the workout library.
@MainActor
enum LibraryActions {
    /// Saves content as a new template (progress removed).
    @discardableResult
    static func saveToLibrary(_ content: WorkoutContent, in context: ModelContext) -> WorkoutTemplate {
        var named = content
        named.title = content.displayTitle
        let template = WorkoutTemplate(content: named)
        context.insert(template)
        try? context.save()
        return template
    }

    static func duplicate(_ template: WorkoutTemplate, in context: ModelContext) {
        var content = template.content
        content.title = "\(template.displayName) Copy"
        context.insert(WorkoutTemplate(content: content))
        try? context.save()
    }

    static func delete(_ template: WorkoutTemplate, in context: ModelContext) {
        context.delete(template)
        try? context.save()
    }

    /// Plans a template on a day (copy on use) and records the use.
    @discardableResult
    static func schedule(_ template: WorkoutTemplate, on day: Date, in context: ModelContext) -> PlannedSession {
        template.markUsed()
        return PlanActions.addSession(template.content, on: day, templateID: template.id, in: context)
    }
}
