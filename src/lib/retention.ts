// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Retention policy (#486): one source of truth for how long each kind of data is kept, why, and
 * what deletes it. The cleanup cron reads its durations from RETENTION_DAYS; the documentation
 * tables (GUIDE_ADMIN.md, docs/retention.md) and the privacy page are generated from, or checked
 * against, RETENTION; the backup CronJobs are checked against the backup durations. A stated
 * duration that isn't backed by an automated job says so (« procédure manuelle »).
 * See src/lib/__tests__/retention.test.ts.
 */

export const RETENTION_DAYS = {
  /** Deactivated organisation, with its events, members, registrations, logs (cascade). */
  deactivatedOrganization: 30,
  /** Deactivated or removed admin account. */
  deactivatedAdmin: 30,
  /** A notification that failed for good, kept to investigate. */
  failedNotification: 30,
  /** Targeted message (subject, text, audience, counts), #467. */
  targetedMessage: 365,
  /** Encrypted database dump on the server. */
  localBackup: 30,
  /** Copy of the encrypted dumps off site. */
  offsiteBackup: 90,
  /** Container logs, rotated on the nodes (manual setup, k8s/log-rotation.md). */
  technicalLogs: 90,
} as const

export const DAY_MS = 24 * 60 * 60 * 1000
export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS)

export type RetentionEntry = {
  data: string
  purpose: string
  /** In words, for people. */
  duration: string
  trigger: string
  mechanism: string
  backups: string
  /** Shown in the organisers' guide and the privacy page (the rest is operator detail). */
  public: boolean
}

const d = RETENTION_DAYS
const inBackups = `oui, jusqu'à ${d.localBackup} jours sur le serveur et ${d.offsiteBackup} jours hors site`

export const RETENTION: readonly RetentionEntry[] = [
  {
    data: "Membres, événements, créneaux, inscriptions, pages, journaux d'activité",
    purpose: "Organiser les événements de l'organisation",
    duration: `tant que l'organisation est active ; effacés ${d.deactivatedOrganization} jours après sa désactivation`,
    trigger: "désactivation de l'organisation",
    mechanism: "nettoyage quotidien (cron cleanup), suppression en cascade",
    backups: inBackups,
    public: true,
  },
  {
    data: "Événement supprimé par un administrateur",
    purpose: "—",
    duration: "effacé immédiatement, avec ses créneaux, inscriptions et invitations",
    trigger: "suppression définitive d'un événement archivé",
    mechanism: "suppression en cascade",
    backups: inBackups,
    public: true,
  },
  {
    data: "Emails en file d'envoi (destinataire et contenu)",
    purpose: "Envoyer les emails",
    duration: `effacés chaque nuit une fois partis ; ceux en échec après ${d.failedNotification} jours`,
    trigger: "envoi, ou échec définitif",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Messages ciblés (objet, texte, public, nombres)",
    purpose: "Historique des communications de l'événement",
    duration: `${d.targetedMessage} jours, ou avec l'événement`,
    trigger: "envoi du message",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Comptes administrateurs désactivés",
    purpose: "Permettre une réactivation",
    duration: `effacés après ${d.deactivatedAdmin} jours`,
    trigger: "désactivation ou retrait du compte",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Bénévoles sans organisation ni inscription",
    purpose: "—",
    duration: "effacés au nettoyage suivant",
    trigger: "plus aucune inscription ni organisation",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Jetons de réinitialisation de mot de passe expirés",
    purpose: "Sécurité",
    duration: "effacés dès leur expiration, au nettoyage suivant",
    trigger: "expiration",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Compteurs de limitation de fréquence (adresse IP ou identifiant)",
    purpose: "Protéger contre les abus",
    duration: "effacés à la fin de leur fenêtre (au plus 1 heure)",
    trigger: "fin de la fenêtre",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Abonnements aux notifications du navigateur",
    purpose: "Envoyer les rappels et messages sur l'appareil",
    duration: "jusqu'au désabonnement, ou dès que le service de notification signale l'appareil disparu",
    trigger: "désabonnement ou réponse 404/410 du service",
    mechanism: "suppression à l'envoi",
    backups: inBackups,
    public: false,
  },
  {
    data: "Sauvegardes chiffrées de la base",
    purpose: "Restaurer après un incident",
    duration: `${d.localBackup} jours sur le serveur, ${d.offsiteBackup} jours en copie hors site`,
    trigger: "création de la sauvegarde",
    mechanism: "rotation par les CronJobs de sauvegarde (k8s/cronjob-backup*.yaml)",
    backups: "—",
    public: true,
  },
  {
    data: "Journaux techniques des conteneurs",
    purpose: "Sécurité et débogage",
    duration: `${d.technicalLogs} jours`,
    trigger: "écriture du journal",
    mechanism: "procédure manuelle : rotation sur les nœuds (k8s/log-rotation.md), à vérifier sur le serveur",
    backups: "non",
    public: false,
  },
  {
    data: "Exports (CSV, JSON, PDF, calendrier)",
    purpose: "Sortir ses données",
    duration: "rien n'est conservé : générés à la demande",
    trigger: "—",
    mechanism: "—",
    backups: "non",
    public: false,
  },
]

// Markdown table cell: backslashes first, then pipes, so an escape can't be undone.
const cell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")

/** The organisers' table (GUIDE_ADMIN.md): data and retention. */
export function retentionGuideTable(): string {
  return ["| Données | Conservation |", "|---|---|", ...RETENTION.filter((e) => e.public).map((e) => `| ${cell(e.data)} | ${cell(e.duration)} |`)].join("\n")
}

/** The full matrix (docs/retention.md). */
export function retentionMatrixTable(): string {
  return [
    "| Données | Finalité | Durée | Déclencheur | Mécanisme | Dans les sauvegardes |",
    "|---|---|---|---|---|---|",
    ...RETENTION.map((e) => `| ${[e.data, e.purpose, e.duration, e.trigger, e.mechanism, e.backups].map(cell).join(" | ")} |`),
  ].join("\n")
}

export const TABLE_START = "<!-- retention:start (généré depuis src/lib/retention.ts, npm run retention:docs) -->"
export const TABLE_END = "<!-- retention:end -->"

/** Replaces the generated section of a Markdown file. */
export function withTable(markdown: string, table: string): string {
  const i = markdown.indexOf(TABLE_START)
  const j = markdown.indexOf(TABLE_END)
  if (i === -1 || j === -1 || j < i) throw new Error("retention markers missing")
  return `${markdown.slice(0, i + TABLE_START.length)}\n${table}\n${markdown.slice(j)}`
}
