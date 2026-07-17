import Foundation

enum ScanTransferClient {
    static func upload(_ bundle: HavenScanBundle, context: ScannerLaunchContext) async throws {
        let endpoint = context.serverURL
            .appendingPathComponent("api")
            .appendingPathComponent("v1")
            .appendingPathComponent("scans")
            .appendingPathComponent(context.sessionID)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        request.httpBody = try JSONEncoder().encode(bundle)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            let message = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "The home server rejected the scan."
            throw TransferError.server(message)
        }
    }
}

private struct APIError: Decodable { let error: String }

enum TransferError: LocalizedError {
    case server(String)

    var errorDescription: String? {
        switch self {
        case .server(let message): return message.replacingOccurrences(of: "_", with: " ")
        }
    }
}
