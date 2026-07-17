import RoomPlan
import SwiftUI

struct RoomCaptureContainer: UIViewRepresentable {
    @ObservedObject var model: ScannerViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        view.delegate = context.coordinator
        view.captureSession.delegate = context.coordinator
        context.coordinator.attach(view)
        model.attach(view)
        return view
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}

    final class Coordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
        private let model: ScannerViewModel
        private let builder = RoomBuilder(options: [.beautifyObjects])
        private let smartDetector = SmartObjectDetector()
        private weak var captureView: RoomCaptureView?
        private var detectionTimer: Timer?

        init(model: ScannerViewModel) {
            self.model = model
        }

        deinit { detectionTimer?.invalidate() }

        func attach(_ view: RoomCaptureView) {
            captureView = view
            detectionTimer?.invalidate()
            let timer = Timer(timeInterval: 1.1, repeats: true) { [weak self, weak view] _ in
                guard let self, let view,
                      let frame = view.captureSession.arSession.currentFrame else { return }
                self.smartDetector.analyze(
                    frame: frame,
                    session: view.captureSession.arSession,
                    orientation: UIDevice.current.orientation.visionImageOrientation
                ) { [weak self] candidate in
                    Task { @MainActor in self?.model.offerSmartObject(candidate) }
                }
            }
            detectionTimer = timer
            RunLoop.main.add(timer, forMode: .common)
        }

        func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
            smartDetector.observe(room: room) { [weak self] candidate in
                Task { @MainActor in self?.model.offerSmartObject(candidate) }
            }
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
