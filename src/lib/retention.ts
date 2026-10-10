// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Retention policy (#486): one source of truth for how long each kind of data is kept, why, and
 * what deletes it. The cleanup cron reads its durations from RETENTION_DAYS; the documentation
 * tables (RETENTION_GUIDE_SOURCE, docs/retention.md) and the privacy page are generated from, or checked
 * against, RETENTION; the backup CronJobs are checked against the backup durations. A stated
 * duration that isn't backed by an automated job says so (« procédure manuelle »).
 * See src/lib/__tests__/retention.test.ts.
 */

import { PAST_EVENT_NOTICE_DAYS } from "./past-event-retention"

export const RETENTION_DAYS = {
  /** Deactivated organisation, with its events, members, registrations, logs (cascade). */
  deactivatedOrganization: 30,
  /** Admin invitation never accepted, counted from its last send (a removed admin is deleted at once). */
  deactivatedAdmin: 30,
  /** A notification that failed for good, kept to investigate. */
  failedNotification: 30,
  /** Absorbed record of a member merge (#600): an inactive tombstone (`mergedIntoId` set, every
   * personal field cleared) kept only so old ids keep resolving through the merge mapping. */
  mergedMemberTombstone: 30,
  /** Per-recipient SMTP outcome (#598): same window as a failed notification, for both failures
   * and the accepted outcomes kept alongside them (needed so #599 can tell a later send to the
   * same address succeeded). */
  deliveryOutcome: 30,
  /** Targeted message (subject, text, audience, counts), #467. */
  targetedMessage: 365,
  /** Anonymous « utile ? » answer to a tutorial video (#646): not personal data, but no reason to
   * keep it longer than the videos it judges stay current; a year of answers is enough to find
   * the videos to improve, and a regenerated video starts fresh anyway (new revision). */
  videoFeedback: 365,
  /** The operator's decisions (#810): space validated, refused, suspended, deleted, block list. */
  operatorLog: 365,
  /** Self-service sign-up request (#810): name, contact name and address typed on /inscription. */
  signupRequest: 7,
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
    data: "Membres, événements (dont le contact le jour J, nom et téléphone), créneaux, inscriptions (dont la preuve d'acceptation de la convention des bénévoles pour une inscription publique : empreinte du texte accepté et date), versions de la convention déjà montrées à des bénévoles (texte par empreinte), pages, journaux d'activité, comptes administrateurs, doublons possibles ignorés, logo de l'organisation",
    purpose: "Organiser les événements de l'organisation",
    duration: `tant que l'organisation est active, événements passés compris, sauf les données des bénévoles d'un événement terminé depuis plus de 3 ans (ligne « Événement terminé depuis plus de 3 ans ») ; effacés ${d.deactivatedOrganization} jours après sa désactivation (délai compté depuis la dernière modification de l'organisation désactivée)`,
    trigger: "désactivation de l'organisation",
    mechanism: "nettoyage quotidien (cron cleanup), suppression en cascade",
    backups: inBackups,
    public: true,
  },
  {
    data: "Les mêmes données, pour une organisation suspendue pour abus (envoi de spam, contenu abusif) ; la raison de la suspension, notée par l'opérateur",
    purpose: "Enquête sur l'abus et défense des personnes visées",
    duration: "conservées pendant la suspension, jusqu'à la décision de l'opérateur : levée de la suspension (la règle ordinaire s'applique alors) ou suppression définitive",
    trigger: "suspension de l'organisation par l'opérateur",
    mechanism: "aucune suppression automatique pendant la suspension ; suppression définitive par l'opérateur",
    backups: inBackups,
    public: true,
  },
  {
    data: "Demande d'espace faite sur le site : nom de l'association, sa description et son besoin, nom et adresse email de la personne",
    purpose: "Confirmer l'adresse puis créer l'espace et son compte propriétaire",
    duration: `${d.signupRequest} jours après la demande, confirmée ou non (l'espace et le compte créés, et la description gardée sur la fiche de l'espace pour l'opérateur, suivent ensuite les règles de l'organisation ; un espace dont le mot de passe n'a jamais été choisi est effacé avec son compte ${d.deactivatedAdmin} jours après sa création)`,
    trigger: "demande sur la page d'inscription",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Liste de blocage des inscriptions : adresse email ou domaine bloqué, empreinte d'une adresse IP (jamais l'adresse elle-même), raison",
    purpose: "Empêcher les demandes d'espace abusives",
    duration: "jusqu'au retrait par l'opérateur ou jusqu'à l'échéance choisie ; une adresse IP est toujours bloquée pour une durée limitée, 90 jours au plus",
    trigger: "blocage par l'opérateur",
    mechanism: "nettoyage quotidien des entrées échues (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Journal des décisions de l'opérateur : espace validé, refusé, suspendu, désactivé ou supprimé (nom et identifiant de l'espace), ajout ou retrait de la liste de blocage (adresse ou domaine bloqué, jamais une adresse IP en clair), raison donnée, auteur et date",
    purpose: "Garder la trace des décisions de l'opérateur, y compris pour un espace supprimé depuis",
    duration: `${d.operatorLog} jours après la décision`,
    trigger: "décision de l'opérateur",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Événement supprimé par un administrateur",
    purpose: "—",
    duration: "effacé immédiatement, avec ses créneaux, inscriptions, invitations, réponses aux questions, responsables, pages, jalons, messages ciblés et son journal",
    trigger: "suppression définitive d'un événement archivé",
    mechanism: "suppression en cascade",
    backups: inBackups,
    public: true,
  },
  {
    data: "Organisation supprimée par l'opérateur du service",
    purpose: "—",
    duration: "effacée immédiatement, avec ses membres et ses administrateurs",
    trigger: "suppression définitive d'une organisation désactivée",
    mechanism: "suppression en cascade",
    backups: inBackups,
    public: true,
  },
  {
    data: "Fiche absorbée par une fusion de membres : fiche inactive sans donnée personnelle, le temps que les anciens identifiants restent résolus",
    purpose: "Historique de l'organisation et liens personnels déjà envoyés",
    duration: `${d.mergedMemberTombstone} jours après la fusion`,
    trigger: "fusion de deux fiches membre",
    mechanism: "nettoyage quotidien (cron cleanup) ; les résultats d'envoi encore liés à cette fiche sont effacés avec elle",
    backups: inBackups,
    public: true,
  },
  {
    data: "Événement terminé depuis plus de 3 ans : sur ses inscriptions, l'identité des bénévoles (nom, email, téléphone, par leur fiche de membre), leurs commentaires et téléphones ; ses réponses aux questions, invitations et responsables de secteur",
    purpose: "Ne pas garder sans fin les données personnelles d'événements anciens",
    duration: `anonymisées 3 ans après la fin de l'événement : ses inscriptions passent à une fiche « Bénévole effacé » par personne, sans lien avec sa fiche de membre (effectifs, heures et présences gardés, sans nom), le reste est effacé ; l'événement lui-même (titre, dates, créneaux, totaux) et les fiches des membres restent. L'organisation est prévenue ${PAST_EVENT_NOTICE_DAYS} jours avant la première anonymisation, puis les événements qui atteignent 3 ans sont anonymisés chaque mois. Règle appliquée lorsque l'opérateur du service l'active`,
    trigger: "3 ans après la fin de l'événement",
    mechanism: "nettoyage quotidien (cron cleanup) avec PAST_EVENT_RETENTION=enforce : un préavis unique par organisation, puis un lot par mois ; sans cette variable, observation seulement (« Statistiques » du super admin et réponse du nettoyage). Une sauvegarde restaurée est anonymisée de nouveau au lot suivant (marque `personalDataAnonymizedAt` de l'événement)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Membres retirés, inscriptions annulées ou refusées, questions archivées",
    purpose: "Historique de l'organisation",
    duration: "tant que l'organisation existe (tant que leur événement existe pour les inscriptions et les questions), sauf anonymisation 3 ans après la fin de l'événement (ligne précédente) et effacement des données personnelles d'un membre à sa demande (ligne suivante)",
    trigger: "—",
    mechanism: "effacés avec l'organisation ou l'événement",
    backups: inBackups,
    public: true,
  },
  {
    data: "Données personnelles d'un membre dont l'effacement est demandé : nom, email, téléphone, date de naissance, notes, étiquettes, disponibilités, commentaires et téléphones de ses inscriptions, invitations (dont « pas disponible »), réponses aux questions, abonnements aux notifications, désignations comme responsable de secteur à son adresse, emails en file d'envoi qui la concernent, résultats d'envoi",
    purpose: "Droit à l'effacement",
    duration: "effacées immédiatement ; la fiche devient « Bénévole effacé » et ses inscriptions restent, sans identité, pour les effectifs, les heures et l'historique",
    trigger: "effacement par un propriétaire ou un organisateur depuis la page du membre",
    mechanism: "effacement à la demande, en une transaction ; rejoué après une restauration de sauvegarde depuis le registre des effacements (procédure manuelle, docs/rgpd/procedure-effacement.md)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Registre des effacements : identifiant de la fiche effacée, empreinte salée de son adresse email (jamais l'adresse), date ; aussi écrit dans les journaux techniques",
    purpose: "Rejouer les effacements après une restauration de sauvegarde",
    duration: "tant que l'organisation existe",
    trigger: "effacement des données personnelles d'un membre",
    mechanism: "effacé avec l'organisation (cron cleanup, suppression en cascade)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Emails en file d'envoi (destinataire et contenu)",
    purpose: "Envoyer les emails",
    duration: `effacés chaque nuit une fois partis ; ceux en échec ou annulés ${d.failedNotification} jours après leur mise en file`,
    trigger: "envoi, échec définitif ou annulation (organisation désactivée)",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Résultats d'envoi par destinataire : statut accepté/rejeté/échec, motif normalisé, codes, empreinte de l'adresse",
    purpose: "Fournir l'email à l'organisation, et permettre de corriger une adresse en échec",
    duration: `${d.deliveryOutcome} jours`,
    trigger: "envoi",
    mechanism: "nettoyage quotidien (cron cleanup) ; effacés aussi si le membre est effacé",
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
    data: "Invitations d'administrateur non acceptées",
    purpose: "Permettre d'accepter ou de renvoyer l'invitation",
    duration: `effacées ${d.deactivatedAdmin} jours après leur dernier envoi`,
    trigger: "invitation ou renvoi",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: true,
  },
  {
    data: "Administrateur retiré de l'équipe",
    purpose: "—",
    duration: "effacé immédiatement",
    trigger: "retrait par un propriétaire",
    mechanism: "suppression à la demande",
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
    data: "Compteurs de limitation de fréquence (adresse IP, email saisi à la connexion ou identifiant) ; ceux de la réponse « utile ? » aux vidéos restent en mémoire du processus, jamais en base",
    purpose: "Protéger contre les abus",
    duration: "effacés au nettoyage qui suit la fin de leur fenêtre (15 minutes à 1 heure)",
    trigger: "fin de la fenêtre",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Jetons personnels en clair (colonnes héritées, sans clé de chiffrement)",
    purpose: "Renvoyer les liens personnels",
    duration: "chiffrés puis effacés au nettoyage suivant dès qu'une clé est configurée (clé obligatoire en production)",
    trigger: "configuration de TOKEN_ENCRYPTION_KEY",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Réponses « Cette vidéo vous a-t-elle été utile ? » : identifiant et révision de la vidéo, langue, oui ou non, contexte de lecture (bibliothèque vidéo ou documentation), jour ; anonymes, sans adresse IP, cookie, compte ni organisation (pas une donnée personnelle)",
    purpose: "Repérer les vidéos tutorielles à améliorer",
    duration: `${d.videoFeedback} jours`,
    trigger: "réponse",
    mechanism: "nettoyage quotidien (cron cleanup)",
    backups: inBackups,
    public: false,
  },
  {
    data: "Historique des nouveautés produit envoyées aux administrateurs (objet, contenu, auteur, nombres)",
    purpose: "Historique des envois",
    duration: "sans limite : aucune purge",
    trigger: "envoi",
    mechanism: "aucun",
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
    data: "Exports (CSV, JSON, PDF, calendrier, attestation de bénévolat)",
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

/** The organisers' documentation unit that holds their retention table (#649, guide/). */
export const RETENTION_GUIDE_SOURCE = "guide/exporter-et-conserver-ses-donnees.md"

/** The organisers' table (RETENTION_GUIDE_SOURCE): data and retention. */
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
