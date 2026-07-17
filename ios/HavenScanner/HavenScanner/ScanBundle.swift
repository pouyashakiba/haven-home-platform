import Foundation
import RoomPlan
import UIKit

struct ScannerLaunchContext: Equatable {
    let serverURL: URL
    let sessionID: String
    let token: String
    let callbackURL: URL

    init?(url: URL) {
        guard url.scheme == "havenscanner", url.host == "scan",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let serverText = components.value(named: "server"),
              let sessionID = components.value(named: "session"),
              let token = components.value(named: "token"),
              let callbackText = components.value(named: "callback"),
              let serverURL = URL(string: serverText),
              let callbackURL = URL(string: callbackText),
              ["http", "https"].contains(serverURL.scheme?.lowercased() ?? ""),
              ["http", "https"].contains(callbackURL.scheme?.lowercased() ?? ""),
              serverURL.host == callbackURL.host else { return nil }
        self.serverURL = serverURL
        self.sessionID = sessionID
        self.token = token
        self.callbackURL = callbackURL
    }

    var returnURL: URL? {
        guard var components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else { return nil }
        var items = components.queryItems ?? []
        items.removeAll { $0.name == "scan" }
        items.append(URLQueryItem(name: "scan", value: sessionID))
        components.queryItems = items
        return components.url
    }
}

private extension URLComponents {
    func value(named name: String) -> String? {
        queryItems?.first(where: { $0.name == name })?.value
    }
}

struct NamedCapturedRoom {
    let name: String
    let room: CapturedRoom
    let smartObjects: [SmartObjectCandidate]
}

struct HavenScanBundle: Codable {
    let schemaVersion = 1
    let sessionId: String
    let deviceName: String
    let capturedAt: String
    let rooms: [HavenScanRoom]

    init(context: ScannerLaunchContext, rooms: [NamedCapturedRoom]) {
        sessionId = context.sessionID
        deviceName = UIDevice.current.name
        capturedAt = ISO8601DateFormatter().string(from: Date())
        self.rooms = rooms.enumerated().map { index, named in
            HavenScanRoom(index: index, namedRoom: named)
        }
    }
}

struct HavenScanRoom: Codable {
    let id: String
    let name: String
    let walls: [HavenScanElement]
    let doors: [HavenScanElement]
    let windows: [HavenScanElement]
    let openings: [HavenScanElement]
    let floors: [HavenScanElement]
    let objects: [HavenScanElement]
    let smartObjects: [HavenSmartObject]

    init(index: Int, namedRoom: NamedCapturedRoom) {
        id = "room-\(index + 1)"
        name = namedRoom.name
        walls = namedRoom.room.walls.map(HavenScanElement.init)
        doors = namedRoom.room.doors.map(HavenScanElement.init)
        windows = namedRoom.room.windows.map(HavenScanElement.init)
        openings = namedRoom.room.openings.map(HavenScanElement.init)
        floors = namedRoom.room.floors.map(HavenScanElement.init)
        objects = namedRoom.room.objects.map(HavenScanElement.init)
        smartObjects = namedRoom.smartObjects.map(HavenSmartObject.init)
    }
}

struct HavenSmartObject: Codable {
    let id: String
    let category: String
    let label: String
    let confidence: String
    let dimensions: [Float]
    let transform: [Float]
    let source: String
    let sourceElementId: String?

    init(candidate: SmartObjectCandidate) {
        id = candidate.id
        category = candidate.category.rawValue
        label = candidate.category.title
        confidence = candidate.scanConfidence
        dimensions = candidate.dimensions
        transform = candidate.transform
        source = candidate.source.rawValue
        sourceElementId = candidate.sourceElementId
    }
}

struct HavenScanElement: Codable {
    let id: String
    let category: String
    let confidence: String
    let dimensions: [Float]
    let transform: [Float]

    init(surface: CapturedRoom.Surface) {
        id = surface.identifier.uuidString.lowercased()
        category = String(describing: surface.category)
        confidence = String(describing: surface.confidence)
        dimensions = surface.dimensions.array
        transform = surface.transform.array
    }

    init(object: CapturedRoom.Object) {
        id = object.identifier.uuidString.lowercased()
        category = String(describing: object.category)
        confidence = String(describing: object.confidence)
        dimensions = object.dimensions.array
        transform = object.transform.array
    }
}

private extension SIMD3 where Scalar == Float {
    var array: [Float] { [x, y, z] }
}

private extension simd_float4x4 {
    var array: [Float] {
        [
            columns.0.x, columns.0.y, columns.0.z, columns.0.w,
            columns.1.x, columns.1.y, columns.1.z, columns.1.w,
            columns.2.x, columns.2.y, columns.2.z, columns.2.w,
            columns.3.x, columns.3.y, columns.3.z, columns.3.w,
        ]
    }
}
