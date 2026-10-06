// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import Foundation
import Vision

let input = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let files = try JSONDecoder().decode([String].self, from: input)
var results: [[String: Any]] = []
for file in files {
    try autoreleasepool {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["fr-FR", "en-US"]
        request.usesLanguageCorrection = false
        try VNImageRequestHandler(url: URL(fileURLWithPath: file)).perform([request])
        let lines = (request.results ?? []).compactMap { observation -> (String, Double)? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            return (candidate.string, Double(observation.boundingBox.midY))
        }
        let timeline = lines.contains { $0.0.range(of: "\\btimeline\\b", options: [.regularExpression, .caseInsensitive]) != nil }
        let frise = lines.contains { $0.0.range(of: "\\bfrise\\b", options: [.regularExpression, .caseInsensitive]) != nil }
        let archive = lines.first { $0.0.localizedCaseInsensitiveContains("archive") && $0.0.contains("JSON") }
        let volunteers = lines.first { $0.0.localizedCaseInsensitiveContains("afficher ou") }
        results.append(["file": file, "timeline": timeline, "frise": frise,
            "legacyArchiveAboveVolunteerReports": archive != nil && volunteers != nil && archive!.1 > volunteers!.1])
    }
}
let output = try JSONSerialization.data(withJSONObject: results, options: [.sortedKeys])
FileHandle.standardOutput.write(output)
