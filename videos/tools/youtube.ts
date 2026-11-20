// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sends chosen videos to the YouTube channel (@benevolapp): the published MP4, its captions (the
 * narration's VTT) and a 16:9 thumbnail made from its poster, all taken from medias.benevol.app so
 * the upload is exactly what the site shows. What was sent is kept in videos/youtube.json.
 *
 *   npm run video:youtube -- [--apply] [--privacy private|unlisted|public] ID …
 *   make video-youtube ID=… [PRIVACY=…] [APPLY=1]
 *
 * Without --apply it only prints the plan and the metadata. IDs are required: the channel carries a
 * selection, not the whole library. A new upload is private unless --privacy says otherwise (the
 * API publishes as public when nothing is said); a video already sent keeps its privacy unless
 * --privacy changes it. The narration voice is generated (Gemini) and declared as synthetic. A new revision of a video is a new upload (YouTube cannot swap
 * a file); the earlier one is set to unlisted, never deleted.
 *
 * Credentials stay outside the repository, in ~/.config/benevol-youtube/ (BENEVOL_YOUTUBE_DIR):
 * the OAuth client downloaded from Google Cloud (client.json or client_secret_*.json) and the
 * token.json this script writes after the first consent (mode 600). Nothing secret is printed.
 */
import { createHash, randomBytes } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, readdirSync } from "node:fs"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { chromium } from "playwright"
import { THEMES } from "../../src/lib/video-catalog"
import { catalogEntry, loadCatalog, loadManifest, videosRoot } from "../lib/manifest"
import { framePlacement, frameHtml, FRAME_SCALE, isPhoneRecording, thumbnailContent, thumbnailHtml, thumbnailKey, type ThumbnailContent } from "../lib/youtube-thumbnail"
import {
  CATEGORY_EDUCATION,
  PRIVACIES,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH,
  QUOTA_REASONS,
  mediaUrls,
  parseYoutubeState,
  planYoutube,
  playlistMetadata,
  videoStatus,
  youtubeMetadata,
  type PlanItem,
  type Privacy,
  type VideoFormat,
  type YoutubeState,
} from "../lib/youtube-plan"

const run = promisify(execFile)
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API = "https://www.googleapis.com/youtube/v3"
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3"
const STATE_FILE = path.join(videosRoot, "youtube.json")
const CONFIG_DIR = process.env.BENEVOL_YOUTUBE_DIR || path.join(homedir(), ".config", "benevol-youtube")
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json")

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const privacyIndex = args.indexOf("--privacy")
/** Asked privacy; without it a new upload is private and a video already sent keeps its own. */
const requestedPrivacy = privacyIndex >= 0 ? (args[privacyIndex + 1] as Privacy) : undefined
const privacy: Privacy = requestedPrivacy ?? "private"
const exceptIndex = args.indexOf("--except")
const except = new Set(exceptIndex >= 0 ? (args[exceptIndex + 1] ?? "").split(/[\s,]+/).filter(Boolean) : [])
const all = args.includes("--all")
const ids = args
  .filter((a, i) => !a.startsWith("--") && !(privacyIndex >= 0 && i === privacyIndex + 1) && !(exceptIndex >= 0 && i === exceptIndex + 1))
  .flatMap((a) => a.split(/[\s,]+/))
  .filter(Boolean)

/** The daily quota is spent: stop, a later run resumes where this one stopped. */
class QuotaError extends Error {}

type Client = { client_id: string; client_secret?: string }

async function loadState(): Promise<YoutubeState> {
  return parseYoutubeState(existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, "utf8")) : {})
}

const sortKeys = <T,>(record: Record<string, T>) => Object.fromEntries(Object.keys(record).sort().map((k) => [k, record[k]]))

async function saveState(state: YoutubeState) {
  await writeFile(STATE_FILE, JSON.stringify({ playlists: sortKeys(state.playlists), videos: sortKeys(state.videos) }, null, 2) + "\n")
}

async function loadClient(): Promise<Client> {
  const names = existsSync(CONFIG_DIR) ? readdirSync(CONFIG_DIR).filter((f) => f === "client.json" || /^client_secret.*\.json$/.test(f)) : []
  if (names.length !== 1) {
    throw new Error(`Il faut exactement un client OAuth dans ${CONFIG_DIR} (client.json ou client_secret_*.json), trouvé : ${names.length}.`)
  }
  const raw = JSON.parse(await readFile(path.join(CONFIG_DIR, names[0]), "utf8"))
  const client = raw.installed ?? raw.web
  if (!client?.client_id) throw new Error(`${names[0]} ne ressemble pas à un client OAuth « Application de bureau ».`)
  return { client_id: client.client_id, client_secret: client.client_secret }
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) throw new Error(`Jeton refusé par Google (${res.status} ${json.error ?? ""} ${json.error_description ?? ""}).`.trim())
  return { access_token: json.access_token, refresh_token: json.refresh_token }
}

