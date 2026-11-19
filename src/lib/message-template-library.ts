// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The ready-made message library (#1414): 50 French templates, grouped in the eleven categories
 * below. An organiser adds one to the organisation's templates and edits it like any other; nothing
 * is added without that action. Pure (no database access): imported by the client dialog and by tests.
 *
 * Every template follows the same rules: « tu », short sentences, one topic, no jargon, at most one
 * emoji (none here), phone-length. The only variables are the ones templateProblems() knows
 * ({prénom}, {événement}, {poste} for a role or shift audience, {créneau} for a shift one). Facts
 * the organiser must fill in are written `[à compléter : hint]` and block the send until replaced.
 * The personal link and the recipient's shifts are appended to every targeted email: the bodies
 * never repeat them. No template duplicates an automatic email (confirmation, reminders, shift
 * modified or cancelled, open shifts, waitlist offer).
 */

import type { TemplateCategory } from "./message-template-category"

// The categories are part of the library; re-exported so a reader of this file finds them here too.
export { LIBRARY_CATEGORIES } from "./message-template-category"

/** Suggested audience: the same kinds as a targeted message, without the sector and waitlist ones. */
export type LibraryAudience = "event" | "role" | "shift" | "invited_without_shift"

export type LibraryTemplate = {
  /** Stable identifier of the library entry. Never shown; names are what the organiser sees. */
  id: string
  name: string
  category: Exclude<TemplateCategory, "Autres">
  audience: LibraryAudience
  subject: string
  body: string
}

/** The audience each library entry is written for, in words. */
export const LIBRARY_AUDIENCE_LABELS: Record<LibraryAudience, string> = {
  event: "Tous les bénévoles inscrits",
  role: "Les bénévoles d'un poste",
  shift: "Les bénévoles d'un créneau",
  invited_without_shift: "Les invités sans créneau confirmé",
}

const L = (...lines: string[]) => lines.join("\n")

