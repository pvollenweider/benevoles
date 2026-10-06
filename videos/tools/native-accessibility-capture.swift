// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Native capture only: no generated speech, microphone, UI scripting or input injection.
import Foundation
import ScreenCaptureKit
import AVFoundation
import AppKit
import CoreGraphics

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
        if input.isReadyForMoreMediaData, input.append(sample) { packets += 1 }
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
        guard readers.count == 1 else { throw NSError(domain: "Native capture", code: 5, userInfo: [NSLocalizedDescriptionKey: "Real VoiceOver must be running"] ) }
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
        try await audio.startCapture()
        try await video.startCapture()
        print("Recording one training browser window and VoiceOver only for \(duration) seconds")
        fflush(stdout)
        let deadline = Date().addingTimeInterval(duration)
        var lostTrainingFocus = false
        while Date() < deadline {
            if !trainingWindowIsFront(window, browserBundle: browserBundle) {
                lostTrainingFocus = true
                break
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        try await video.stopCapture(); try await audio.stopCapture()
        try await videoSink.finish(queue: videoQueue); try await audioSink.finish(queue: audioQueue)
        guard !lostTrainingFocus else {
            throw NSError(domain: "Native capture", code: 7, userInfo: [NSLocalizedDescriptionKey: "Capture rejected: training window lost focus; no valid evidence written"])
        }
        let evidence: [String: Any] = ["recordedAt": ISO8601DateFormatter().string(from: Date()), "windowTitle": title, "browser": browserBundle, "reader": "VoiceOver", "microphone": false, "audioProcess": "com.apple.VoiceOver", "width": width, "height": height, "videoFirstPTS": videoSink.firstPTS!, "audioFirstPTS": audioSink.firstPTS!, "videoPackets": videoSink.packets, "audioPackets": audioSink.packets, "durationRequested": duration, "finalVideo": false]
        try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: files[2]), options: .withoutOverwriting)
        print("Native capture complete; audio/video timestamps retained for synchronization")
        exit(0)
    } catch { print(error.localizedDescription); exit(1) }
}
RunLoop.main.run()
