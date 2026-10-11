// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Background music must stay low but audible and never disturb the narration:
// while the voice speaks, the music sits 12 to 20 LU below it; where nobody
// speaks, it must still be heard (not under -36 LUFS).

export const MUSIC_RULE = {
  minGapLu: 12,
  maxGapLu: 20,
  musicOnlyFloorLufs: -36,
  // Momentary loudness (400 ms) above which the narration stem counts as speech.
  speechThresholdLufs: -35,
  windowS: 3,
  stepS: 1,
  frameS: 0.1,
  // A window is judged as « under narration » when speech fills at least half of it.
  voicedShare: 0.5,
} as const

// The steady part of mixkit-tech-house-vibes-130.mp3 (102.37 s): the track starts at
// full level after 0.35 s of silence and fades out from about 95.2 s to the end.
// Looping the whole file left a hole of up to -77 LUFS every 102 s.
export const MUSIC_LOOP = { startS: 0.5, endS: 95, crossfadeS: 2 } as const

export type MusicWindow =
  | { startS: number; kind: "voiced"; voiceLufs: number; musicLufs: number; gapLu: number }
  | { startS: number; kind: "music-only"; levelLufs: number }

export type MomentarySeries = { t: number; m: number }[]

export function parseEbur128Momentary(log: string): MomentarySeries {
  const series: MomentarySeries = []
  for (const line of log.split("\n")) {
    const match = line.match(/\bt:\s*(-?[\d.]+)\s.*?\bM:\s*(-?[\d.]+|-?inf)/)
    if (!match) continue
    const m = Number(match[2])
    series.push({ t: Number(match[1]), m: Number.isFinite(m) ? m : -120.7 })
  }
  return series
}

/** Loudness of the energy average of momentary levels (LUFS in, LUFS out). */
export function energyMean(levels: number[]): number {
  if (levels.length === 0) return -Infinity
  const mean = levels.reduce((sum, level) => sum + 10 ** (level / 10), 0) / levels.length
  return 10 * Math.log10(mean)
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * Cuts the video into 3 s windows (every second, fades excluded). A window mostly
 * filled with speech compares voice and music on the speech frames only: what the
 * listener hears while the narrator talks. A window without any speech measures the
 * final mix, i.e. what the listener hears of the music alone.
 */
export function musicWindows(voice: number[], music: number[], final: number[], options: { durationS: number; fadeInS: number; fadeOutS: number }): MusicWindow[] {
  const { frameS, windowS, stepS, speechThresholdLufs, voicedShare } = MUSIC_RULE
  const frames = Math.round(windowS / frameS)
  const windows: MusicWindow[] = []
  for (let startS = options.fadeInS; startS + windowS <= options.durationS - options.fadeOutS + 1e-9; startS += stepS) {
    const from = Math.round(startS / frameS)
    const speech: number[] = []
    for (let index = from; index < from + frames; index++) if ((voice[index] ?? -120.7) >= speechThresholdLufs) speech.push(index)
    if (speech.length >= frames * voicedShare) {
      const voiceLufs = energyMean(speech.map(index => voice[index]))
      const musicLufs = energyMean(speech.map(index => music[index] ?? -120.7))
      windows.push({ startS: round(startS), kind: "voiced", voiceLufs: round(voiceLufs), musicLufs: round(musicLufs), gapLu: round(voiceLufs - musicLufs) })
    } else if (speech.length === 0) {
      windows.push({ startS: round(startS), kind: "music-only", levelLufs: round(energyMean(final.slice(from, from + frames).map(level => level ?? -120.7))) })
    }
  }
  return windows
}

export function musicLevelIssues(windows: MusicWindow[]): string[] {
  const issues: string[] = []
  for (const window of windows) {
    if (window.kind === "voiced" && window.gapLu < MUSIC_RULE.minGapLu) issues.push(`${window.startS}s: music only ${window.gapLu} LU under the voice (too loud, minimum ${MUSIC_RULE.minGapLu})`)
    if (window.kind === "voiced" && window.gapLu > MUSIC_RULE.maxGapLu) issues.push(`${window.startS}s: music ${window.gapLu} LU under the voice (inaudible, maximum ${MUSIC_RULE.maxGapLu})`)
    if (window.kind === "music-only" && window.levelLufs < MUSIC_RULE.musicOnlyFloorLufs) issues.push(`${window.startS}s: music alone at ${window.levelLufs} LUFS (inaudible, floor ${MUSIC_RULE.musicOnlyFloorLufs})`)
  }
  return issues
}

export function musicLevelSummary(windows: MusicWindow[]) {
  const voiced = windows.filter((window): window is Extract<MusicWindow, { kind: "voiced" }> => window.kind === "voiced")
  const alone = windows.filter((window): window is Extract<MusicWindow, { kind: "music-only" }> => window.kind === "music-only")
  return {
    voicedWindows: voiced.length,
    musicOnlyWindows: alone.length,
    smallestGapLu: voiced.length ? Math.min(...voiced.map(window => window.gapLu)) : null,
    largestGapLu: voiced.length ? Math.max(...voiced.map(window => window.gapLu)) : null,
    quietestMusicOnlyLufs: alone.length ? Math.min(...alone.map(window => window.levelLufs)) : null,
  }
}

/** How many copies of the steady loop region cover the video, crossfades included. */
export function musicLoopCopies(durationS: number, loop: { startS: number; endS: number; crossfadeS: number } = MUSIC_LOOP): number {
  const length = loop.endS - loop.startS
  if (length <= loop.crossfadeS) throw new Error("Music loop region shorter than its crossfade")
  if (durationS <= length) return 1
  return Math.ceil((durationS - loop.crossfadeS) / (length - loop.crossfadeS))
}

// The music bed is compressed (the track swings by about 4 LU between its phrases) and
// played at one steady level. Measured on SHIFT_RECURRENCE (2026-10-11): sidechain
// ducking keyed on the narration widened the voice/music distance (12.1 to 21.1 LU)
// instead of holding it, because it ducks deeper under loud sentences.
export const MUSIC_MIX = {
  compressor: "threshold=0.1:ratio=4:attack=50:release=500",
  volume: 0.31,
} as const
