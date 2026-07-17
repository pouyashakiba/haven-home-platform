import ARKit
import Foundation
import ImageIO
import RoomPlan
import UIKit
import Vision
import simd

enum SmartObjectCategory: String, Codable, CaseIterable {
    case smartTV = "smart_tv"
    case speaker
    case wallSwitch = "wall_switch"
    case keypad
    case smartBlind = "smart_blind"
    case thermostat

    var title: String {
        switch self {
        case .smartTV: "Smart TV"
        case .speaker: "Speaker"
        case .wallSwitch: "Wall switch"
        case .keypad: "Keypad"
        case .smartBlind: "Smart blind"
        case .thermostat: "Thermostat"
        }
    }

    var systemImage: String {
        switch self {
        case .smartTV: "tv"
        case .speaker: "hifispeaker"
        case .wallSwitch: "switch.2"
        case .keypad: "rectangle.grid.3x3"
        case .smartBlind: "blinds.horizontal.closed"
        case .thermostat: "thermometer.medium"
        }
    }

    var defaultDimensions: [Float] {
        switch self {
        case .smartTV: [1.25, 0.72, 0.08]
        case .speaker: [0.20, 0.32, 0.18]
        case .wallSwitch: [0.12, 0.12, 0.035]
        case .keypad: [0.14, 0.20, 0.04]
        case .smartBlind: [1.20, 1.20, 0.04]
        case .thermostat: [0.14, 0.14, 0.05]
        }
    }

    var wallMounted: Bool {
        switch self {
        case .smartTV, .wallSwitch, .keypad, .smartBlind, .thermostat: true
        case .speaker: false
        }
    }
}

enum SmartObjectSource: String, Codable {
    case roomPlan = "roomplan"
    case vision
}

struct SmartObjectCandidate: Identifiable, Equatable {
    let id: String
    let category: SmartObjectCategory
    let confidence: Float
    let dimensions: [Float]
    let transform: [Float]
    let source: SmartObjectSource
    let sourceElementId: String?

    var confidenceLabel: String {
        confidence >= 0.78 ? "High confidence" : confidence >= 0.48 ? "Medium confidence" : "Needs confirmation"
    }

    var scanConfidence: String {
        confidence >= 0.78 ? "high" : confidence >= 0.48 ? "medium" : "low"
    }

    var position: SIMD3<Float> {
        guard transform.count == 16 else { return .zero }
        return SIMD3(transform[12], transform[13], transform[14])
    }
}

final class SmartObjectDetector {
    private struct VisionTrack {
        var candidate: SmartObjectCandidate
        var observations: Int
        var lastSeen: Date
        var reported: Bool
    }

    private struct ImageDetection {
        let category: SmartObjectCategory
        let confidence: Float
        let point: CGPoint
    }

    private let visionQueue = DispatchQueue(label: "com.haven.scanner.smart-vision", qos: .userInitiated)
    private var isProcessingFrame = false
    private var roomPlanReported = Set<String>()
    private var tracks: [VisionTrack] = []

    func observe(room: CapturedRoom, report: @escaping (SmartObjectCandidate) -> Void) {
        for object in room.objects where object.category == .television {
            let sourceId = object.identifier.uuidString.lowercased()
            let key = "tv:\(sourceId)"
            guard roomPlanReported.insert(key).inserted else { continue }
            report(SmartObjectCandidate(
                id: "smart-\(sourceId)",
                category: .smartTV,
                confidence: confidenceValue(object.confidence),
                dimensions: object.dimensions.havenArray,
                transform: object.transform.havenArray,
                source: .roomPlan,
                sourceElementId: sourceId
            ))
        }

        for window in room.windows {
            let sourceId = window.identifier.uuidString.lowercased()
            let key = "blind:\(sourceId)"
            guard roomPlanReported.insert(key).inserted else { continue }
            report(SmartObjectCandidate(
                id: "smart-\(sourceId)",
                category: .smartBlind,
                confidence: confidenceValue(window.confidence) * 0.72,
                dimensions: window.dimensions.havenArray,
                transform: window.transform.havenArray,
                source: .roomPlan,
                sourceElementId: sourceId
            ))
        }
    }

