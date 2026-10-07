// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Native capture only: no generated speech, microphone, UI scripting or input injection.
import Foundation
import ScreenCaptureKit
import AVFoundation
import AppKit
import CoreGraphics
import CryptoKit

// Supplied by the verified-product launcher BEFORE recording. Never stamp old media.
let env = ProcessInfo.processInfo.environment
guard let proofPath = env["VIDEO_NATIVE_PRODUCT_PROOF"],
      let proofData = FileManager.default.contents(atPath: proofPath),
      let product = try JSONSerialization.jsonObject(with: proofData) as? [String: String],
      product["verification"] == "at-capture-start",
      let verified = product["verifiedAt"],
      let verifiedDate = ISO8601DateFormatter().date(from: verified),
      Date().timeIntervalSince(verifiedDate) >= 0,
      Date().timeIntervalSince(verifiedDate) <= 30,
      product["commit"]?.count == 40, product["productSourceSha256"]?.count == 64,
      !(product["buildId"] ?? "").isEmpty else { fatalError("Fresh verified product proof required before capture") }
let captureKind = env["VIDEO_NATIVE_KIND"] ?? "reader"
guard ["reader", "zoom"].contains(captureKind) else { fatalError("Invalid native capture kind") }
let locale = env["VIDEO_NATIVE_LOCALE"] ?? ""
guard ["fr-FR", "fr-CH"].contains(locale) else { fatalError("Verified French browser locale required") }
func hashFile(_ file: String) throws -> String {
    SHA256.hash(data: try Data(contentsOf: URL(fileURLWithPath: file))).map { String(format: "%02x", $0) }.joined()
}
var inputEvents = [[String: Any]]()
var captureClock: Double?
let tapCallback: CGEventTapCallBack = { _, type, event, _ in
    if let start = captureClock, [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown].contains(type) {
        inputEvents.append(["atMs": max(0, (Double(event.timestamp) / 1_000_000_000 - start) * 1000), "kind": type == .keyDown ? "key" : "click"])
    }
    return Unmanaged.passUnretained(event)
}

// Read-only guard: never let global VoiceOver speech follow another window
// while the picture remains pinned to the training window.
func trainingWindowIsFront(_ window: SCWindow, browserBundle: String) -> Bool {
    guard NSWorkspace.shared.frontmostApplication?.bundleIdentifier == browserBundle,
          let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
    let browserWindows = rows.filter {
        ($0[kCGWindowOwnerPID as String] as? Int32) == window.owningApplication?.processID &&
        ($0[kCGWindowLayer as String] as? Int) == 0
    }
    return (browserWindows.first?[kCGWindowNumber as String] as? UInt32) == window.windowID
}

final class MediaSink: NSObject, SCStreamOutput {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    let kind: SCStreamOutputType
    var firstPTS: Double?
    var packets = 0
    var lastPTS: Double?
    init(url: URL, kind: SCStreamOutputType, width: Int = 1280, height: Int = 800) throws {
        self.kind = kind
        writer = try AVAssetWriter(outputURL: url, fileType: kind == .audio ? .m4a : .mp4)
        let settings: [String: Any] = kind == .audio
            ? [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 128000]
            : [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height]
        input = AVAssetWriterInput(mediaType: kind == .audio ? .audio : .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        super.init()
        writer.add(input)
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == kind, sample.isValid else { return }
        if kind == .screen {
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue else { return }
        }
        if firstPTS == nil {
            guard writer.startWriting() else { return }
            writer.startSession(atSourceTime: sample.presentationTimeStamp)
            firstPTS = sample.presentationTimeStamp.seconds
        }
        if input.isReadyForMoreMediaData, input.append(sample) {
            packets += 1
            lastPTS = sample.presentationTimeStamp.seconds + max(0, sample.duration.seconds.isFinite ? sample.duration.seconds : 0)
        }
    }
    func finish(queue: DispatchQueue) async throws {
        queue.sync { input.markAsFinished() }
        guard firstPTS != nil else { throw NSError(domain: "Native capture", code: 2, userInfo: [NSLocalizedDescriptionKey: "No media received"] ) }
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? NSError(domain: "Native capture", code: 3) }
    }
}

guard [4, 5].contains(CommandLine.arguments.count) else { fatalError("Usage: native-accessibility-capture OUTPUT_PREFIX EXACT_TRAINING_WINDOW_TITLE SECONDS [BROWSER_BUNDLE]") }
let prefix = CommandLine.arguments[1]
let title = CommandLine.arguments[2]
let browserBundle = CommandLine.arguments.count == 5 ? CommandLine.arguments[4] : "com.apple.Safari"
guard ["com.apple.Safari", "com.brave.Browser"].contains(browserBundle) else { fatalError("Only explicitly supported training browsers accepted") }
guard prefix.hasPrefix("/tmp/") || prefix.hasPrefix("/Users/pol/Desktop/benevoles/videos/output/") else { fatalError("Local video output required") }
guard let duration = Double(CommandLine.arguments[3]), duration >= 5, duration <= 180 else { fatalError("Duration must be 5–180 seconds") }
let files = [prefix + ".mp4", prefix + ".m4a", prefix + ".json"]
guard !files.contains(where: FileManager.default.fileExists(atPath:)) else { fatalError("Refusing overwrite") }

