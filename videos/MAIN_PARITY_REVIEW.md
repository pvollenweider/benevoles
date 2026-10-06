# Revue de conformité des vidéos à main

Référence cible vérifiée sur GitHub : `09380114c1f111feed1b610c7379682924c2c627`.

Checkout de travail : `cf1e2956babd0447157c800d08bcd586969789b2` ; dernière compilation de capture connue : `23b2d604a597820a6bd9410e411761ebe71fbd5a`.

## Résultat de l'inventaire

54 entrées examinées ; 52 MP4 présents ; 0 captures avec preuve de compilation sur la référence cible. **Aucune vidéo n'est certifiée 100 % conforme par cet inventaire.**

Les scripts actuels peuvent déjà dire Frise alors que l'ancien audio ou l'écran filmé dit Timeline. Une correction du manifeste n'est pas une correction du MP4. Les captures anciennes sans preuve de commit restent non vérifiées, même si un contrôle automatique de synchronisation était vert.

## Écrans et comportements à reprendre

### Planning

Frise/Liste, glisser pour créer, menus, champs, sauvegarde et annulation, postes longs, couleurs, limites et accès

Vidéos : SHIFTS_ROLES_VIEWS, SHIFT_CREATE_EDIT_DETAIL, SHIFT_CREATE_SERIES, SHIFT_TIMELINE_QUICK_ACTIONS, SHIFT_NIGHT_DST, SHIFT_WAITLIST_OFFER, SHIFT_APPROVAL, SHIFT_ELIGIBILITY_RULES.

### Documents

Ordre : bénévoles, organisateurs avec Export complet, Badges, Résumé, Archive en dernier ; synthèse des réponses ; logo ; téléchargement distinct d'une impression

Vidéos : EVENT_REPORTS, VOLUNTEER_BADGES, DATA_EXPORTS_ARCHIVES, EVENT_ARCHIVE_DELETE.

### Événement

Brouillon/publié/non répertorié/archivé, dates d'ouverture, vérifications avant publication, lien et QR, carte, contact du jour J, rappels par événement, pages et duplication

Vidéos : EVENT_CREATE_BLANK, EVENT_CREATE_TEMPLATE, EVENT_REVIEW_PUBLISH, EVENT_VISIBILITY_REGISTRATION_WINDOW, EVENT_DUPLICATE, EVENT_PROGRAM_PAGES_QR, EVENT_MILESTONES.

### Inscriptions et suivi

Demande/attente/inscrit, retrait notifié, refus d'invitation, relance, vrais résultats SMTP, recherche de renforts, Jour J, annonces, responsable et libellés du journal

Vidéos : REGISTRATIONS_MANAGEMENT, ATTENDANCE_CHECK_IN, STAFFING_GAPS, MEMBERS_INVITATIONS, MEMBERS_REMINDERS, TARGETED_MESSAGES, REMINDERS_CHANGES, EVENT_ACTIVITY_LOG, ORGANIZATION_ACTIVITY_LOG, LAST_MINUTE_CHANGES, SECTOR_LEADERS, EMAIL_DELIVERY_FAILURES.

### Membres

Heures planifiées/attestées, période et certificat, adresse à vérifier, doublons et fusion, suppression distincte de l'effacement

Vidéos : MEMBERS_MANAGEMENT, MEMBERS_IMPORT.

### Organisation

Logo, nom et slug, fuseau, convention et preuve d'acceptation, rôles et permissions, paramètres effectifs de rappel/retrait

Vidéos : ORG_PUBLIC_IDENTITY, ORG_TIMEZONE_CHARTER, ORG_TEAM_PERMISSIONS, ORG_EMAIL_SETTINGS.

### Bénévole

Tutoiement, consentement événement et suivants, lendemain dit une fois, rappels réellement envoyés, Avant ta mission/contact, refus d'invitation, retrait, conditions du push

Vidéos : VOLUNTEER_DISCOVER_EVENT, VOLUNTEER_CHOOSE_SHIFTS, VOLUNTEER_FORM_RECAP, VOLUNTEER_CONFIRMATION_ERRORS, VOLUNTEER_PERSONAL_REGISTRATIONS, VOLUNTEER_SESSION_AVAILABILITY, VOLUNTEER_CALENDAR, PRIVACY_PERSONAL_LINKS.

### Administration interne

Menu, release disponible, santé, communications et nouvel écran de retours sur les vidéos

Vidéos : PLATFORM_INTERNAL_ADMINISTRATION.

### Transversal

Toutes les zones du parcours ; aide contextuelle, nouveaux raccourcis et états, focus, documentation, confidentialité et navigation

Vidéos : ADMIN_NAVIGATION, GLOBAL_SEARCH, ACCESSIBILITY_KEYBOARD_DISPLAY, VOLUNTEER_REGISTER, EVENT_CREATE_PUBLISH_OVERVIEW, ADMIN_FEATURES_OVERVIEW, REGISTRATION_MONITOR_FOLLOWUP, ORG_FIRST_STEPS.

## Matrice complète

