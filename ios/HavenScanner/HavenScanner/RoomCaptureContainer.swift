import RoomPlan
import SwiftUI

struct RoomCaptureContainer: UIViewRepresentable {
    @ObservedObject var model: ScannerViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        view.delegate = context.coordinator
        view.captureSession.delegate = context.coordinator
        model.attach(view)
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    final class Coordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
        private let model: ScannerViewModel
        private let builder = RoomBuilder(options: [.beautifyObjects])

        init(model: ScannerViewModel) {
            self.model = model
        }

        func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
            Task { @MainActor in model.updateLive(room) }
        }

        func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
            if let error {
                Task { @MainActor in model.didFailProcessing(error) }
                return
            }
            Task {
                do {
                    let room = try await builder.capturedRoom(from: data)
                    await MainActor.run { model.didProcess(room) }
                } catch {
                    await MainActor.run { model.didFailProcessing(error) }
                }
            }
        }

        func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
            false
        }

        func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
            guard let error else { return }
            Task { @MainActor in model.didFailProcessing(error) }
        }
    }
}