/** First run: consent in the browser through a loopback redirect with PKCE (installed-app flow). */
async function consent(client: Client): Promise<string> {
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const stateParam = randomBytes(16).toString("hex")
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  const redirectUri = `http://127.0.0.1:${port}`
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: stateParam,
    access_type: "offline",
    prompt: "consent",
  }).toString()
  console.log("\nAutorisation YouTube : ouvrez ce lien avec le compte qui gère la chaîne @benevolapp :\n" + url.toString() + "\n")
  execFile("open", [url.toString()], () => {})
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Pas de réponse de Google en 5 minutes.")), 5 * 60_000)
    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams
      if (params.get("state") !== stateParam) {
        res.writeHead(400).end("Réponse inattendue.")
        return
      }
      const got = params.get("code")
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(got ? "Autorisation reçue, vous pouvez fermer cet onglet." : "Autorisation refusée.")
      clearTimeout(timer)
      if (got) resolve(got)
      else reject(new Error(`Autorisation refusée (${params.get("error") ?? "inconnu"}).`))
    })
  }).finally(() => server.close())
  const tokens = await tokenRequest({ client_id: client.client_id, ...(client.client_secret ? { client_secret: client.client_secret } : {}), code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri })
  if (!tokens.refresh_token) throw new Error("Google n'a pas renvoyé de jeton de renouvellement ; relancez après avoir retiré l'accès de l'application dans votre compte Google.")
  await writeFile(TOKEN_FILE, JSON.stringify({ refresh_token: tokens.refresh_token, scope: SCOPE }) + "\n", { mode: 0o600 })
  await chmod(TOKEN_FILE, 0o600)
  console.log(`Jeton enregistré dans ${TOKEN_FILE} (lecture réservée à votre compte).`)
  return tokens.access_token
}

async function accessToken(): Promise<string> {
  const client = await loadClient()
  if (existsSync(TOKEN_FILE)) {
    const { refresh_token } = JSON.parse(await readFile(TOKEN_FILE, "utf8")) as { refresh_token?: string }
    if (refresh_token) {
      try {
        const body: Record<string, string> = { client_id: client.client_id, refresh_token, grant_type: "refresh_token" }
        if (client.client_secret) body.client_secret = client.client_secret
        return (await tokenRequest(body)).access_token
      } catch (error) {
        // An app left in « Testing » loses its consent after 7 days: ask again.
        console.log(`Jeton enregistré refusé (${error instanceof Error ? error.message : error}) ; nouvelle autorisation.`)
      }
    }
  }
  return consent(client)
}

async function apiError(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } }
  const reason = body.error?.errors?.[0]?.reason
  if (reason && QUOTA_REASONS.includes(reason)) return new QuotaError(`${what} : quota YouTube du jour atteint (${reason})`)
  return Object.assign(new Error(`${what} : ${res.status} ${reason ?? ""} ${body.error?.message ?? ""}`.trim()), { status: res.status, reason })
}

async function download(url: string, dir: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} : ${res.status}`)
  const file = path.join(dir, path.basename(new URL(url).pathname))
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return file
}

async function uploadVideo(token: string, file: string, metadata: ReturnType<typeof youtubeMetadata>): Promise<string> {
  const data = await readFile(file)
  const init = await fetch(`${UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(data.length),
    },
    body: JSON.stringify({
      snippet: { ...metadata, categoryId: CATEGORY_EDUCATION, defaultLanguage: "fr" },
      status: videoStatus(privacy),
    }),
  })
  const location = init.headers.get("location")
  if (!init.ok || !location) throw await apiError(init, "Début d'envoi refusé")
  const put = await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(data.length) }, body: data })
  if (!put.ok) throw await apiError(put, "Envoi de la vidéo refusé")
  const { id } = (await put.json()) as { id: string }
  return id
}