// Initialize the WindowServer connection before configuring a window-only stream.
let application = NSApplication.shared
Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        let windows = content.windows.filter { $0.owningApplication?.bundleIdentifier == browserBundle && $0.title == title && $0.isOnScreen }
        guard windows.count == 1, let window = windows.first, let display = content.displays.first else {
            let trainingTitles = content.windows.filter { $0.owningApplication?.bundleIdentifier == browserBundle && $0.title?.contains("Un planning accessible") == true }.compactMap { $0.title }
            print("Training window titles: \(trainingTitles)")
            throw NSError(domain: "Native capture", code: 4, userInfo: [NSLocalizedDescriptionKey: "One visible browser window with the exact training title is required"] )
        }
        let readers = content.applications.filter { $0.bundleIdentifier == "com.apple.VoiceOver" }
        guard trainingWindowIsFront(window, browserBundle: browserBundle) else {
            throw NSError(domain: "Native capture", code: 6, userInfo: [NSLocalizedDescriptionKey: "Training window must be frontmost before any audio capture"])
        }
        guard captureKind == "zoom" || readers.count == 1 else { throw NSError(domain: "Native capture", code: 5, userInfo: [NSLocalizedDescriptionKey: "Real VoiceOver must be running"] ) }
        let width = Int(window.frame.width / 2) * 2
        let height = Int(window.frame.height / 2) * 2
        let videoConfig = SCStreamConfiguration()
        videoConfig.width = width; videoConfig.height = height
        videoConfig.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        videoConfig.showsCursor = true
        let video = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: videoConfig, delegate: nil)
        let audioConfig = SCStreamConfiguration()
        audioConfig.width = 2; audioConfig.height = 2
        audioConfig.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        audioConfig.capturesAudio = true; audioConfig.excludesCurrentProcessAudio = true
        audioConfig.sampleRate = 48000; audioConfig.channelCount = 2
        let audio = SCStream(filter: SCContentFilter(display: display, including: readers, exceptingWindows: []), configuration: audioConfig, delegate: nil)
        let videoQueue = DispatchQueue(label: "benevol.native.video")
        let audioQueue = DispatchQueue(label: "benevol.native.voiceover")
        let videoSink = try MediaSink(url: URL(fileURLWithPath: files[0]), kind: .screen, width: width, height: height)
        let audioSink = try MediaSink(url: URL(fileURLWithPath: files[1]), kind: .audio)
        try video.addStreamOutput(videoSink, type: .screen, sampleHandlerQueue: videoQueue)
        try audio.addStreamOutput(audioSink, type: .audio, sampleHandlerQueue: audioQueue)
        let mask = [CGEventType.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown].reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: tapCallback, userInfo: nil) else {
            throw NSError(domain: "Native capture", code: 8, userInfo: [NSLocalizedDescriptionKey: "Read-only input monitoring permission required; no invented cues"])
        }
        let tapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), tapSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        let captureStartedAt = Date()
        captureClock = Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000_000
        if captureKind == "reader" { try await audio.startCapture() }
        try await video.startCapture()
        print("Recording one training browser window and VoiceOver only for \(duration) seconds")
        fflush(stdout)
        let deadline = Date().addingTimeInterval(duration)
        var lostTrainingFocus = false
        var checks = 0
        var maxGapMs = 0.0
        var lastCheck = captureStartedAt
        while Date() < deadline {
            let now = Date()
            maxGapMs = max(maxGapMs, now.timeIntervalSince(lastCheck) * 1000)
            lastCheck = now; checks += 1
            if !trainingWindowIsFront(window, browserBundle: browserBundle) {
                lostTrainingFocus = true
                break
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let captureEndedAt = Date()
        CGEvent.tapEnable(tap: tap, enable: false)
        captureClock = nil
        CFRunLoopRemoveSource(CFRunLoopGetMain(), tapSource, .commonModes)
        try await video.stopCapture()
        if captureKind == "reader" { try await audio.stopCapture() }
        try await videoSink.finish(queue: videoQueue)
        if captureKind == "reader" { try await audioSink.finish(queue: audioQueue) }
        guard !lostTrainingFocus else {
            throw NSError(domain: "Native capture", code: 7, userInfo: [NSLocalizedDescriptionKey: "Capture rejected: training window lost focus; no valid evidence written"])
        }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var evidence: [String: Any] = ["schemaVersion": 1, "kind": captureKind, "captureSessionId": UUID().uuidString, "captureStartedAt": formatter.string(from: captureStartedAt), "captureEndedAt": formatter.string(from: captureEndedAt), "product": product, "locale": locale, "platform": "macOS", "windowTitle": title, "browser": browserBundle, "frontWindowGuard": ["checkedFromStart": true, "lostFocus": false, "checks": checks, "maxGapMs": maxGapMs], "video": ["path": files[0], "sha256": try hashFile(files[0]), "durationMs": ((videoSink.lastPTS ?? videoSink.firstPTS!) - videoSink.firstPTS!) * 1000], "inputEvents": inputEvents, "finalVideo": false]
        if captureKind == "reader" {
            evidence["reader"] = "VoiceOver"; evidence["microphone"] = false; evidence["audioProcess"] = "com.apple.VoiceOver"
            evidence["audio"] = ["path": files[1], "sha256": try hashFile(files[1]), "durationMs": ((audioSink.lastPTS ?? audioSink.firstPTS!) - audioSink.firstPTS!) * 1000]
            evidence["sync"] = ["videoFirstPTS": videoSink.firstPTS!, "audioFirstPTS": audioSink.firstPTS!]
        }
        try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: files[2]), options: .withoutOverwriting)
        print("Native capture complete; audio/video timestamps retained for synchronization")
        exit(0)
    } catch { print(error.localizedDescription); exit(1) }
}
RunLoop.main.run()
