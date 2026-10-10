// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Emails to organizers and admins: new registration, welcome, password reset, product updates.
 */

import type { NotificationPayload } from "../types"
import { renderMarkdown } from "@/lib/markdown"
import { clockTime } from "../../gantt-utils"
import { escapeHtml, btn, wrap, adminShiftUrl, adminStaffingUrl, adminRecentCancellationsUrl, BASE_URL, type RenderedEmail } from "./shared"
import { docUnitHref } from "@/lib/doc-href"
import { WELCOME_HELP_SLUG, welcomeDocLinks } from "@/lib/signup-welcome"
import { siteName } from "@/lib/site"

// ── Notif admin (interne) ────────────────────────────────────────────────────

export function renderAdminNotification(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    eventTitle: string
    volunteerName: string
    volunteerEmail: string
    shifts: { label: string; roleName: string; date: string; startTime: string; endTime: string }[]
  }
  const subject = `Nouvelle inscription — ${d.eventTitle}`

  const shiftLines = d.shifts.map((s) => {
    const name = s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
    return `  • ${name} · ${s.date} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`
  })

  const text = [
    `${d.volunteerName} (${d.volunteerEmail}) vient de s'inscrire à ${d.eventTitle}.`,
    ``,
    ...shiftLines,
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> (${escapeHtml(d.volunteerEmail)}) vient de s'inscrire à <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.shifts.map((s) => {
        const name = s.label && s.label !== s.roleName
          ? `${escapeHtml(s.roleName)} · ${escapeHtml(s.label)}`
          : escapeHtml(s.roleName)
        return `<li><strong>${name}</strong> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</li>`
      }).join("")}
    </ul>
  `, `${d.volunteerName} · ${d.shifts.length} créneau${d.shifts.length > 1 ? "x" : ""}`)

  return { subject, html, text }
}

// ── Désistement (#559) : admins de l'organisation, place confirmée ou demande ─
//
// Reprend le kind `registration_cancelled`, qui existait sans jamais être envoyé : son contenu
// d'origine (confirmation de désinscription au bénévole lui-même) ne correspond pas à ce dont
// cette notification a besoin (l'équipe prévenue d'un désistement), donc remplacé plutôt que
// doublé avec un nouveau kind.
export function renderWithdrawalAdminNotice(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    eventId: string
    eventTitle: string
    volunteerName: string
    shiftId: string
    shiftLabel: string
    roleName: string
    shiftDate: string
    startTime: string
    endTime: string
    placesMissing: number
    waitlistTookSpot: boolean
    message?: string | null
  }
  const shiftName = d.shiftLabel && d.shiftLabel !== d.roleName ? `${d.roleName} · ${d.shiftLabel}` : d.roleName
  const subject = `Désistement — ${d.eventTitle}`
  const shiftUrl = adminShiftUrl(d.eventId, d.shiftId)
  const staffingUrl = adminStaffingUrl(d.eventId)
  // A mistake, or a link used by someone else (#809): the place can be put back while it's free.
  const restoreUrl = d.waitlistTookSpot ? null : adminRecentCancellationsUrl(d.eventId)
  const restoreLine = "Une erreur, ou un désistement que la personne n'a pas fait ? Tant que la place est libre et que le créneau n'a pas commencé, vous pouvez rétablir l'inscription :"

  const spotLine = d.waitlistTookSpot
    ? "La place a été reprise automatiquement par la personne suivante sur la liste d'attente."
    : d.placesMissing > 0
      ? `Il manque maintenant ${d.placesMissing} place${d.placesMissing > 1 ? "s" : ""} sur ce créneau.`
      : "Ce créneau n'a pas de place manquante."

  const text = [
    `${d.volunteerName} se désiste de ${shiftName} (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)}) pour ${d.eventTitle}.`,
    ``,
    spotLine,
    ...(d.message ? [``, `Message laissé :`, `« ${d.message} »`] : []),
    ``,
    `Voir l'inscription :`,
    shiftUrl,
    ``,
    `Suivi des effectifs :`,
    staffingUrl,
    ...(restoreUrl ? [``, restoreLine, restoreUrl] : []),
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> se désiste de <strong>${escapeHtml(shiftName)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))}) pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="color:#555">${escapeHtml(spotLine)}</p>
    ${d.message ? `<p style="color:#444;background:#f3f4f6;border-radius:8px;padding:10px 14px;white-space:pre-wrap">${escapeHtml(d.message)}</p>` : ""}
    <p style="margin-top:1.25em">${btn(shiftUrl, "Voir l'inscription")}</p>
    <p style="margin-top:0.75em"><a href="${staffingUrl}" style="color:#2563eb">Suivi des effectifs</a></p>
    ${restoreUrl ? `<p style="color:#555;margin-top:1.5em">${escapeHtml(restoreLine)} <a href="${restoreUrl}" style="color:#1d4ed8;text-decoration:underline">Rétablir l'inscription</a></p>` : ""}
  `, `${d.volunteerName} se désiste de ${shiftName}.`)

  return { subject, html, text }
}

// ── Réinitialisation mot de passe ────────────────────────────────────────────

export function renderPasswordReset(p: NotificationPayload): RenderedEmail {
  const d = p.data as { adminName: string; resetUrl: string }
  const subject = `Réinitialisation de votre mot de passe`

  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous (valable 1 heure) :`,
    d.resetUrl,
    ``,
    `Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Réinitialisation de mot de passe</h2>
    <p>Bonjour ${escapeHtml(d.adminName)},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
    <p style="margin-top:1.5em">${btn(d.resetUrl, "Réinitialiser mon mot de passe")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  `, `Cliquez dans l'heure qui suit — si ce n'est pas vous, ignorez cet email.`)

  return { subject, html, text }
}

