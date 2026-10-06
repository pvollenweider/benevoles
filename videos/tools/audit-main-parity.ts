// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Exhaustive catalogue inventory against Git main; not visual certification. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { loadCatalog, loadManifest, videoDir } from "../lib/manifest"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim()
const target = git("rev-parse", "origin/main")
const previous = "cf1e2956babd0447157c800d08bcd586969789b2"
const recentCaptureBuild = "23b2d604a597820a6bd9410e411761ebe71fbd5a"
const groups: { name: string; paths: string[]; ids: string[]; review: string }[] = [
  { name: "Planning", paths: ["src/components/admin/ShiftsManager.tsx", "src/components/admin/shifts", "src/components/admin/day-timeline"], ids: ["SHIFTS_ROLES_VIEWS", "SHIFT_CREATE_EDIT_DETAIL", "SHIFT_CREATE_SERIES", "SHIFT_TIMELINE_QUICK_ACTIONS", "SHIFT_NIGHT_DST", "SHIFT_WAITLIST_OFFER", "SHIFT_APPROVAL", "SHIFT_ELIGIBILITY_RULES"], review: "Frise/Liste, glisser pour créer, menus, champs, sauvegarde et annulation, postes longs, couleurs, limites et accès" },
  { name: "Documents", paths: ["src/app/admin/events/[id]/print", "src/lib/print-sheets.ts", "src/components/admin/AnswerSummary.tsx"], ids: ["EVENT_REPORTS", "VOLUNTEER_BADGES", "DATA_EXPORTS_ARCHIVES", "EVENT_ARCHIVE_DELETE"], review: "Ordre : bénévoles, organisateurs avec Export complet, Badges, Résumé, Archive en dernier ; synthèse des réponses ; logo ; téléchargement distinct d'une impression" },
  { name: "Événement", paths: ["src/app/admin/events/[id]/page.tsx", "src/components/admin/EventForm.tsx", "src/app/admin/events/[id]/review", "src/components/admin/EventPagesManager.tsx", "src/components/admin/EventShareLink.tsx"], ids: ["EVENT_CREATE_BLANK", "EVENT_CREATE_TEMPLATE", "EVENT_REVIEW_PUBLISH", "EVENT_VISIBILITY_REGISTRATION_WINDOW", "EVENT_DUPLICATE", "EVENT_PROGRAM_PAGES_QR", "EVENT_MILESTONES"], review: "Brouillon/publié/non répertorié/archivé, dates d'ouverture, vérifications avant publication, lien et QR, carte, contact du jour J, rappels par événement, pages et duplication" },
  { name: "Inscriptions et suivi", paths: ["src/components/admin/RegistrationsManager.tsx", "src/components/admin/registrations", "src/components/admin/InvitationsManager.tsx", "src/components/admin/OpenShiftsFinder.tsx", "src/components/admin/DayOfBoard.tsx", "src/components/admin/ActivityLog.tsx"], ids: ["REGISTRATIONS_MANAGEMENT", "ATTENDANCE_CHECK_IN", "STAFFING_GAPS", "MEMBERS_INVITATIONS", "MEMBERS_REMINDERS", "TARGETED_MESSAGES", "REMINDERS_CHANGES", "EVENT_ACTIVITY_LOG", "ORGANIZATION_ACTIVITY_LOG", "LAST_MINUTE_CHANGES", "SECTOR_LEADERS", "EMAIL_DELIVERY_FAILURES"], review: "Demande/attente/inscrit, retrait notifié, refus d'invitation, relance, vrais résultats SMTP, recherche de renforts, Jour J, annonces, responsable et libellés du journal" },
  { name: "Membres", paths: ["src/components/admin/MembersManager.tsx", "src/components/admin/MemberMergeFlow.tsx", "src/components/admin/MemberDuplicatesManager.tsx", "src/app/admin/members"], ids: ["MEMBERS_MANAGEMENT", "MEMBERS_IMPORT"], review: "Heures planifiées/attestées, période et certificat, adresse à vérifier, doublons et fusion, suppression distincte de l'effacement" },
  { name: "Organisation", paths: ["src/components/admin/OrgCharterForm.tsx", "src/components/admin/OrgLogoForm.tsx", "src/components/admin/NotificationSettingsForm.tsx", "src/app/admin/settings"], ids: ["ORG_PUBLIC_IDENTITY", "ORG_TIMEZONE_CHARTER", "ORG_TEAM_PERMISSIONS", "ORG_EMAIL_SETTINGS"], review: "Logo, nom et slug, fuseau, convention et preuve d'acceptation, rôles et permissions, paramètres effectifs de rappel/retrait" },
  { name: "Bénévole", paths: ["src/app/[eventSlug]", "src/app/my", "src/components/DayTimeline.tsx", "src/components/PushSubscribeButton.tsx", "src/components/PersonalLinkPanel.tsx"], ids: ["VOLUNTEER_DISCOVER_EVENT", "VOLUNTEER_CHOOSE_SHIFTS", "VOLUNTEER_FORM_RECAP", "VOLUNTEER_CONFIRMATION_ERRORS", "VOLUNTEER_PERSONAL_REGISTRATIONS", "VOLUNTEER_SESSION_AVAILABILITY", "VOLUNTEER_CALENDAR", "PRIVACY_PERSONAL_LINKS"], review: "Tutoiement, consentement événement et suivants, lendemain dit une fois, rappels réellement envoyés, Avant ta mission/contact, refus d'invitation, retrait, conditions du push" },
  { name: "Administration interne", paths: ["src/app/super-admin", "src/components/admin/SuperAdminMenu.tsx"], ids: ["PLATFORM_INTERNAL_ADMINISTRATION"], review: "Menu, release disponible, santé, communications et nouvel écran de retours sur les vidéos" },
  { name: "Transversal", paths: ["src/components/admin/HelpLink.tsx", "src/components/admin/AdminNav.tsx", "src/app/globals.css", "src/app/doc", "src/app/legal/privacy"], ids: ["ADMIN_NAVIGATION", "GLOBAL_SEARCH", "ACCESSIBILITY_KEYBOARD_DISPLAY", "VOLUNTEER_REGISTER", "EVENT_CREATE_PUBLISH_OVERVIEW", "ADMIN_FEATURES_OVERVIEW", "REGISTRATION_MONITOR_FOLLOWUP", "ORG_FIRST_STEPS"], review: "Toutes les zones du parcours ; aide contextuelle, nouveaux raccourcis et états, focus, documentation, confidentialité et navigation" },
]
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON reports read from disk
async function json(file: string): Promise<any | null> {
  try { return JSON.parse(await readFile(file, "utf8")) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}
async function main() {
  const changed = git("diff", "--name-only", previous, target, "--", "src", "GUIDE_ADMIN.md", "GUIDE_BENEVOLE.md").split("\n").filter(Boolean)
  const latestChanges = git("diff", "--name-only", recentCaptureBuild, target, "--", "src").split("\n").filter(Boolean)
  const rows = []
  for (const entry of (await loadCatalog()).videos) {
    const manifest = await loadManifest(entry.id)
    const directory = videoDir(manifest.slug)
    const timeline = await json(path.join(directory, "timeline.json"))
    const audit = await json(path.join(directory, "narration-audit-video.json"))
    let videoSha256: string | null = null
    try { videoSha256 = createHash("sha256").update(await readFile(path.join(directory, `${manifest.slug}.mp4`))).digest("hex") } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    const group = groups.find(group => group.ids.includes(entry.id))
    if (!group) throw new Error(`Catalogue entry lacks explicit review scope: ${entry.id}`)
    const transcriptLegacyTerms = manifest.segments.filter(s => /\btimeline\b/i.test(s.transcript)).map(s => s.id)
    const heardLegacyTerms = (audit?.segments ?? []).filter((s: { recognized?: string }) => /\btimeline\b/i.test(s.recognized ?? "")).map((s: { id: string }) => s.id)
    const sourceChanges = changed.filter(file => group.paths.some(prefix => file.startsWith(prefix)))
    const productCommit = timeline?.product?.commit ?? null
    rows.push({ id: entry.id, slug: manifest.slug, title: manifest.title, group: group.name, review: group.review, sourceChanges, videoSha256, productCommit, currentMainBuildProven: productCommit === target && !!timeline?.product?.buildId, transcriptLegacyTerms, heardLegacyTerms, recordedAt: timeline?.recordedAt ?? null, status: !videoSha256 ? "not-generated" : productCommit !== target ? "unverified-product-version" : "visual-review-required", finalDeliveryValidated: false })
  }
  const report = { checkedAt: new Date().toISOString(), targetCommit: target, developmentCheckout: git("rev-parse", "HEAD"), recentCaptureBuild, changedProductFiles: changed, changesSinceRecentCaptureBuild: latestChanges, note: "All catalogue entries inventoried. Historical provenance must never be inferred from dates or retroactively stamped. Source review and old ASR are not a fresh visual review of each MP4. No final ISO certification.", groups, videos: rows }
  await mkdir("videos/output", { recursive: true })
  await writeFile("videos/output/main-parity-audit.json", JSON.stringify(report, null, 2))
  const lines = ["# Revue de conformité des vidéos à main", "", `Référence cible vérifiée sur GitHub : \`${target}\`.`, "", `Checkout de travail : \`${report.developmentCheckout}\` ; dernière compilation de capture connue : \`${recentCaptureBuild}\`.`, "", "## Résultat de l'inventaire", "", `${rows.length} entrées examinées ; ${rows.filter(r => r.videoSha256).length} MP4 présents ; ${rows.filter(r => r.currentMainBuildProven).length} captures avec preuve de compilation sur la référence cible. **Aucune vidéo n'est certifiée 100 % conforme par cet inventaire.**`, "", "Les scripts actuels peuvent déjà dire Frise alors que l'ancien audio ou l'écran filmé dit Timeline. Une correction du manifeste n'est pas une correction du MP4. Les captures anciennes sans preuve de commit restent non vérifiées, même si un contrôle automatique de synchronisation était vert.", "", "## Écrans et comportements à reprendre", "", ...groups.flatMap(g => [`### ${g.name}`, "", g.review, "", `Vidéos : ${g.ids.join(", ")}.`, ""]), "## Matrice complète", "", "| Vidéo | Domaine | MP4 | Commit capturé prouvé | État |", "| --- | --- | --- | --- | --- |", ...rows.map(r => `| ${r.id} | ${r.group} | ${r.videoSha256 ? "oui" : "non"} | ${r.productCommit ?? "absent"} | ${r.status} |`), "", "## Conditions de validation", "", "1. Construire une copie propre de main au commit cible, sans modifier le checkout du propriétaire.", "2. Vérifier que le port vidéo sert réellement cette compilation ; enregistrer commit, BUILD_ID et scénario dans chaque timeline.", "3. Exécuter les parcours sur cette copie : libellés, emplacement, état avant/après, documents et vrais emails fictifs.", "4. Recapturer les vidéos décalées et régénérer leur narration si le contenu a évolué. Ne pas maquiller l'ancien écran ni réécrire sa provenance.", "5. Contrôler le MP4 final, les sous-titres, la voix, musique, clics/frappes et dates. Validation visuelle distincte des tests de code et ASR.", "6. Recontrôler main avant livraison : si le commit a changé, refaire l'analyse des changements et invalider les vidéos impactées.", ""]
  await writeFile("videos/MAIN_PARITY_REVIEW.md", lines.join("\n"))
  console.log(`${rows.length} videos inventoried; ${rows.filter(r => r.videoSha256).length} MP4s; ${rows.filter(r => r.currentMainBuildProven).length} captures proven on target main. See videos/MAIN_PARITY_REVIEW.md.`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Main parity inventory failed"); process.exitCode = 1 })