| Vidéo | Domaine | MP4 | Commit capturé prouvé | État |
| --- | --- | --- | --- | --- |
| ACCESSIBILITY_KEYBOARD_DISPLAY | Transversal | non | absent | not-generated |
| EMAIL_DELIVERY_FAILURES | Inscriptions et suivi | non | absent | not-generated |
| PLATFORM_INTERNAL_ADMINISTRATION | Administration interne | oui | absent | unverified-product-version |
| PRIVACY_PERSONAL_LINKS | Bénévole | oui | absent | unverified-product-version |
| LAST_MINUTE_CHANGES | Inscriptions et suivi | oui | absent | unverified-product-version |
| DATA_EXPORTS_ARCHIVES | Documents | oui | absent | unverified-product-version |
| ORGANIZATION_ACTIVITY_LOG | Inscriptions et suivi | oui | absent | unverified-product-version |
| EVENT_ACTIVITY_LOG | Inscriptions et suivi | oui | absent | unverified-product-version |
| ATTENDANCE_CHECK_IN | Inscriptions et suivi | oui | absent | unverified-product-version |
| EVENT_REPORTS | Documents | oui | absent | unverified-product-version |
| VOLUNTEER_BADGES | Documents | oui | absent | unverified-product-version |
| REMINDERS_CHANGES | Inscriptions et suivi | oui | absent | unverified-product-version |
| TARGETED_MESSAGES | Inscriptions et suivi | oui | absent | unverified-product-version |
| STAFFING_GAPS | Inscriptions et suivi | oui | absent | unverified-product-version |
| REGISTRATIONS_MANAGEMENT | Inscriptions et suivi | oui | absent | unverified-product-version |
| MEMBERS_REMINDERS | Inscriptions et suivi | oui | absent | unverified-product-version |
| MEMBERS_INVITATIONS | Inscriptions et suivi | oui | absent | unverified-product-version |
| MEMBERS_IMPORT | Membres | oui | absent | unverified-product-version |
| MEMBERS_MANAGEMENT | Membres | oui | absent | unverified-product-version |
| VOLUNTEER_SESSION_AVAILABILITY | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_CALENDAR | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_PERSONAL_REGISTRATIONS | Bénévole | oui | absent | unverified-product-version |
| SECTOR_LEADERS | Inscriptions et suivi | oui | absent | unverified-product-version |
| ADMIN_NAVIGATION | Transversal | oui | absent | unverified-product-version |
| GLOBAL_SEARCH | Transversal | oui | absent | unverified-product-version |
| ORG_PUBLIC_IDENTITY | Organisation | oui | absent | unverified-product-version |
| ORG_TIMEZONE_CHARTER | Organisation | oui | absent | unverified-product-version |
| ORG_TEAM_PERMISSIONS | Organisation | oui | absent | unverified-product-version |
| ORG_EMAIL_SETTINGS | Organisation | oui | absent | unverified-product-version |
| EVENT_CREATE_BLANK | Événement | oui | absent | unverified-product-version |
| EVENT_CREATE_TEMPLATE | Événement | oui | absent | unverified-product-version |
| EVENT_REVIEW_PUBLISH | Événement | oui | absent | unverified-product-version |
| EVENT_VISIBILITY_REGISTRATION_WINDOW | Événement | oui | absent | unverified-product-version |
| EVENT_DUPLICATE | Événement | oui | absent | unverified-product-version |
| EVENT_PROGRAM_PAGES_QR | Événement | oui | absent | unverified-product-version |
| EVENT_MILESTONES | Événement | oui | absent | unverified-product-version |
| EVENT_ARCHIVE_DELETE | Documents | oui | absent | unverified-product-version |
| SHIFTS_ROLES_VIEWS | Planning | oui | absent | unverified-product-version |
| SHIFT_CREATE_EDIT_DETAIL | Planning | oui | absent | unverified-product-version |
| SHIFT_CREATE_SERIES | Planning | oui | absent | unverified-product-version |
| SHIFT_TIMELINE_QUICK_ACTIONS | Planning | oui | absent | unverified-product-version |
| SHIFT_NIGHT_DST | Planning | oui | absent | unverified-product-version |
| SHIFT_WAITLIST_OFFER | Planning | oui | absent | unverified-product-version |
| SHIFT_APPROVAL | Planning | oui | absent | unverified-product-version |
| SHIFT_ELIGIBILITY_RULES | Planning | oui | absent | unverified-product-version |
| VOLUNTEER_DISCOVER_EVENT | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_CHOOSE_SHIFTS | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_FORM_RECAP | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_CONFIRMATION_ERRORS | Bénévole | oui | absent | unverified-product-version |
| VOLUNTEER_REGISTER | Transversal | oui | absent | unverified-product-version |
| EVENT_CREATE_PUBLISH_OVERVIEW | Transversal | oui | absent | unverified-product-version |
| ADMIN_FEATURES_OVERVIEW | Transversal | oui | absent | unverified-product-version |
| REGISTRATION_MONITOR_FOLLOWUP | Transversal | oui | absent | unverified-product-version |
| ORG_FIRST_STEPS | Transversal | oui | absent | unverified-product-version |

## Conditions de validation

1. Construire une copie propre de main au commit cible, sans modifier le checkout du propriétaire.
2. Vérifier que le port vidéo sert réellement cette compilation ; enregistrer commit, BUILD_ID et scénario dans chaque timeline.
3. Exécuter les parcours sur cette copie : libellés, emplacement, état avant/après, documents et vrais emails fictifs.
4. Recapturer les vidéos décalées et régénérer leur narration si le contenu a évolué. Ne pas maquiller l'ancien écran ni réécrire sa provenance.
5. Contrôler le MP4 final, les sous-titres, la voix, musique, clics/frappes et dates. Validation visuelle distincte des tests de code et ASR.
6. Recontrôler main avant livraison : si le commit a changé, refaire l'analyse des changements et invalider les vidéos impactées.