// ── Bienvenue après activation du compte admin ───────────────────────────────

export function renderAdminWelcome(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    adminName: string
    organizationName: string
    adminUrl: string
  }
  const subject = `Bienvenue sur Bénévoles — ${d.organizationName}`

  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `Votre compte administrateur pour ${d.organizationName} est maintenant actif.`,
    ``,
    `Gérez vos événements et bénévoles ici :`,
    d.adminUrl,
    ``,
    `Bonne organisation !`,
    `L'équipe Bénévoles`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bienvenue, ${escapeHtml(d.adminName)} !</h2>
    <p>Votre compte administrateur pour <strong>${escapeHtml(d.organizationName)}</strong> est maintenant actif.</p>
    <p style="margin-top:1.5em">${btn(d.adminUrl, "Accéder à mon espace admin")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Vous pouvez utiliser ce lien à tout moment pour gérer vos événements et vos bénévoles.</p>
  `, `Votre espace admin est prêt — gérez vos événements et bénévoles dès maintenant.`)

  return { subject, html, text }
}

// ── Nouveautés produit (#200) ─────────────────────────────────────────────────

export function renderProductUpdate(p: NotificationPayload): RenderedEmail {
  const { subject, content, unsubscribeUrl } = p.data as {
    subject: string
    content: string
    unsubscribeUrl: string
  }

  const text = [
    content,
    ``,
    `Vous recevez cet email en tant qu'administrateur ${siteName()}.`,
    `Se désabonner de ces communications : ${unsubscribeUrl}`,
  ].join("\n")

  const html = wrap(`
    <div style="line-height:1.6">${renderMarkdown(content)}</div>
    <p style="color:#666;font-size:0.8em;margin-top:2em;padding-top:1em;border-top:1px solid #f0f0f0">
      Vous recevez cet email en tant qu'administrateur ${escapeHtml(siteName())}.
      <a href="${unsubscribeUrl}" style="color:#666">Se désabonner</a> de ces communications.
    </p>
  `, subject)

  return { subject, html, text }
}

// ── Résumé quotidien des adresses à vérifier (#599), propriétaires et admins de l'organisation ──

