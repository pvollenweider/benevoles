# Lot 41 — build produit bloqué, 16 novembre 2026

STATUS: NOT READY

Commit produit demandé : `f9fcec47d32af10b0837b2de87beb61535d30888`.
Node `26.9.0`, dépendances du lockfile installées avec `npm ci` dans le worktree et dans une copie neuve `/tmp/benevoles-video-production.vcD9Pkrs`.

`build-main-product.ts /tmp/benevoles-video-production.vcD9Pkrs --commit f9fcec47d32af10b0837b2de87beb61535d30888` vérifie 2 438 entrées du produit, compile le JavaScript, puis échoue au contrôle Next.js des exports de route :

```text
.next/types/app/api/public/doc-index/route.ts(14,13): error TS2344
Property 'buildDocIndexJson' is incompatible with index signature.
Type '() => string' is not assignable to type 'never'.
```

L'export refusé est `src/app/api/public/doc-index/route.ts:21`. La preuve est [le journal du build](build-main-failure.log). Aucun serveur produit lancé, aucune URL de parcours ni image de l'interface disponible : l'échec précède le serveur. Aucun BUILD_ID vérifié, aucune répétition, aucune prise narrée, aucun MP4 neuf et aucune publication. Aucun changement produit ni contournement du contrôle Next.js.

## Sources préparées

`ATTENDANCE_CHECK_IN` : manifeste, bloc viewer, script, recorders des inscriptions et de Jour J, fixture propriétaire. Un chapitre ajouté (`absence-departure`) ; les autres restent. Les vraies actions prévues montrent les deux notes et leurs annulations. L'export exige les deux colonnes nouvelles. Narration entière Kore générée en une passe, sans balises de pause ; audit indépendant terminé en échec (12 frontières de chapitre à revoir), aucune validation audiovisuelle revendiquée. Les manipulations restent à répéter sur le prochain build autorisé.

Les sources des autres vidéos n'ont pas été modifiées. La nouvelle entrée FRONT_DESK_ACCESS et son lien ne sont pas ajoutés tant que cette vidéo ne peut pas être tournée et vérifiée. Catalogue, révisions, dates, `renders.json`, guides, captures et CHANGELOG inchangés : aucune livraison annoncée. Les écarts historiques restent ouverts.

## Environnement

Deux conteneurs créés pour ce lot seulement : `benevoles_batch41_postgres` (45433), `benevoles_batch41_mailpit` (SMTP 41026, interface 48026). Les ports 43100, 45433, 43102, 43108, 41026 et 48026 étaient libres avant leur utilisation. Migrations et seed principal exécutés sur la base jetable `benevoles_video`. Aucun autre conteneur ni processus touché. Ces deux conteneurs ont été arrêtés après les contrôles ; leurs données jetables ne sont pas réutilisées par une autre pile. Les cinq captures demandées restent à régénérer après déblocage du build ; aucun ancien fichier conservé à tort comme nouvelle capture.

## Contrôles

- Tests vidéo : 39 fichiers, 1 334 tests réussis (dont les ancres de phrases).
- Types des outils : 220 sources explicites réussies.
- TypeScript du checkout : `tsc --noEmit` réussi ; ce contrôle ne produit pas les types de routes que le build Next.js neuf refuse.
- ESLint des quatre fichiers TypeScript modifiés : réussi.
- `video:validate -- ATTENDANCE_CHECK_IN` : échec attendu, les 14 repères historiques ne correspondent pas aux 15 segments courants ; aucun nouveau timeline de capture. Pas de statut READY.
- `git diff --check` : réussi.
- Aucun changement de catalogue/renders/guides : aucun test src associé à un tel changement.

## État des vidéos

Durée, BUILD_ID et commit filmé : aucun nouveau rendu pour toutes les lignes. Musique et tutoiement du MP4 : non mesurables sans MP4. Source du pointage : zéro tutoiement de l'organisateur (les noms des états n'en contiennent pas).

