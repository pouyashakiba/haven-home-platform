import RoomPlan
import SwiftUI

struct ScannerRootView: View {
    @ObservedObject var model: ScannerViewModel

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.075, blue: 0.065).ignoresSafeArea()
            if !model.isSupported {
                MessageView(icon: "sensor.tag.radiowaves.forward", title: "LiDAR required", message: "Haven Scanner needs a LiDAR-equipped iPhone or iPad Pro running iOS 17 or later.")
            } else if model.context == nil {
                MessageView(icon: "viewfinder", title: "Ready to scan", message: "Open Haven in Safari on this phone and tap Scan home. The website will securely start the scanner.")
            } else {
                scanner
            }
        }
        .tint(Color(red: 0.44, green: 0.88, blue: 0.75))
    }

    private var scanner: some View {
        ZStack {
            RoomCaptureContainer(model: model).ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.64), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 170).frame(maxHeight: .infinity, alignment: .top).ignoresSafeArea()

            VStack(spacing: 0) {
                scannerHeader
                Spacer()
                if model.phase == .scanning {
                    if let candidate = model.currentSmartCandidate {
                        SmartObjectConfirmationCard(model: model, candidate: candidate)
                            .padding(.bottom, 10)
                    }
                    DetectionTray(model: model)
                }
            }

            if model.phase == .processing || model.phase == .uploading {
                ProgressOverlay(title: model.phase == .processing ? "Building floor plan" : "Sending to Haven", detail: model.phase == .processing ? "Cleaning walls and recognized objects…" : "Saving securely on your home server…")
            }
            if model.phase == .reviewing { ReviewOverlay(model: model) }
            if case .failed(let message) = model.phase { FailureOverlay(model: model, message: message) }
        }
    }

    private var scannerHeader: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("HAVEN SCANNER").font(.caption2.weight(.bold)).tracking(1.4).foregroundStyle(.mint)
                Text(model.phase == .scanning ? "Room \(model.completedRoomCount + 1) · \(model.liveSummary.total) live detections" : "Room \(model.completedRoomCount + 1)")
                    .font(.headline).foregroundStyle(.white)
            }
            Spacer()
            Button("Cancel", action: model.cancel)
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .frame(minWidth: 62, minHeight: 44)
                .background(.black.opacity(0.34), in: Capsule())
        }
        .padding(.horizontal, 18).padding(.top, 8)
    }
}

private struct DetectionTray: View {
    @ObservedObject var model: ScannerViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("DETECTED LIVE").font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(.mint)
                    Text("Keep moving slowly around every wall").font(.subheadline).foregroundStyle(.white.opacity(0.68))
                }
                Spacer()
                Text("\(model.liveSummary.total)").font(.title2.bold()).foregroundStyle(.white)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    CountChip(label: "Walls", count: model.liveSummary.walls)
                    CountChip(label: "Doors", count: model.liveSummary.doors)
                    CountChip(label: "Windows", count: model.liveSummary.windows)
                    CountChip(label: "Openings", count: model.liveSummary.openings)
                    ForEach(model.liveSummary.objects) { object in
                        CountChip(label: object.name.humanized, count: object.count, highlighted: true)
                    }
                    CountChip(label: "Smart added", count: model.confirmedSmartObjectCount, highlighted: true)
                }
            }

            Button(action: model.finishCurrentRoom) {
                Label("Finish this room", systemImage: "checkmark.circle.fill")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 54)
            }
            .buttonStyle(.borderedProminent)
            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.white.opacity(0.1)))
        .padding(.horizontal, 12).padding(.bottom, 8)
    }
}

private struct SmartObjectConfirmationCard: View {
    @ObservedObject var model: ScannerViewModel
    let candidate: SmartObjectCandidate

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: candidate.category.systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.mint)
                    .frame(width: 46, height: 46)
                    .background(Color.mint.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("SMART OBJECT DETECTED").font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(.mint)
                    Text(candidate.category.title).font(.headline).foregroundStyle(.primary)
                    Text("\(candidate.confidenceLabel) · Add it at this position?").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { confirmationButtons }
                VStack(spacing: 10) { confirmationButtons }
            }
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.mint.opacity(0.28)))
        .padding(.horizontal, 12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(candidate.category.title) detected. Choose whether to add it to the floor plan.")
    }

    @ViewBuilder
    private var confirmationButtons: some View {
        Button("Not this object", action: model.ignoreCurrentSmartObject)
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity, minHeight: 44)
        Button(action: model.addCurrentSmartObject) {
            Label("Add to plan", systemImage: "plus.circle.fill")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
    }
}

private struct CountChip: View {
    let label: String
    let count: Int
    var highlighted = false

    var body: some View {
        HStack(spacing: 6) {
            Text("\(count)").font(.subheadline.bold())
            Text(label).font(.caption.weight(.medium))
        }
        .foregroundStyle(highlighted ? Color.mint : .white.opacity(count > 0 ? 0.92 : 0.45))
        .padding(.horizontal, 11).frame(minHeight: 36)
        .background((highlighted ? Color.mint : Color.white).opacity(0.1), in: Capsule())
    }
}

private struct ReviewOverlay: View {
    @ObservedObject var model: ScannerViewModel

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 42)).foregroundStyle(.mint)
            VStack(spacing: 5) {
                Text("Room captured").font(.title2.bold())
                Text("Name it now so Haven can organize detected devices.").font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            TextField("Room name", text: $model.roomName)
                .textInputAutocapitalization(.words).font(.headline)
                .padding(.horizontal, 14).frame(minHeight: 50)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            Button(action: model.scanAnotherRoom) {
                Label("Scan another room", systemImage: "plus.viewfinder")
                    .frame(maxWidth: .infinity, minHeight: 50)
            }.buttonStyle(.bordered)
            Button(action: model.finishHome) {
                Label("Finish home and return", systemImage: "arrow.up.right.square.fill")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 52)
            }.buttonStyle(.borderedProminent)
        }
        .padding(22).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(0.1)))
        .padding(18)
    }
}

private struct ProgressOverlay: View {
    let title: String
    let detail: String
    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(.mint)
            Text(title).font(.title3.bold())
            Text(detail).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary)
        }.padding(26).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24)).padding(32)
    }
}

private struct FailureOverlay: View {
    @ObservedObject var model: ScannerViewModel
    let message: String
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 38)).foregroundStyle(.orange)
            Text("Couldn’t finish the handoff").font(.title3.bold())
            Text(message).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Try upload again", action: model.retryUpload).buttonStyle(.borderedProminent).controlSize(.large)
            Button("Cancel", action: model.cancel).buttonStyle(.plain).frame(minHeight: 44)
        }.padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26)).padding(24)
    }
}

private struct MessageView: View {
    let icon: String
    let title: String
    let message: String
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: icon).font(.system(size: 48, weight: .light)).foregroundStyle(.mint)
            Text(title).font(.largeTitle.bold())
            Text(message).font(.body).multilineTextAlignment(.center).foregroundStyle(.secondary).frame(maxWidth: 330)
        }.padding(30)
    }
}

private extension String {
    var humanized: String {
        replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression)
            .capitalized
    }
}