async function uploadCaptions(token: string, videoId: string, file: string) {
  const boundary = `benevol${randomBytes(12).toString("hex")}`
  const meta = JSON.stringify({ snippet: { videoId, language: "fr", name: "Français" } })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    await readFile(file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await fetch(`${UPLOAD_API}/captions?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  })
  if (res.status === 409) return // captionExists: already there from an earlier run
  if (!res.ok) throw await apiError(res, "Sous-titres refusés")
}

async function renderThumbnail(content: ThumbnailContent, poster: string): Promise<Buffer> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT } })
    const src = `data:image/jpeg;base64,${(await readFile(poster)).toString("base64")}`
    await page.setContent(thumbnailHtml(content, src), { waitUntil: "load" })
    await page.waitForSelector("body[data-ready]")
    return await page.screenshot({ type: "jpeg", quality: 90 })
  } finally {
    await browser.close()
  }
}

/**
 * A phone recording (portrait) would become a YouTube Short: 9:16 display, thumbnail cropped,
 * links in the description not clickable. It is sent inside a 1920 x 1080 frame instead: the
 * thumbnail's design (logo, audience, title) with the recording in a phone on the right. Same
 * frame rate and timing, audio copied, so the captions still match.
 */
async function frameVideo(content: ThumbnailContent, input: string, dir: string): Promise<string> {
  const probe = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", input])
  const stream = (JSON.parse(probe.stdout) as { streams: { width: number; height: number; r_frame_rate: string }[] }).streams[0]
  const rect = framePlacement(stream.width, stream.height)
  const background = path.join(dir, "frame.png")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }, deviceScaleFactor: FRAME_SCALE })
    await page.setContent(frameHtml(content, rect), { waitUntil: "load" })
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    await page.screenshot({ path: background, type: "png" })
  } finally {
    await browser.close()
  }
  const out = path.join(dir, "framed.mp4")
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-loop", "1", "-framerate", stream.r_frame_rate, "-i", background,
    "-i", input,
    "-filter_complex", `[1:v]scale=${rect.w}:${rect.h}:flags=lanczos,setsar=1[v];[0:v][v]overlay=${rect.x}:${rect.y}:shortest=1,format=yuv420p[out]`,
    "-map", "[out]", "-map", "1:a?",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "copy", "-movflags", "+faststart",
    out,
  ])
  return out
}

async function uploadThumbnail(token: string, videoId: string, image: Buffer) {
  if (image.length > THUMBNAIL_MAX_BYTES) throw new Error("Vignette de plus de 2 Mo")
  const res = await fetch(`${UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: new Uint8Array(image),
  })
  if (!res.ok) throw await apiError(res, "Vignette refusée")
}

/** Sets a video's privacy (and the synthetic-voice declaration) without touching anything else. */
async function setStatus(token: string, videoId: string, to: Privacy) {
  const res = await fetch(`${API}/videos?part=status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ id: videoId, status: videoStatus(to) }),
  })
  if (!res.ok) throw await apiError(res, `Changement de visibilité de ${videoId} refusé`)
}

async function createPlaylist(token: string, label: string): Promise<string> {
  const res = await fetch(`${API}/playlists?part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ snippet: { ...playlistMetadata(label), defaultLanguage: "fr" }, status: { privacyStatus: "public" } }),
  })
  if (!res.ok) throw await apiError(res, `Création de la playlist « ${label} » refusée`)
  return ((await res.json()) as { id: string }).id
}