| ID | Statut | Durée | BUILD_ID | Commit filmé | Trous musique | « tu » final | Problème | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ATTENDANCE_CHECK_IN | NOT READY | — | — | — | N/M | N/M | Build produit refusé | Manifeste, viewer, script, recorders, fixture ; voix générée |
| FRONT_DESK_ACCESS | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| REMINDERS_CHANGES | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| ORG_EMAIL_SETTINGS | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| VOLUNTEER_HOURS_CERTIFICATE | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| MEMBERS_MANAGEMENT | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| EVENT_PROGRAM_PAGES_QR | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| VOLUNTEER_REGISTER | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| VOLUNTEER_CONFIRMATION_ERRORS | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| PRIVACY_PERSONAL_LINKS | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| REGISTRATION_MONITOR_FOLLOWUP | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| LAST_MINUTE_CHANGES | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| SECTORS | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| SHIFT_ROSTER_VISIBILITY | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| ADMIN_FEATURES_OVERVIEW | NOT DONE | — | — | — | N/M | N/M | Build produit refusé | Inchangées |
| ADMIN_NAVIGATION | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ORG_PUBLIC_IDENTITY | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ORG_TIMEZONE_CHARTER | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ORG_TEAM_PERMISSIONS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_CREATE_BLANK | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_REVIEW_PUBLISH | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_VISIBILITY_REGISTRATION_WINDOW | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_DUPLICATE | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_ARCHIVE_DELETE | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_QUESTIONS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFTS_ROLES_VIEWS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_CREATE_EDIT_DETAIL | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_CREATE_SERIES | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_RECURRENCE | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_TIMELINE_QUICK_ACTIONS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_NIGHT_DST | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_WAITLIST_OFFER | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| SHIFT_APPROVAL | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_CHOOSE_SHIFTS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_FORM_RECAP | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_PERSONAL_REGISTRATIONS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_CALENDAR | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_SESSION_AVAILABILITY | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| VOLUNTEER_PHONE_NOTIFICATIONS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_CREATE_PUBLISH_OVERVIEW | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ORG_FIRST_STEPS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| DATA_EXPORTS_ARCHIVES | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ORGANIZATION_ACTIVITY_LOG | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EVENT_ACTIVITY_LOG | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| TARGETED_MESSAGES | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| STAFFING_GAPS | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| REGISTRATIONS_MANAGEMENT | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| MEMBERS_DUPLICATES_MERGE | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| ACCESSIBILITY_KEYBOARD_DISPLAY | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| EMAIL_DELIVERY_FAILURES | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |
| PLATFORM_INTERNAL_ADMINISTRATION | NOT DONE | — | — | — | N/M | N/M | Hors sélection de tournage du lot ; écart historique ouvert | Inchangées |

Les autres vidéos ci-dessus sont l’inventaire des identifiants explicitement cités dans les écarts historiques encore ouverts, hors reprises documentées des lots 32 à 40. Elles ne sont pas filmées dans ce lot, conformément au périmètre demandé.

## Audit de la nouvelle narration

Une génération entière Kore, Gemini 3.8 Flash TTS ; empreinte de génération `e39788e3e025bcff4b625be9495302977401aad5c05d3abe525cdd0816a0e748`. Audit ASR indépendant : 3 chapitres sans revue demandée, 12 en échec de découpage. Chapitres à revoir : `correction`, `multiple`, `absence-departure`, `limits`, `cancelled`, `export`, `dayof-window`, `dayof-search`, `dayof-phone`, `dayof-checkin`, `dayof-refresh`, `dayof-undo`. Le master et les WAV restent locaux. Ne pas régénérer inutilement le master avant diagnostic des silences ; aucun de ces extraits ne doit servir à filmer avant correction et nouvel audit. Les anciens métadonnées, audit et rapport READY ont une copie historique dans `videos/output/attendance-check-in/previous-batch41-before-narration/`. Le rapport courant les remplace explicitement.
