import SwiftUI

@main
struct HavenScannerApp: App {
    @StateObject private var model = ScannerViewModel()

    var body: some Scene {
        WindowGroup {
            ScannerRootView(model: model)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    model.open(url)
                }
        }
    }
}
