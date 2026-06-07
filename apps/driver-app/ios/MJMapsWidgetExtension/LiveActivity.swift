import ActivityKit
import SwiftUI
import WidgetKit

// ─── Activity Attributes ─────────────────────────────────────────────────────

struct ShiftActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var stopNumber:  Int
    var totalStops:  Int
    var streetName:  String
    var etaMinutes:  Int
    var progressPct: Double
  }
}

// ─── Widget Bundle ───────────────────────────────────────────────────────────

@main
struct MJMapsWidgetBundle: WidgetBundle {
  var body: some Widget {
    ShiftLiveActivity()
  }
}

// ─── Live Activity Widget ────────────────────────────────────────────────────

struct ShiftLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ShiftActivityAttributes.self) { context in
      // LOCK SCREEN presentation
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Image(systemName: "shippingbox.fill")
            .foregroundColor(.blue)
          Text("Stop \(context.state.stopNumber) of \(context.state.totalStops)")
            .font(.headline)
            .bold()
          Spacer()
          Text("\(context.state.etaMinutes) min")
            .font(.subheadline)
            .foregroundColor(.secondary)
        }
        Text(context.state.streetName)
          .font(.body)
          .lineLimit(1)
        ProgressView(value: context.state.progressPct)
          .tint(.blue)
          .scaleEffect(x: 1, y: 2)
      }
      .padding(12)
      .background(.black.opacity(0.85))
      .cornerRadius(16)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label {
            Text("Stop \(context.state.stopNumber)")
              .bold()
          } icon: {
            Image(systemName: "shippingbox.fill")
              .foregroundColor(.blue)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("\(context.state.etaMinutes) min")
            .font(.caption)
            .foregroundColor(.secondary)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.streetName)
            .font(.caption2)
            .lineLimit(1)
          ProgressView(value: context.state.progressPct)
            .tint(.blue)
        }
      } compactLeading: {
        Image(systemName: "shippingbox.fill")
          .foregroundColor(.blue)
      } compactTrailing: {
        Text("\(context.state.stopNumber)/\(context.state.totalStops)")
          .font(.caption2)
      } minimal: {
        Image(systemName: "shippingbox.fill")
          .foregroundColor(.blue)
      }
    }
  }
}