export const LIBRARY_TEMPLATES = [
  // ── Recruter et compléter ────────────────────────────────────────────────
  {
    id: "poste-a-completer",
    name: "Poste à compléter",
    category: "Recruter et compléter",
    audience: "role",
    subject: "Il manque encore du monde au poste {poste}",
    body: L(
      "On est encore trop peu au poste {poste} : il manque [à compléter : nombre] personnes, surtout [à compléter : jour et horaires].",
      "Tu peux prendre un créneau de plus ? Ouvre « Gérer mes inscriptions » en bas de ce message, puis « S'inscrire à d'autres créneaux ».",
      "Tu connais quelqu'un que ça pourrait tenter ? Transfère-lui ce message.",
      "Merci, ça soulage toute l'équipe !",
    ),
  },
  {
    id: "fais-tourner-l-info",
    name: "Fais tourner l'info",
    category: "Recruter et compléter",
    audience: "event",
    subject: "Tu connais quelqu'un qui aimerait aider ?",
    body: L(
      "Il nous manque encore [à compléter : nombre] bénévoles, surtout pour [à compléter : postes ou jours].",
      "Si quelqu'un autour de toi a envie de donner un coup de main, envoie-lui le lien de la page d'inscription : [à compléter : lien de la page d'inscription].",
      "L'inscription prend deux minutes et ne demande pas de compte.",
      "Merci de faire tourner !",
    ),
  },
  {
    id: "invite-pas-encore-inscrit",
    name: "Tu es invité mais pas encore inscrit",
    category: "Recruter et compléter",
    audience: "invited_without_shift",
    subject: "Ton créneau t'attend",
    body: L(
      "Tu as reçu une invitation pour {événement}, mais tu n'as pas encore choisi de créneau.",
      "Le bouton « Choisir mes créneaux » en bas de ce message t'y emmène directement, sans compte à créer.",
      "Les inscriptions ferment le [à compléter : date].",
      "Une question avant de te lancer ? Écris à [à compléter : contact].",
    ),
  },
  {
    id: "renfort-montage-demontage",
    name: "Renfort pour le montage ou le démontage",
    category: "Recruter et compléter",
    audience: "event",
    subject: "Besoin de bras pour le montage et le démontage",
    body: L(
      "On cherche [à compléter : nombre] personnes pour le [à compléter : montage, le démontage ou les deux] de {événement}.",
      "Quand : [à compléter : dates et horaires].",
      "Au programme : [à compléter : monter les tentes, installer les tables, charger le camion…].",
      "Prévois des habits qui peuvent se salir et [à compléter : chaussures fermées, gants…].",
      "Tu es dispo ? Réponds à [à compléter : contact].",
    ),
  },

  // ── Accueil ──────────────────────────────────────────────────────────────
  {
    id: "bienvenue-equipe",
    name: "Bienvenue dans l'équipe",
    category: "Accueil",
    audience: "event",
    subject: "Bienvenue dans l'équipe !",
    body: L(
      "Super que tu rejoignes l'équipe de {événement} !",
      "L'essentiel pour commencer :",
      "- rendez-vous : [à compléter : date, heure et lieu],",
      "- ton équipe : [à compléter : poste ou équipe],",
      "- ta personne de contact : [à compléter : prénom et téléphone].",
      "Une question, même toute petite ? Écris à [à compléter : contact].",
    ),
  },
  {
    id: "premiere-fois",
    name: "Première fois avec nous ?",
    category: "Accueil",
    audience: "event",
    subject: "Première fois avec nous ? Voici comment ça se passe",
    body: L(
      "Tu viens pour la première fois à {événement} ? Voici le déroulé :",
      "1. tu arrives à [à compléter : heure] à [à compléter : lieu d'accueil des bénévoles] ;",
      "2. on t'accueille et on te montre ton poste ;",
      "3. [à compléter : prénom ou rôle] reste dans le coin pour tes questions.",
      "Rien à savoir à l'avance : tout s'apprend sur place.",
      "Prévois juste [à compléter : tenue, gourde, repas…].",
    ),
  },
  {
    id: "session-accueil-formation",
    name: "Session d'accueil ou formation",
    category: "Accueil",
    audience: "role",
    subject: "Formation pour le poste {poste}",
    body: L(
      "Avant de commencer au poste {poste}, on fait une petite formation ensemble.",
      "- quand : le [à compléter : date] à [à compléter : heure], [à compléter : durée],",
      "- où : [à compléter : lieu précis ou lien visio],",
      "- au programme : [à compléter : consignes, gestes du poste, visite…].",
      "Elle est [à compléter : obligatoire ou conseillée]. Dis-nous si tu viens à [à compléter : contact].",
    ),
  },
  {
    id: "groupe-discussion-equipe",
    name: "Groupe de discussion de l'équipe",
    category: "Accueil",
    audience: "event",
    subject: "Rejoins le groupe de l'équipe",
    body: L(
      "Pour les infos de dernière minute, on a un groupe [à compléter : WhatsApp, Signal…] pour {événement}.",
      "Pour le rejoindre : [à compléter : lien d'invitation].",
      "Tu peux couper les notifications quand tu veux, personne ne t'en voudra.",
    ),
  },
  {
    id: "besoins-particuliers-accessibilite",
    name: "Besoins particuliers ou accessibilité",
    category: "Accueil",
    audience: "event",
    subject: "Un besoin particulier ? Dis-le-nous",
    body: L(
      "Tu as un besoin particulier pour {événement} ? Accessibilité, alimentation, pauses, horaires, matériel : dis-le-nous.",
      "Écris à [à compléter : contact] avant le [à compléter : date], qu'on ait le temps de s'organiser.",
      "Pas besoin d'expliquer pourquoi : dis-nous juste ce qui t'aiderait.",
    ),
  },

  // ── Infos pratiques ──────────────────────────────────────────────────────
  {
    id: "infos-pratiques-generales",
    name: "Infos pratiques générales",
    category: "Infos pratiques",
    audience: "event",
    subject: "Les infos pratiques",
    body: L(
      "Voici l'essentiel pour {événement} :",
      "- rendez-vous : [à compléter : date, heure et lieu précis],",
      "- contact sur place : [à compléter : prénom et téléphone],",
      "- repas : [à compléter : fourni ou à prévoir],",
      "- à apporter : [à compléter : gourde, tenue, matériel…].",
      "Garde ce message sous la main le jour J.",
    ),
  },
  {
    id: "point-de-rendez-vous",
    name: "Point de rendez-vous et accueil bénévoles",
    category: "Infos pratiques",
    audience: "event",
    subject: "Où nous retrouver",
    body: L(
      "Le point de rendez-vous des bénévoles est à [à compléter : lieu précis, entrée, tente…].",
      "Présente-toi [à compléter : heure, ou 15 minutes avant ton créneau] et demande [à compléter : prénom ou « l'accueil bénévoles »].",
      "Tu ne trouves pas ? Appelle le [à compléter : numéro].",
    ),
  },
  {
    id: "parking-acces",
    name: "Parking et accès",
    category: "Infos pratiques",
    audience: "event",
    subject: "Où te garer",
    body: L(
      "Pour te garer, le plus simple est le [à compléter : nom et adresse du parking], à [à compléter : temps] à pied.",
      "Accès : [à compléter : entrée, rue, code de barrière…].",
      "S'il est plein : [à compléter : solution de repli].",
      "Compte [à compléter : 10 minutes] de plus pour arriver tranquille à ton créneau.",
    ),
  },
  {
    id: "transports-covoiturage",
    name: "Transports en commun ou covoiturage",
    category: "Infos pratiques",
    audience: "event",
    subject: "Venir sans voiture",
    body: L(
      "Tu peux venir à {événement} sans voiture.",
      "- en transports en commun : [à compléter : ligne, arrêt, temps à pied],",
      "- dernier départ le soir : [à compléter : heure et arrêt],",
      "- covoiturage : [à compléter : groupe ou contact].",
      "Tu as des places libres dans ta voiture ? Dis-le-nous, ça dépannera quelqu'un.",
    ),
  },
  {
    id: "repas-boissons",
    name: "Repas et boissons",
    category: "Infos pratiques",
    audience: "event",
    subject: "Repas et boissons",
    body: L(
      "Côté repas pendant {événement} :",
      "- repas : [à compléter : fourni ou à prévoir, horaires et lieu],",
      "- boissons : [à compléter : eau, café…, où],",
      "- allergie ou régime particulier : préviens [à compléter : contact] avant le [à compléter : date].",
      "Prends une gourde : tu peux la remplir à [à compléter : lieu].",
    ),
  },
  {
    id: "reunion-preparation",
    name: "Réunion de préparation",
    category: "Infos pratiques",
    audience: "event",
    subject: "Réunion de préparation le [à compléter : date]",
    body: L(
      "On se retrouve pour préparer {événement} :",
      "- quand : le [à compléter : date] à [à compléter : heure], [à compléter : durée],",
      "- où : [à compléter : adresse ou lien visio].",
      "On fera le point sur [à compléter : planning, postes, questions…].",
      "Dis-nous si tu viens à [à compléter : contact]. Pas dispo ? Pas de souci, on t'enverra un résumé.",
    ),
  },
  {
    id: "bracelet-accreditation",
    name: "Bracelet ou accréditation à retirer",
    category: "Infos pratiques",
    audience: "event",
    subject: "Ton bracelet bénévole est à retirer",
    body: L(
      "Ton bracelet bénévole pour {événement} est à retirer à [à compléter : lieu précis], [à compléter : jours et horaires].",
      "Prends [à compléter : une pièce d'identité, rien de particulier…].",
      "Garde-le au poignet pendant tout l'événement : c'est lui qui t'ouvre les accès bénévoles.",
      "Tu ne peux pas venir à ces horaires ? Écris à [à compléter : contact].",
    ),
  },

  // ── Tenue et matériel ────────────────────────────────────────────────────
  {
    id: "tenue-sombre-plateau",
    name: "Tenue sombre pour le plateau",
    category: "Tenue et matériel",
    audience: "role",
    subject: "Tenue sombre pour le poste {poste}",
    body: L(
      "Au poste {poste}, on doit passer inaperçu près de la scène : viens en tenue sombre.",
      "- haut et bas noirs ou très foncés, sans logo ni inscription,",
      "- chaussures fermées et sombres,",
      "- pas de bijou qui brille ou qui pend.",
      "Il te manque quelque chose ? Dis-le à [à compléter : contact] avant le [à compléter : date].",
    ),
  },
  {
    id: "chaussures-securite",
    name: "Chaussures de sécurité",
    category: "Tenue et matériel",
    audience: "role",
    subject: "Chaussures de sécurité obligatoires au poste {poste}",
    body: L(
      "Au poste {poste}, les chaussures de sécurité sont obligatoires pour [à compléter : tâches, par exemple le montage ou la manutention].",
      "Sans elles, on ne pourra pas te confier ces tâches : c'est pour protéger tes pieds.",
      "Tu n'en as pas ? Dis-le à [à compléter : contact] avant le [à compléter : date] : [à compléter : prêt possible, pointures disponibles…].",
    ),
  },
  {
    id: "tenue-fournie",
    name: "Tenue fournie à récupérer",
    category: "Tenue et matériel",
    audience: "event",
    subject: "Ta tenue bénévole t'attend",
    body: L(
      "Pour {événement}, ta tenue bénévole est fournie.",
      "1. Donne ta taille avant le [à compléter : date] : [à compléter : formulaire ou contact].",
      "2. Récupère-la à [à compléter : lieu], [à compléter : jours et horaires].",
      "3. [à compléter : Garde-la en souvenir, ou rends-la après ton dernier créneau à tel endroit].",
    ),
  },
  {
    id: "materiel-a-apporter",
    name: "Matériel à apporter",
    category: "Tenue et matériel",
    audience: "role",
    subject: "À apporter pour le poste {poste}",
    body: L(
      "Pour le poste {poste}, pense à apporter :",
      "- [à compléter : objet 1],",
      "- [à compléter : objet 2],",
      "- [à compléter : objet 3].",
      "Le reste est fourni sur place. Marque ton nom sur tes affaires.",
      "Il te manque quelque chose ? Dis-le à [à compléter : contact] avant le [à compléter : date].",
    ),
  },
  {
    id: "bar-cuisine-hygiene",
    name: "Bar ou cuisine : hygiène",
    category: "Tenue et matériel",
    audience: "role",
    subject: "Hygiène au poste {poste}",
    body: L(
      "Au poste {poste}, on sert à manger et à boire : quelques règles d'hygiène valent pour tout le monde.",
      "- lave-toi les mains en arrivant, après chaque pause et après chaque passage aux toilettes,",
      "- cheveux attachés, pas de bijou aux mains ni aux poignets,",
      "- fièvre, vomissements ou diarrhée ? Ne viens pas et préviens [à compléter : contact].",
      "Savon et point d'eau : [à compléter : emplacement].",
    ),
  },
  {
    id: "poste-de-nuit",
    name: "Poste de nuit",
    category: "Tenue et matériel",
    audience: "shift",
    subject: "Ton créneau de nuit",
    body: L(
      "Ton créneau {créneau} se passe de nuit. Pour le vivre au chaud et en forme :",
      "- prends [à compléter : veste chaude, bonnet, lampe frontale…],",
      "- dors un peu avant si tu peux,",
      "- [à compléter : café, soupe, coin repos] t'attend à [à compléter : emplacement].",
      "Coup de fatigue ? Dis-le à [à compléter : responsable] : on te trouvera une pause ou un relais.",
    ),
  },

  // ── Cadre ────────────────────────────────────────────────────────────────
  {
    id: "autorisation-parentale",
    name: "Autorisation parentale pour les mineurs",
    category: "Cadre",
    audience: "event",
    subject: "Autorisation parentale pour les moins de 18 ans",
    body: L(
      "Tu as moins de 18 ans ? Il nous faut une autorisation signée par un parent pour {événement}.",
      "1. Récupère le formulaire : [à compléter : lien ou lieu de retrait].",
      "2. Fais-le signer.",
      "3. Rends-le avant le [à compléter : date] à [à compléter : personne ou adresse].",
      "Sans ce document, on ne pourra pas te laisser commencer ton créneau.",
      "Tu as 18 ans ou plus ? Ce message ne te concerne pas.",
    ),
  },
  {
    id: "droit-a-image",
    name: "Droit à l'image",
    category: "Cadre",
    audience: "event",
    subject: "Photos et vidéos : tu choisis",
    body: L(
      "Pendant {événement}, [à compléter : un photographe, l'équipe] prendra des photos et des vidéos pour [à compléter : site, réseaux sociaux, presse…].",
      "Tu préfères ne pas y apparaître ? Dis-le à [à compléter : contact], ou le jour J à [à compléter : accueil ou photographe].",
      "C'est ton droit, et tu n'as pas à te justifier.",
    ),
  },
  {
    id: "prevention-harcelement",
    name: "Prévention du harcèlement",
    category: "Cadre",
    audience: "event",
    subject: "Le respect, pour tout le monde",
    body: L(
      "À {événement}, le harcèlement, les propos blessants et les gestes déplacés n'ont pas leur place, entre bénévoles comme avec le public.",
      "Si tu vis ou vois quelque chose qui te met mal à l'aise, parles-en à [à compléter : personne de confiance et contact], tout de suite ou plus tard.",
      "On t'écoute, on te prend au sérieux, et on cherche avec toi la suite à donner, en toute discrétion.",
    ),
  },
  {
    id: "pas-alcool-service",
    name: "Pas d'alcool pendant le service",
    category: "Cadre",
    audience: "event",
    subject: "Pas d'alcool pendant ton service",
    body: L(
      "Pendant ton créneau à {événement}, c'est zéro alcool, pour tout le monde.",
      "On doit rester lucides pour l'équipe et le public, surtout [à compléter : au bar, à la sécurité, au volant…].",
      "Après ton créneau, tu peux trinquer avec nous [à compléter : où et quand].",
      "Eau et boissons sans alcool : [à compléter : emplacement].",
    ),
  },

  // ── Planning ─────────────────────────────────────────────────────────────
  {
    id: "planning-pret",
    name: "Le planning est prêt",
    category: "Planning",
    audience: "event",
    subject: "Ton planning est prêt",
    body: L(
      "Ça y est, le planning de {événement} est prêt !",
      "Tes créneaux sont rappelés en bas de ce message, et « Gérer mes inscriptions » ouvre ta page avec les détails.",
      "Un horaire ne te va pas ? Dis-le-nous avant le [à compléter : date] à [à compléter : contact].",
    ),
  },
  {
    id: "verifie-creneaux-telephone",
    name: "Vérifie tes créneaux et ton téléphone",
    category: "Planning",
    audience: "event",
    subject: "Petit contrôle avant le jour J",
    body: L(
      "Avant {événement}, prends deux minutes pour vérifier tes créneaux : ils sont rappelés en bas de ce message.",
      "Un changement ? « Gérer mes inscriptions » te permet d'annuler ou d'ajouter un créneau.",
      "Ton numéro de téléphone a changé ? Envoie-nous le nouveau à [à compléter : contact] : c'est lui qu'on appelle le jour J en cas d'imprévu.",
    ),
  },
  {
    id: "empechement-prevenir",
    name: "Tu ne peux plus venir ? Préviens-nous",
    category: "Planning",
    audience: "event",
    subject: "Tu ne peux plus venir ? Préviens-nous",
    body: L(
      "Un imprévu, ça arrive. Si tu ne peux plus venir à un créneau, annule-le toi-même avec « Gérer mes inscriptions » en bas de ce message : ta place est aussitôt libérée pour quelqu'un d'autre.",
      "Trop tard pour annuler en ligne ? Préviens [à compléter : prénom et téléphone].",
      "Plus tu nous préviens tôt, plus c'est facile de trouver quelqu'un.",
    ),
  },
  {
    id: "correctif-message-precedent",
    name: "Correctif : erreur dans le message précédent",
    category: "Planning",
    audience: "event",
    subject: "Correction de notre dernier message",
    body: L(
      "Oups, une erreur s'est glissée dans notre dernier message.",
      "La bonne information : [à compléter : information corrigée].",
      "Tout le reste ne change pas. Pardon pour la confusion !",
    ),
  },

  // ── Météo et imprévus ────────────────────────────────────────────────────
  {
    id: "alerte-meteo-pluie",
    name: "Alerte météo : pluie",
    category: "Météo et imprévus",
    audience: "event",
    subject: "Pluie annoncée : prends ton k-way !",
    body: L(
      "La météo annonce de la pluie pour {événement}. Pas de panique, tout est maintenu !",
      "Pense juste à prendre :",
      "- un k-way ou une veste de pluie,",
      "- des chaussures qui ne craignent pas la boue,",
      "- des habits de rechange si tu restes longtemps.",
      "On aura [à compléter : tente, abri, boissons chaudes…] pour se mettre au sec entre deux rushs.",
    ),
  },
  {
    id: "alerte-meteo-chaleur",
    name: "Alerte météo : chaleur",
    category: "Météo et imprévus",
    audience: "event",
    subject: "Grosse chaleur annoncée : pense à boire",
    body: L(
      "Il va faire très chaud pendant {événement}. Pour que ça reste agréable :",
      "- bois souvent, même sans soif : de l'eau t'attend à [à compléter : emplacement],",
      "- casquette ou chapeau, crème solaire, vêtements légers,",
      "- pause à l'ombre dès que tu en as besoin : [à compléter : zone d'ombre].",
      "Tu te sens mal, ou quelqu'un autour de toi n'a pas l'air bien ? Préviens tout de suite [à compléter : responsable ou poste de secours].",
    ),
  },
  {
    id: "alerte-meteo-vent-orage",
    name: "Alerte météo : vent ou orage",
    category: "Météo et imprévus",
    audience: "event",
    subject: "Vent fort ou orage annoncé : les consignes",
    body: L(
      "Du vent fort ou de l'orage est annoncé pendant {événement}.",
      "[à compléter : ce qui est maintenu, ce qui change].",
      "En cas de rafales ou d'orage :",
      "- éloigne-toi des tentes, des structures légères et des arbres,",
      "- suis les consignes de [à compléter : responsable],",
      "- ne réinstalle rien sans son feu vert.",
      "On t'écrit si quelque chose change.",
    ),
  },
  {
    id: "changement-lieu-rendez-vous",
    name: "Changement de lieu de rendez-vous",
    category: "Météo et imprévus",
    audience: "event",
    subject: "Nouveau lieu de rendez-vous",
    body: L(
      "Attention, le rendez-vous change de place !",
      "Nouveau lieu : [à compléter : lieu précis].",
      "L'heure reste la même : [à compléter : heure].",
      "Pour t'y rendre : [à compléter : lien de carte ou indication]. Pense à prévenir ton covoiturage.",
    ),
  },
  {
    id: "annulation",
    name: "Annulation",
    category: "Météo et imprévus",
    audience: "event",
    subject: "Annulation",
    body: L(
      "On a une mauvaise nouvelle : on doit annuler {événement}.",
      "La raison : [à compléter : raison en une phrase].",
      "Tu n'as rien à faire de ton côté.",
      "Merci pour le temps que tu avais prévu de nous donner, ça nous touche.",
      "[à compléter : on te tient au courant pour la suite, ou rendez-vous le …].",
    ),
  },

  // ── Jour J ───────────────────────────────────────────────────────────────
  {
    id: "consignes-securite",
    name: "Consignes de sécurité",
    category: "Jour J",
    audience: "event",
    subject: "Les consignes de sécurité",
    body: L(
      "Pour que tout le monde passe un bon moment à {événement}, quelques réflexes :",
      "- en arrivant, repère les sorties de secours et le poste de secours ([à compléter : emplacement]),",
      "- ne bloque jamais une sortie ni un extincteur,",
      "- un danger ou une personne en difficulté ? Préviens [à compléter : responsable ou contact],",
      "- urgence vitale : appelle d'abord le [à compléter : 144 en Suisse, 15 ou 112 en France].",
    ),
  },
  {
    id: "responsable-de-poste",
    name: "Responsable de ton poste",
    category: "Jour J",
    audience: "role",
    subject: "Qui contacter au poste {poste}",
    body: L(
      "Au poste {poste}, ta personne de référence est [à compléter : prénom et nom].",
      "Son numéro : [à compléter : téléphone].",
      "Va la voir en arrivant, et appelle-la pour une question, un imprévu ou une pause.",
    ),
  },
  {
    id: "remplacement-urgent",
    name: "Remplacement urgent",
    category: "Jour J",
    audience: "shift",
    subject: "Qui peut renforcer {créneau} ?",
    body: L(
      "Une personne s'est désistée sur le créneau {créneau}, et il nous manque quelqu'un.",
      "Tu peux rester un peu plus longtemps ou arriver plus tôt ? Écris vite à [à compléter : contact ou téléphone].",
      "Même une heure, ça aide.",
      "Pas possible pour toi ? Pas de souci, ignore ce message.",
    ),
  },
  {
    id: "malade-reste-chez-toi",
    name: "Tu es malade ? Reste chez toi",
    category: "Jour J",
    audience: "event",
    subject: "Malade ? Reste chez toi",
    body: L(
      "Si tu es malade le jour de ton créneau, reste chez toi : ta santé passe avant tout, et ça évite de contaminer l'équipe.",
      "Préviens-nous dès que possible à [à compléter : téléphone ou contact], ou annule toi-même avec « Gérer mes inscriptions » si tu es encore dans les temps.",
      "Pas besoin de justificatif ni d'excuses. Soigne-toi bien !",
    ),
  },

  // ── Ressources ───────────────────────────────────────────────────────────
  {
    id: "competence-recherchee",
    name: "Compétence recherchée",
    category: "Ressources",
    audience: "event",
    subject: "On cherche quelqu'un qui sait [à compléter : compétence]",
    body: L(
      "Pour {événement}, on cherche quelqu'un qui sait [à compléter : compétence, par exemple conduire un utilitaire, parler anglais, réparer une sono].",
      "La mission : [à compléter : quoi, quand, où, combien de temps].",
      "C'est toi, ou tu connais la bonne personne ? Écris à [à compléter : contact].",
    ),
  },
  {
    id: "pret-materiel-vehicule",
    name: "Prêt de matériel ou de véhicule",
    category: "Ressources",
    audience: "event",
    subject: "Tu pourrais nous prêter [à compléter : matériel] ?",
    body: L(
      "Pour {événement}, on cherche à emprunter [à compléter : matériel ou véhicule].",
      "Il nous le faudrait du [à compléter : date et heure] au [à compléter : date et heure], et on le rend en bon état.",
      "[à compléter : qui vient le chercher, qui l'assure].",
      "Tu peux nous dépanner ? Écris à [à compléter : contact].",
    ),
  },

  // ── Après ────────────────────────────────────────────────────────────────
  {
    id: "merci",
    name: "Merci !",
    category: "Après",
    audience: "event",
    subject: "Merci !",
    body: L(
      "Merci pour ton temps et ta bonne humeur pendant {événement} !",
      "Grâce à toi et à toute l'équipe, [à compléter : un chiffre ou un moment, par exemple 400 repas servis].",
      "Maintenant on range, on souffle, et on garde les bons souvenirs.",
    ),
  },
  {
    id: "merci-equipe-poste",
    name: "Merci à l'équipe d'un poste",
    category: "Après",
    audience: "role",
    subject: "Merci à l'équipe du poste {poste} !",
    body: L(
      "Merci à toute l'équipe du poste {poste} !",
      "[à compléter : ce qui s'est bien passé, par exemple l'accueil a tenu bon malgré la file].",
      "Rien de tout ça sans toi. On espère te retrouver bientôt.",
    ),
  },
  {
    id: "soiree-benevoles",
    name: "Soirée des bénévoles",
    category: "Après",
    audience: "event",
    subject: "Soirée des bénévoles le [à compléter : date]",
    body: L(
      "Pour fêter {événement}, on organise une soirée rien que pour les bénévoles !",
      "- quand : le [à compléter : date] à [à compléter : heure],",
      "- où : [à compléter : adresse],",
      "- au programme : [à compléter : repas, musique…].",
      "Dis-nous si tu viens avant le [à compléter : date] à [à compléter : contact], qu'on prévoie assez pour tout le monde.",
    ),
  },
  {
    id: "ton-avis-compte",
    name: "Ton avis compte",
    category: "Après",
    audience: "event",
    subject: "Ton avis en [à compléter : durée] minutes",
    body: L(
      "Comment s'est passé {événement} pour toi ? Ce qui a marché, ce qui a coincé, ce que tu changerais : on veut tout savoir.",
      "Le questionnaire est ici : [à compléter : lien] ([à compléter : anonyme ou non]).",
      "Il reste ouvert jusqu'au [à compléter : date].",
    ),
  },
  {
    id: "photos",
    name: "Photos",
    category: "Après",
    audience: "event",
    subject: "Les photos sont en ligne !",
    body: L(
      "Les photos de {événement} sont en ligne : [à compléter : lien de l'album].",
      "Tu peux les regarder et les partager.",
      "Une photo où tu n'as pas envie d'apparaître ? Dis-le à [à compléter : contact], on la retire.",
    ),
  },
  {
    id: "materiel-badge-a-rendre",
    name: "Matériel ou badge à rendre",
    category: "Après",
    audience: "event",
    subject: "À rendre : [à compléter : badge, radio, tenue…]",
    body: L(
      "Merci encore pour {événement} ! Il reste une dernière chose : rendre [à compléter : badge, radio, clés, tenue…].",
      "Où et quand : [à compléter : lieu, jours et horaires].",
      "Tu ne peux pas passer ? Écris à [à compléter : contact], on trouvera une solution.",
    ),
  },
  {
    id: "rendez-vous-an-prochain",
    name: "Rendez-vous l'an prochain",
    category: "Après",
    audience: "event",
    subject: "Rendez-vous l'an prochain !",
    body: L(
      "Merci pour cette édition de {événement} !",
      "La prochaine aura lieu [à compléter : dates prévues] : note-les déjà.",
      "On t'écrira dès que les inscriptions ouvriront.",
    ),
  },

  // ── Activités régulières ─────────────────────────────────────────────────
  {
    id: "planning-mois-ouvert",
    name: "Le planning du mois est ouvert",
    category: "Activités régulières",
    audience: "event",
    subject: "Le planning de [à compléter : mois] est ouvert",
    body: L(
      "Le planning de [à compléter : mois] est ouvert : tu peux choisir tes créneaux.",
      "Ouvre « Gérer mes inscriptions » en bas de ce message, puis « S'inscrire à d'autres créneaux ».",
      "Les créneaux les plus urgents : [à compléter : jours ou horaires].",
    ),
  },
  {
    id: "permanence-non-couverte",
    name: "Permanence non couverte cette semaine",
    category: "Activités régulières",
    audience: "event",
    subject: "Personne pour la permanence du [à compléter : jour]",
    body: L(
      "La permanence du [à compléter : jour et horaires] à [à compléter : lieu] n'a encore personne.",
      "Sans bénévole, [à compléter : conséquence, par exemple l'épicerie reste fermée].",
      "Tu peux la prendre ? Inscris-toi avec « Gérer mes inscriptions » en bas de ce message, ou écris à [à compléter : contact].",
    ),
  },
] as const satisfies readonly LibraryTemplate[]

/** The library grouped by category, in the library's order. */
export function libraryByCategory(): { category: LibraryTemplate["category"]; templates: LibraryTemplate[] }[] {
  const groups = new Map<LibraryTemplate["category"], LibraryTemplate[]>()
  for (const template of LIBRARY_TEMPLATES) {
    const items = groups.get(template.category)
    if (items) items.push(template)
    else groups.set(template.category, [template])
  }
  return [...groups.entries()].map(([category, templates]) => ({ category, templates }))
}