export function renderAddressesToVerifySummary(p: NotificationPayload): RenderedEmail {
  const d = p.data as { count: number; members: { name: string }[]; membersUrl: string }
  const plural = d.count > 1
  const subject = `${d.count} adresse${plural ? "s" : ""} à vérifier`
  const intro = `${d.count} membre${plural ? "s ont" : " a"} un message important (confirmation, proposition de liste d'attente ou rappel) qui n'est pas arrivé dans les dernières 24 heures : le serveur destinataire a refusé l'adresse de façon définitive.`

  const text = [
    intro,
    ``,
    ...d.members.map((m) => `  • ${m.name}`),
    ``,
    `Voir les adresses à vérifier :`,
    d.membersUrl,
  ].join("\n")

  const html = wrap(`
    <p>${escapeHtml(intro)}</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.members.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")}
    </ul>
    <p style="margin-top:1.25em">${btn(d.membersUrl, "Voir les adresses à vérifier")}</p>
  `, `${d.count} adresse${plural ? "s" : ""} à vérifier.`)

  return { subject, html, text }
}

// ── Nouvelle version disponible (#612), instances auto-hébergées, super admin ────────────────

export function renderReleaseAvailable(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    version: string
    currentVersion: string
    releaseUrl: string
    upgradeDocsUrl: string
  }
  const subject = `Nouvelle version disponible : ${d.version}`

  const text = [
    `Une nouvelle version de Bénévoles est disponible : ${d.version} (vous utilisez ${d.currentVersion}).`,
    ``,
    `Notes de version :`,
    d.releaseUrl,
    ``,
    `Documentation de mise à jour :`,
    d.upgradeDocsUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Nouvelle version disponible</h2>
    <p>Une nouvelle version de Bénévoles est disponible : <strong>${escapeHtml(d.version)}</strong> (vous utilisez ${escapeHtml(d.currentVersion)}).</p>
    <p style="margin-top:1.5em">${btn(d.releaseUrl, "Voir les notes de version")}</p>
    <p style="margin-top:0.75em"><a href="${d.upgradeDocsUrl}" style="color:#2563eb">Documentation de mise à jour</a></p>
  `, `${d.version} est disponible, vous utilisez ${d.currentVersion}.`)

  return { subject, html, text }
}


/** Alert to the operator (#810): a title, a sentence, a link to the super admin space. No personal data. */
export function renderOperatorAlert(p: NotificationPayload): RenderedEmail {
  const d = p.data as { title: string; message: string; url: string | null }
  const subject = d.title
  const text = [d.message, ...(d.url ? ["", d.url] : [])].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.5em">${escapeHtml(d.title)}</h2>
    <p>${escapeHtml(d.message)}</p>
    ${d.url ? `<p style="margin-top:1.5em">${btn(d.url, "Ouvrir l'espace super admin")}</p>` : ""}
  `, d.message)
  return { subject, html, text }
}


/**
 * Confirmation of a self-service sign-up (#810). Contains **no text typed on the form** (neither
 * the association's nor the person's name): the form can send this email to any address, so
 * anything typed there could be used to phish from benevol.app's domain. The association's name
 * appears only on the confirmation page, on benevol.app, after the click.
 */