async function addToPlaylist(token: string, playlistId: string, videoId: string) {
  const res = await fetch(`${API}/playlistItems?part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
  })
  if (!res.ok) throw await apiError(res, `Ajout à la playlist ${playlistId} refusé`)
}

/** Takes every occurrence of a video out of a playlist; returns how many were removed. */
async function removeFromPlaylist(token: string, playlistId: string, videoId: string): Promise<number> {
  const query = new URLSearchParams({ part: "id", maxResults: "50", playlistId, videoId })
  const res = await fetch(`${API}/playlistItems?${query}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw await apiError(res, `Lecture de la playlist ${playlistId} refusée`)
  const { items = [] } = (await res.json()) as { items?: { id: string }[] }
  for (const { id } of items) {
    const del = await fetch(`${API}/playlistItems?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    if (!del.ok) throw await apiError(del, `Retrait de ${videoId} de la playlist ${playlistId} refusé`)
  }
  return items.length
}

function themeTitle(id: string): string {
  return THEMES.find((t) => t.id === id)?.label ?? id
}

function describe(item: PlanItem): string {
  if (item.action === "unchanged") return `déjà en ligne : https://youtu.be/${item.videoId}`
  if (item.action === "upload") return "nouvel envoi"
  if (item.action === "replace") {
    return `nouvel envoi (révision ${item.revision} ou nouveau format), l'ancienne version (${item.previousVideoId}) ${item.previousPrivacy === "private" ? "reste privée" : "passera en non répertoriée"}${item.withdraw.length ? " et sera retirée de ses playlists" : ""}`
  }
  const todo = [
    item.captions && "sous-titres",
    item.thumbnail && "vignette",
    item.playlists.length && `playlists (${item.playlists.map(themeTitle).join(" ; ")})`,
    item.status && `visibilité ${item.status.from} → ${item.status.to}, voix de synthèse déclarée`,
    item.withdraw.length && `retrait des playlists de l'ancienne version (${item.withdraw.map((w) => w.videoId).join(", ")})`,
  ].filter(Boolean)
  return `à compléter sur ${item.videoId} : ${todo.join(", ")}`
}

async function main() {
  if (!ids.length && !all) {
    console.error("Indiquez les vidéos à envoyer : make video-youtube ID=ADMIN_NAVIGATION (ou IDS=\"A B\", ou ALL=1 [EXCEPT=\"A B\"]).")
    process.exit(2)
  }
  const selected = (all ? (await loadCatalog()).videos.filter((v) => v.published).map((v) => v.id) : ids).filter((id) => !except.has(id))
  if (requestedPrivacy && !PRIVACIES.includes(requestedPrivacy)) {
    console.error(`--privacy doit valoir ${PRIVACIES.join(", ")}.`)
    process.exit(2)
  }
  const state = await loadState()
  const videos = await Promise.all(
    selected.map(async (id) => {
      const entry = await catalogEntry(id)
      const manifest = await loadManifest(entry.manifest)
      const revision = entry.revision ?? 1
      const thumb = thumbnailContent(manifest, entry)
      const format: VideoFormat = isPhoneRecording(manifest) ? "framed" : "native"
      return { entry, manifest, slug: manifest.slug, revision, thumb, thumbnailKey: thumbnailKey(thumb), format, themes: entry.themes ?? [] }
    }),
  )
  const plan = planYoutube(videos, state, requestedPrivacy)

  for (const [i, item] of plan.entries()) {
    const { manifest, entry, thumb } = videos[i]
    const meta = youtubeMetadata(manifest, entry)
    console.log(`\n${entry.id} (${item.slug}, révision ${item.revision}) : ${describe(item)}`)
    if (item.action === "unchanged") continue
    const urls = mediaUrls(item.slug)
    for (const url of Object.values(urls)) {
      const head = await fetch(url, { method: "HEAD" })
      console.log(`  ${head.ok ? "ok" : `MANQUANT (${head.status})`} ${url}`)
    }
    if (item.action === "upload" || item.action === "replace") {
      if (videos[i].format === "framed") console.log("  Format : enregistrement téléphone, envoyé dans un cadre 16:9 (1920 x 1080)")
      console.log(`  Vignette : « ${thumb.title} », ${thumb.kicker}, ${thumb.layout === "mobile" ? "téléphone" : "navigateur"}`)
      console.log(`  Titre : ${meta.title}\n  Étiquettes : ${meta.tags.join(", ")}\n  Visibilité : ${privacy}\n  Description :\n${meta.description.replace(/^/gm, "    ")}`)
    }
  }

  const counts = plan.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.action]: (acc[item.action] ?? 0) + 1 }), {})
  console.log(`\n${plan.length} vidéo(s) : ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}`)
  if (!apply) {
    console.log("\nAperçu seulement. Relancez avec APPLY=1 (make video-youtube … APPLY=1) pour envoyer.")
    return
  }
  if (plan.every((item) => item.action === "unchanged")) {
    console.log("Rien à envoyer.")
    return
  }

  const token = await accessToken()
  const failures: string[] = []
  let quota: string | undefined
  for (const [i, item] of plan.entries()) {
    if (item.action === "unchanged") continue
    const { manifest, entry, thumb, thumbnailKey: key, format } = videos[i]
    const dir = await mkdtemp(path.join(tmpdir(), "benevol-youtube-"))
    // A step that fails is noted and the next one runs; a spent quota stops everything.
    const step = async (what: () => Promise<void>, hint = "") => {
      try {
        await what()
      } catch (error) {
        if (error instanceof QuotaError) throw error
        failures.push(`${entry.id} : ${(error as Error).message}${hint && (error as { status?: number }).status === 403 ? hint : ""}`)
      }
    }
    try {
      const urls = mediaUrls(item.slug)
      console.log(`\n${entry.id} : ${describe(item)}`)
      if (item.action === "upload" || item.action === "replace") {
        const mp4 = await download(urls.mp4, dir)
        const videoId = await uploadVideo(token, format === "framed" ? await frameVideo(thumb, mp4, dir) : mp4, youtubeMetadata(manifest, entry))
        const previous = state.videos[item.slug]
        const replaced = item.action === "replace" ? [...(previous?.replaced ?? []), item.previousVideoId!] : previous?.replaced
        state.videos[item.slug] = {
          videoId,
          revision: item.revision,
          privacy,
          captions: false,
          thumbnail: false,
          synthetic: true,
          format,
          playlists: [],
          uploadedAt: new Date().toISOString(),
          ...(replaced ? { replaced } : {}),
          ...(item.withdraw.length ? { staleInPlaylists: item.withdraw } : {}),
        }
        await saveState(state)
        console.log(`  envoyée : https://youtu.be/${videoId}`)
        if (item.action === "replace" && item.previousPrivacy !== "private") {
          await step(async () => {
            await setStatus(token, item.previousVideoId!, "unlisted")
            console.log(`  ancienne version ${item.previousVideoId} passée en non répertoriée`)
          })
        }
      }
      const current = state.videos[item.slug]
      for (const stale of item.withdraw) {
        for (const theme of stale.themes) {
          const playlist = state.playlists[theme]
          await step(async () => {
            if (playlist && (await removeFromPlaylist(token, playlist.playlistId, stale.videoId))) {
              console.log(`  ancienne version ${stale.videoId} retirée de « ${playlist.title} »`)
            }
            current.staleInPlaylists = (current.staleInPlaylists ?? [])
              .map((s) => (s.videoId === stale.videoId ? { ...s, themes: s.themes.filter((t) => t !== theme) } : s))
              .filter((s) => s.themes.length)
            if (!current.staleInPlaylists.length) delete current.staleInPlaylists
            await saveState(state)
          })
        }
      }
      if (item.status) {
        await step(async () => {
          await setStatus(token, current.videoId, item.status!.to)
          Object.assign(current, { privacy: item.status!.to, synthetic: true })
          await saveState(state)
          console.log(`  visibilité ${item.status!.to}`)
        })
      }
      if (item.captions) {
        await step(async () => {
          await uploadCaptions(token, current.videoId, await download(urls.vtt, dir))
          current.captions = true
          await saveState(state)
          console.log("  sous-titres ajoutés")
        })
      }
      if (item.thumbnail) {
        await step(async () => {
          await uploadThumbnail(token, current.videoId, await renderThumbnail(thumb, await download(urls.poster, dir)))
          Object.assign(current, { thumbnail: true, thumbnailKey: key })
          await saveState(state)
          console.log("  vignette ajoutée")
        }, " (vignettes personnalisées : vérifiez la chaîne par téléphone dans YouTube Studio)")
      }
      for (const theme of item.playlists) {
        await step(async () => {
          let playlist = state.playlists[theme]
          if (!playlist) {
            playlist = { playlistId: await createPlaylist(token, themeTitle(theme)), title: themeTitle(theme) }
            state.playlists[theme] = playlist
            await saveState(state)
            console.log(`  playlist créée : « ${playlist.title} » https://www.youtube.com/playlist?list=${playlist.playlistId}`)
          }
          await addToPlaylist(token, playlist.playlistId, current.videoId)
          current.playlists = [...(current.playlists ?? []), theme]
          await saveState(state)
          console.log(`  ajoutée à « ${playlist.title} »`)
        })
      }
    } catch (error) {
      if (error instanceof QuotaError) {
        quota = error.message
        break
      }
      failures.push(`${entry.id} : ${(error as Error).message}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  if (quota) {
    console.error(`\n${quota}. Le quota se renouvelle à minuit, heure du Pacifique (9 h en Suisse) ; relancer la même commande reprend là où celle-ci s'est arrêtée.`)
  }
  if (failures.length || quota) {
    if (failures.length) console.error(`\nÀ reprendre (relancer la même commande termine ce qui manque) :\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    await saveState(state)
    process.exit(1)
  }
  console.log("\nTerminé. Pensez à commiter videos/youtube.json.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
