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
import { existsSync, readdirSync } from "node:fs"
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { catalogEntry, loadManifest, videosRoot } from "../lib/manifest"
import {
  CATEGORY_EDUCATION,
  PRIVACIES,
  THUMBNAIL_MAX_BYTES,
  mediaUrls,
  planYoutube,
  thumbnailFilter,
  videoStatus,
  youtubeMetadata,
  type PlanItem,
  type Privacy,
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
const ids = args.filter((a, i) => !a.startsWith("--") && !(privacyIndex >= 0 && i === privacyIndex + 1))

type Client = { client_id: string; client_secret?: string }

async function loadState(): Promise<YoutubeState> {
  return existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, "utf8")) : {}
}

async function saveState(state: YoutubeState) {
  const sorted = Object.fromEntries(Object.keys(state).sort().map((k) => [k, state[k]]))
  await writeFile(STATE_FILE, JSON.stringify(sorted, null, 2) + "\n")
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

async function uploadThumbnail(token: string, videoId: string, poster: string, dir: string) {
  const out = path.join(dir, "thumbnail.jpg")
  await run("ffmpeg", ["-v", "error", "-y", "-i", poster, "-vf", thumbnailFilter(), "-q:v", "3", out])
  if ((await stat(out)).size > THUMBNAIL_MAX_BYTES) throw new Error("Vignette de plus de 2 Mo")
  const res = await fetch(`${UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: await readFile(out),
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

function describe(item: PlanItem): string {
  switch (item.action) {
    case "upload":
      return "nouvel envoi"
    case "replace":
      return `nouvelle révision ${item.revision}, l'ancienne (${item.previousVideoId}) passera en non répertoriée`
    case "finish":
      return `à terminer (${[item.captions && "sous-titres", item.thumbnail && "vignette"].filter(Boolean).join(", ")}) sur ${item.videoId}`
    case "status":
      return `visibilité ${item.from} → ${item.to}, voix de synthèse déclarée, sur ${item.videoId}`
    case "unchanged":
      return `déjà en ligne : https://youtu.be/${item.videoId}`
  }
}

async function main() {
  if (!ids.length) {
    console.error("Indiquez les vidéos à envoyer : make video-youtube ID=ADMIN_NAVIGATION (ou IDS=\"A B\").")
    process.exit(2)
  }
  if (requestedPrivacy && !PRIVACIES.includes(requestedPrivacy)) {
    console.error(`--privacy doit valoir ${PRIVACIES.join(", ")}.`)
    process.exit(2)
  }
  const state = await loadState()
  const videos = await Promise.all(
    ids.map(async (id) => {
      const entry = await catalogEntry(id)
      const manifest = await loadManifest(entry.manifest)
      const revision = (entry as { revision?: number }).revision ?? 1
      return { entry, manifest, slug: manifest.slug, revision }
    }),
  )
  const plan = planYoutube(videos, state, requestedPrivacy)

  for (const [i, item] of plan.entries()) {
    const { manifest, entry } = videos[i]
    const meta = youtubeMetadata(manifest, entry)
    console.log(`\n${entry.id} (${item.slug}, révision ${item.revision}) : ${describe(item)}`)
    if (item.action === "unchanged") continue
    const urls = mediaUrls(item.slug)
    for (const url of Object.values(urls)) {
      const head = await fetch(url, { method: "HEAD" })
      console.log(`  ${head.ok ? "ok" : `MANQUANT (${head.status})`} ${url}`)
    }
    if (item.action === "upload" || item.action === "replace") {
      console.log(`  Titre : ${meta.title}\n  Étiquettes : ${meta.tags.join(", ")}\n  Visibilité : ${privacy}\n  Description :\n${meta.description.replace(/^/gm, "    ")}`)
    }
  }

  if (!apply) {
    console.log("\nAperçu seulement. Relancez avec APPLY=1 (make video-youtube … APPLY=1) pour envoyer.")
    return
  }
  if (plan.every((item) => item.action === "unchanged")) {
    console.log("\nRien à envoyer.")
    return
  }

  const token = await accessToken()
  const failures: string[] = []
  for (const [i, item] of plan.entries()) {
    if (item.action === "unchanged") continue
    const { manifest, entry } = videos[i]
    const dir = await mkdtemp(path.join(tmpdir(), "benevol-youtube-"))
    try {
      const urls = mediaUrls(item.slug)
      let videoId: string
      if (item.action === "status") {
        await setStatus(token, item.videoId, item.to)
        Object.assign(state[item.slug], { privacy: item.to, synthetic: true })
        await saveState(state)
        console.log(`\n${entry.id} : visibilité ${item.to} : https://youtu.be/${item.videoId}`)
        continue
      }
      if (item.action === "finish") {
        videoId = item.videoId
      } else {
        console.log(`\n${entry.id} : envoi de la vidéo…`)
        videoId = await uploadVideo(token, await download(urls.mp4, dir), youtubeMetadata(manifest, entry))
        const replaced = item.action === "replace" ? [...(state[item.slug]?.replaced ?? []), item.previousVideoId] : state[item.slug]?.replaced
        state[item.slug] = { videoId, revision: item.revision, privacy, captions: false, thumbnail: false, synthetic: true, uploadedAt: new Date().toISOString(), ...(replaced ? { replaced } : {}) }
        await saveState(state)
        console.log(`  envoyée : https://youtu.be/${videoId}`)
        if (item.action === "replace") {
          await setStatus(token, item.previousVideoId, "unlisted").then(
            () => console.log(`  ancienne version ${item.previousVideoId} passée en non répertoriée`),
            (error) => failures.push(`${entry.id} : ${error.message}`),
          )
        }
      }
      const current = state[item.slug]
      if (!current.captions) {
        try {
          await uploadCaptions(token, videoId, await download(urls.vtt, dir))
          current.captions = true
          await saveState(state)
          console.log("  sous-titres ajoutés")
        } catch (error) {
          failures.push(`${entry.id} : ${(error as Error).message}`)
        }
      }
      if (!current.thumbnail) {
        try {
          await uploadThumbnail(token, videoId, await download(urls.poster, dir), dir)
          current.thumbnail = true
          await saveState(state)
          console.log("  vignette ajoutée")
        } catch (error) {
          const e = error as Error & { status?: number }
          failures.push(`${entry.id} : ${e.message}${e.status === 403 ? " (vignettes personnalisées : vérifiez la chaîne par téléphone dans YouTube Studio)" : ""}`)
        }
      }
    } catch (error) {
      failures.push(`${entry.id} : ${(error as Error).message}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  if (failures.length) {
    console.error(`\nÀ reprendre (relancer la même commande termine ce qui manque) :\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  console.log("\nTerminé. Pensez à commiter videos/youtube.json.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