export function renderSignupConfirmation(p: NotificationPayload): RenderedEmail {
  const d = p.data as { confirmUrl: string; hours: number }
  const subject = `Confirmez votre adresse pour créer votre espace ${siteName()}`
  const text = [
    `Bonjour,`,
    ``,
    `Une demande d'espace ${siteName()} a été faite avec cette adresse. Pour la confirmer, ouvrez ce lien (valable ${d.hours} heures) :`,
    d.confirmUrl,
    ``,
    `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : rien ne sera créé.`,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Confirmez votre adresse</h2>
    <p>Bonjour,</p>
    <p>Une demande d'espace ${siteName()} a été faite avec cette adresse. Pour la confirmer, ouvrez ce lien, valable ${d.hours} heures :</p>
    <p style="margin-top:1.5em">${btn(d.confirmUrl, "Confirmer mon adresse")}</p>
    <p style="color:#4b5563;font-size:0.9em;margin-top:1.5em">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : rien ne sera créé.</p>
  `, `Confirmez votre adresse pour créer votre espace ${siteName()}.`)
  return { subject, html, text }
}

/**
 * The link to choose a password, right after a self-service sign-up is confirmed (#810). The
 * browser already goes there; this email is the copy for a person who closed the page, since an
 * inactive account cannot use « Mot de passe oublié ». No typed text, like the confirmation: it
 * goes to the address that has just been confirmed.
 */
export function renderSignupAccountLink(p: NotificationPayload): RenderedEmail {
  const d = p.data as { inviteUrl: string; days: number }
  const name = siteName()
  const docs = welcomeDocLinks(BASE_URL)
  const help = `${BASE_URL}${docUnitHref(WELCOME_HELP_SLUG)}`
  const subject = `Bienvenue sur ${name} : choisissez votre mot de passe`
  const waiting = "Nous vérifions rapidement chaque nouvel espace. En attendant, vous pouvez tout préparer : événements, postes, créneaux, membres et pages. La publication et les emails à vos bénévoles s'ouvrent dès la validation, annoncée par email."
  const text = [
    `Bienvenue sur ${name}`,
    ``,
    `Bonjour,`,
    ``,
    `Votre adresse est confirmée et votre espace ${name} est créé.`,
    ``,
    `Première étape : choisissez votre mot de passe avec ce lien, valable ${d.days} jours. Si c'est déjà fait, passez à la suite.`,
    d.inviteUrl,
    ``,
    waiting,
    ``,
    `Pour bien démarrer :`,
    ...docs.map((l) => `- ${l.label} : ${l.url}`),
    ``,
    `Une question ? Voyez « Aide et retours » : ${help}`,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bienvenue sur ${escapeHtml(name)}</h2>
    <p>Bonjour,</p>
    <p>Votre adresse est confirmée et votre espace ${escapeHtml(name)} est créé.</p>
    <p>Première étape : choisissez votre mot de passe avec le bouton ci-dessous, valable ${d.days} jours. Si c'est déjà fait, passez à la suite.</p>
    <p style="margin-top:1.5em">${btn(d.inviteUrl, "Choisir mon mot de passe")}</p>
    <p style="margin-top:1.5em">${escapeHtml(waiting)}</p>
    <h3 style="margin:1.5em 0 0.5em;font-size:1em">Pour bien démarrer</h3>
    <ul style="margin:0 0 1em 1.25em;padding-left:0">${docs.map((l) => `<li style="margin:0.25em 0"><a href="${escapeHtml(l.url)}" style="color:#1d4ed8;text-decoration:underline">${escapeHtml(l.label)}</a></li>`).join("")}</ul>
    <p style="color:#4b5563;font-size:0.9em;margin-top:1.5em">Une question ? Voyez <a href="${escapeHtml(help)}" style="color:#1d4ed8;text-decoration:underline">Aide et retours</a>.</p>
  `, `Votre espace ${name} est créé : choisissez votre mot de passe, puis suivez le guide.`)
  return { subject, html, text }
}

/** The operator validated a space created by self-service sign-up (#810): it can publish and email. */
export function renderSpaceApproved(p: NotificationPayload): RenderedEmail {
  const d = p.data as { adminName: string; organizationName: string; adminUrl: string }
  const subject = `Votre espace ${siteName()} est activé`
  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `L'espace de ${d.organizationName} est activé : vous pouvez maintenant publier vos événements et écrire à vos bénévoles.`,
    ``,
    d.adminUrl,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Votre espace est activé</h2>
    <p>Bonjour ${escapeHtml(d.adminName)},</p>
    <p>L'espace de <strong>${escapeHtml(d.organizationName)}</strong> est activé : vous pouvez maintenant publier vos événements et écrire à vos bénévoles.</p>
    <p style="margin-top:1.5em">${btn(d.adminUrl, "Ouvrir mon espace")}</p>
  `, `L'espace de ${d.organizationName} est activé.`)
  return { subject, html, text }
}


// ── Anonymisation des événements passés (#813) : préavis unique, 30 jours avant le premier lot ──

export function renderPastEventNotice(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    organizationName: string
    /** « lundi 9 novembre 2026 », in the organisation's zone. */
    firstBatchOn: string
    /** Every concerned event: the organisation must know which ones to export. */
    events: { title: string; ended: string }[]
    registrations: number
    membersOnlyOld: number
  }
  const n = d.events.length
  const subject = `Le ${d.firstBatchOn}, les noms des bénévoles de vos anciens événements seront effacés`
  const title = "Effacement des noms dans vos événements de plus de 3 ans"
  const guideUrl = `${BASE_URL}${docUnitHref("exporter-et-conserver-ses-donnees")}`
  const membersUrl = `${BASE_URL}/admin/members`
  const intro = `Pour ne pas garder sans fin les données personnelles des bénévoles, ${siteName()} anonymise les événements terminés depuis plus de 3 ans. Pour ${d.organizationName}, le premier effacement aura lieu le ${d.firstBatchOn}. Il concerne ${n > 1 ? `${n} événements` : "1 événement"} et ${d.registrations} inscription${d.registrations > 1 ? "s" : ""} :`
  const before = `Si vous avez besoin de ces données (attestations, rapports pour un financeur), téléchargez-les avant le ${d.firstBatchOn} : ouvrez chaque événement, puis « Rapports », puis « Archive de l'événement ».`
  const gone = [
    "le nom, l'email et le téléphone des bénévoles inscrits",
    "leurs commentaires et leurs réponses aux questions",
    "les invitations et les responsables de secteur de ces événements",
  ]
  const kept = [
    "les événements, leurs créneaux, les effectifs et les heures, sans nom",
    "les fiches des membres ; ces événements disparaîtront de leur historique et de leur attestation de bénévolat",
  ]
  const plural = d.membersOnlyOld > 1
  const onlyOld = d.membersOnlyOld > 0
    ? `${d.membersOnlyOld} membre${plural ? "s n'ont" : " n'a"} participé à aucun événement depuis 3 ans. ${plural ? "Leurs fiches restent" : "Sa fiche reste"} : vous pouvez ${plural ? "les" : "la"} désactiver ou effacer ${plural ? "leurs" : "ses"} données. Dans la liste des membres, triez par « Dernière participation » pour ${plural ? "les" : "la"} retrouver.`
    : null
  const after = "Ensuite, chaque mois, les événements qui atteignent 3 ans sont anonymisés de la même façon, sans nouveau message."
  const eventLine = (e: { title: string; ended: string }) => `${e.title}, terminé le ${e.ended}`
  const h3 = (t: string) => `<h3 style="margin:1.5em 0 0.5em;font-size:1em">${escapeHtml(t)}</h3>`
  const ul = (items: string[]) => `<ul style="margin:0 0 1em 1.25em;padding-left:0">${items.map((t) => `<li style="margin:0.25em 0">${escapeHtml(t)}</li>`).join("")}</ul>`

  const text = [
    title,
    ``,
    `Bonjour,`,
    ``,
    intro,
    ...d.events.map((e) => `- ${eventLine(e)}`),
    ``,
    before,
    ``,
    `Ce qui sera effacé :`,
    ...gone.map((t) => `- ${t}`),
    ``,
    `Ce qui reste :`,
    ...kept.map((t) => `- ${t}`),
    ...(onlyOld ? [``, onlyOld, `Liste des membres : ${membersUrl}`] : []),
    ``,
    after,
    ``,
    `Voir comment exporter mes données : ${guideUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">${escapeHtml(title)}</h2>
    <p>Bonjour,</p>
    <p>${escapeHtml(intro)}</p>
    ${ul(d.events.map(eventLine))}
    <p><strong>${escapeHtml(before)}</strong></p>
    ${h3("Ce qui sera effacé")}
    ${ul(gone)}
    ${h3("Ce qui reste")}
    ${ul(kept)}
    ${onlyOld ? `<p>${escapeHtml(onlyOld)}</p><p><a href="${escapeHtml(membersUrl)}" style="color:#1d4ed8;text-decoration:underline">Ouvrir la liste des membres</a></p>` : ""}
    <p>${escapeHtml(after)}</p>
    <p style="margin-top:1.25em">${btn(guideUrl, "Voir comment exporter mes données")}</p>
  `, `Si vous avez besoin des noms ou des heures de ces bénévoles, téléchargez-les avant le ${d.firstBatchOn}.`)

  return { subject, html, text }
}