    func analyze(frame: ARFrame, session: ARSession, orientation: CGImagePropertyOrientation, report: @escaping (SmartObjectCandidate) -> Void) {
        guard !isProcessingFrame else { return }
        isProcessingFrame = true
        let pixelBuffer = frame.capturedImage

        visionQueue.async { [weak self] in
            guard let self else { return }
            defer { self.isProcessingFrame = false }
            guard let detections = try? self.classifyObjects(in: pixelBuffer, orientation: orientation), !detections.isEmpty else { return }

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                for detection in detections {
                    let alignment: ARRaycastQuery.TargetAlignment = detection.category.wallMounted ? .vertical : .any
                    let query = frame.raycastQuery(from: detection.point, allowing: .estimatedPlane, alignment: alignment)
                    guard let result = session.raycast(query).first else { continue }
                    let candidate = SmartObjectCandidate(
                        id: "vision-\(UUID().uuidString.lowercased())",
                        category: detection.category,
                        confidence: detection.confidence,
                        dimensions: detection.category.defaultDimensions,
                        transform: result.worldTransform.havenArray,
                        source: .vision,
                        sourceElementId: nil
                    )
                    self.record(candidate, report: report)
                }
            }
        }
    }

    private func classifyObjects(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) throws -> [ImageDetection] {
        let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()
        saliency.preferBackgroundProcessing = true
        try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation).perform([saliency])
        let regions = saliency.results?.first?.salientObjects?.prefix(5) ?? []
        var detections: [ImageDetection] = []

        for region in regions {
            let classification = VNClassifyImageRequest()
            classification.preferBackgroundProcessing = true
            classification.regionOfInterest = region.boundingBox
            try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation).perform([classification])
            guard let match = bestMatch(classification.results ?? []) else { continue }
            let box = region.boundingBox
            let point = CGPoint(x: box.midX, y: 1 - box.midY)
            detections.append(ImageDetection(category: match.category, confidence: match.confidence, point: point))
        }
        return detections
    }

    private func bestMatch(_ observations: [VNClassificationObservation]) -> (category: SmartObjectCategory, confidence: Float)? {
        let vocabulary: [(SmartObjectCategory, [String])] = [
            (.smartTV, ["television", "tv set", "home theater", "monitor", "flat screen"]),
            (.speaker, ["loudspeaker", "speaker", "speaker system", "subwoofer", "soundbar"]),
            (.wallSwitch, ["light switch", "wall switch", "electric switch", "dimmer switch"]),
            (.keypad, ["keypad", "security panel", "alarm panel", "control panel"]),
            (.smartBlind, ["window blind", "venetian blind", "window shade", "roller blind"]),
            (.thermostat, ["thermostat", "temperature control", "wall control"]),
        ]

        var best: (SmartObjectCategory, Float)?
        for observation in observations.prefix(12) where observation.confidence >= 0.14 {
            let identifier = observation.identifier.lowercased()
            guard let category = vocabulary.first(where: { entry in entry.1.contains(where: { identifier.contains($0) }) })?.0 else { continue }
            if best == nil || observation.confidence > best!.1 { best = (category, observation.confidence) }
        }
        return best.map { (category: $0.0, confidence: $0.1) }
    }

    private func record(_ candidate: SmartObjectCandidate, report: @escaping (SmartObjectCandidate) -> Void) {
        let now = Date()
        tracks.removeAll { now.timeIntervalSince($0.lastSeen) > 8 }
        if let index = tracks.firstIndex(where: {
            $0.candidate.category == candidate.category && simd_distance($0.candidate.position, candidate.position) < 0.45
        }) {
            tracks[index].candidate = candidate
            tracks[index].observations += 1
            tracks[index].lastSeen = now
            if tracks[index].observations >= 2 && !tracks[index].reported {
                tracks[index].reported = true
                report(tracks[index].candidate)
            }
            return
        }
        tracks.append(VisionTrack(candidate: candidate, observations: 1, lastSeen: now, reported: false))
    }

    private func confidenceValue(_ confidence: CapturedRoom.Confidence) -> Float {
        switch confidence {
        case .high: 0.92
        case .medium: 0.66
        case .low: 0.38
        @unknown default: 0.30
        }
    }
}

extension SIMD3 where Scalar == Float {
    var havenArray: [Float] { [x, y, z] }
}

extension simd_float4x4 {
    var havenArray: [Float] {
        [
            columns.0.x, columns.0.y, columns.0.z, columns.0.w,
            columns.1.x, columns.1.y, columns.1.z, columns.1.w,
            columns.2.x, columns.2.y, columns.2.z, columns.2.w,
            columns.3.x, columns.3.y, columns.3.z, columns.3.w,
        ]
    }
}

extension UIDeviceOrientation {
    var visionImageOrientation: CGImagePropertyOrientation {
        switch self {
        case .portraitUpsideDown: .left
        case .landscapeLeft: .up
        case .landscapeRight: .down
        default: .right
        }
    }
}
