import Foundation
import RoomPlan
import SwiftUI
import UIKit

@MainActor
final class ScannerViewModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case scanning
        case processing
        case reviewing
        case uploading
        case failed(String)
        case complete
    }

    @Published var context: ScannerLaunchContext?
    @Published var phase: Phase = .idle
    @Published var roomName = "Living room"
    @Published var liveSummary = DetectionSummary.empty
    @Published var completedRoomCount = 0

    private weak var captureView: RoomCaptureView?
    private var rooms: [NamedCapturedRoom] = []
    private var pendingRoom: CapturedRoom?
    private var shouldAutostart = false

    var isSupported: Bool { RoomCaptureSession.isSupported }

    func attach(_ view: RoomCaptureView) {
        captureView = view
        if shouldAutostart {
            shouldAutostart = false
            startCapture()
        }
    }

    func open(_ url: URL) {
        guard let launch = ScannerLaunchContext(url: url) else {
            phase = .failed("This Haven scan link is invalid.")
            return
        }
        context = launch
        rooms = []
        pendingRoom = nil
        completedRoomCount = 0
        liveSummary = .empty
        roomName = "Living room"
        shouldAutostart = true
        if captureView != nil {
            shouldAutostart = false
            startCapture()
        }
    }

    func startCapture() {
        guard isSupported, context != nil, let captureView else { return }
        liveSummary = .empty
        phase = .scanning
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    func finishCurrentRoom() {
        guard phase == .scanning else { return }
        phase = .processing
        captureView?.captureSession.stop(pauseARSession: false)
    }

    func cancel() {
        captureView?.captureSession.stop(pauseARSession: true)
        context = nil
        rooms = []
        pendingRoom = nil
        phase = .idle
        liveSummary = .empty
    }

    func updateLive(_ room: CapturedRoom) {
        guard phase == .scanning else { return }
        liveSummary = DetectionSummary(room: room)
    }

    func didProcess(_ room: CapturedRoom) {
        pendingRoom = room
        phase = .reviewing
    }

    func didFailProcessing(_ error: Error) {
        phase = .failed(error.localizedDescription)
    }

    func scanAnotherRoom() {
        commitPendingRoom()
        roomName = "Room \(rooms.count + 1)"
        startCapture()
    }

    func finishHome() {
        commitPendingRoom()
        Task { await upload() }
    }

    func retryUpload() {
        Task { await upload() }
    }

    private func commitPendingRoom() {
        guard let pendingRoom else { return }
        let cleanName = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        rooms.append(NamedCapturedRoom(name: cleanName.isEmpty ? "Room \(rooms.count + 1)" : cleanName, room: pendingRoom))
        self.pendingRoom = nil
        completedRoomCount = rooms.count
    }

    private func upload() async {
        guard let context, !rooms.isEmpty else { return }
        phase = .uploading
        do {
            let bundle = HavenScanBundle(context: context, rooms: rooms)
            try await ScanTransferClient.upload(bundle, context: context)
            phase = .complete
            if let returnURL = context.returnURL {
                await UIApplication.shared.open(returnURL)
            }
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

struct DetectionSummary: Equatable {
    let walls: Int
    let doors: Int
    let windows: Int
    let openings: Int
    let floors: Int
    let objects: [DetectionCategory]

    static let empty = DetectionSummary(walls: 0, doors: 0, windows: 0, openings: 0, floors: 0, objects: [])

    init(room: CapturedRoom) {
        walls = room.walls.count
        doors = room.doors.count
        windows = room.windows.count
        openings = room.openings.count
        floors = room.floors.count
        let grouped = Dictionary(grouping: room.objects, by: { String(describing: $0.category) })
        objects = grouped.map { DetectionCategory(name: $0.key, count: $0.value.count) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private init(walls: Int, doors: Int, windows: Int, openings: Int, floors: Int, objects: [DetectionCategory]) {
        self.walls = walls
        self.doors = doors
        self.windows = windows
        self.openings = openings
        self.floors = floors
        self.objects = objects
    }

    var total: Int { walls + doors + windows + openings + floors + objects.reduce(0) { $0 + $1.count } }
}

struct DetectionCategory: Identifiable, Equatable {
    var id: String { name }
    let name: String
    let count: Int
}
