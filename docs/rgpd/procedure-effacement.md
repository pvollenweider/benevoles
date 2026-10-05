# Demande d'effacement d'un bénévole et registre des effacements

Procédure interne (#516). Elle décrit ce que fait l'effacement depuis l'administration, et ce que l'opérateur doit faire après une restauration de sauvegarde. Rien ici ne constitue un avis juridique.

## Qui efface, et quoi

L'organisation reçoit la demande et l'exécute elle-même : page **Activité** du membre, **Effacer les données personnelles** (propriétaires et organisateurs, `GUIDE_ADMIN.md`, « Effacer les données personnelles d'un membre »). Vérifier d'abord que la demande vient bien de la personne concernée (réponse depuis l'adresse email de la fiche, par exemple) : l'action est irréversible.

L'effacement anonymise la fiche au lieu de la supprimer (décision du 2026-10-05) :

| Donnée | Effet |
|---|---|
| Fiche (`Volunteer`) : prénom, nom | remplacés par « Bénévole effacé » |
| Fiche : email, téléphone, date de naissance, notes, étiquettes, disponibilités | vidés (email `null`, aucune collision avec les index uniques) ; fiche désactivée, `erasedAt` renseigné |
| Inscriptions (`Registration`) | conservées (créneau, statut, présence, rappels, preuve d'acceptation de la convention) ; commentaire et téléphone vidés ; nouveau jeton jamais envoyé, les anciens liens personnels ne fonctionnent plus |
| Invitations (`MemberInvite`, dont l'état « pas disponible ») | supprimées |
| Réponses aux questions (`QuestionAnswer`) | supprimées |
| Abonnements aux notifications (`PushSubscription`) | supprimés |
| Responsables de secteur (`SectorLeader`) avec son adresse, casse ignorée | supprimés |
| Doublons écartés (`DuplicateDismissal`) | supprimés |
| Résultats d'envoi (`DeliveryOutcome`) liés à la fiche ou à l'empreinte de son adresse dans l'organisation | supprimés |
| Fiches fusionnées dans la sienne (#600) et leur lien de fusion | supprimées |
| Emails de l'organisation (`NotificationOutbox`) qui lui sont adressés ou la nomment | supprimés, en attente comme déjà envoyés ou en échec (comptés d'abord dans leur message ciblé) ; un email en cours d'envoi à cet instant est laissé au nettoyage de la nuit |
| Journaux (`EventLog`, `OrgLog`) | conservés : ils ne contiennent que des identifiants, affichés « Bénévole effacé » ; l'effacement lui-même est journalisé `member.erased` sur l'organisation, sans identifiant de fiche |

Le tout tient dans une transaction qui verrouille la fiche ; un second effacement ne change rien. L'effacement vaut pour une organisation : la même personne inscrite dans une autre organisation n'est pas touchée (elle doit s'adresser à chacune).

Ce que l'effacement ne touche pas : les textes saisis par l'organisation elle-même (message ciblé, page d'événement, nom d'un contact de créneau) qui citeraient la personne, à corriger à la main par l'organisation ; les sauvegardes, jusqu'à la fin de leur rotation ([../retention.md](../retention.md)) ; les journaux techniques des conteneurs et les services de messagerie, selon leur propre durée.

## Registre des effacements

Chaque effacement écrit une ligne dans `ErasureRecord` : identifiant de la fiche, empreinte de l'email normalisé, date. L'empreinte est un HMAC-SHA256 avec `AUTH_SECRET`, lié à l'organisation (`src/lib/member-erasure-register.ts`) : elle ne contient pas l'adresse et ne permet pas, sans le secret, de vérifier une adresse devinée. La même ligne, au format JSON, est écrite dans les journaux techniques de l'application (`{"event":"member.erased",…}`), pour reconstituer le registre si la base elle-même était perdue.

**Clé des empreintes : `AUTH_SECRET`.** Changer `AUTH_SECRET` (par exemple après une fuite, [procedure-violation.md](procedure-violation.md)) rend impossible de retrouver par son adresse une fiche effacée avant le changement : l'empreinte calculée avec le nouveau secret ne correspond plus. Avant toute rotation, exporter le registre (`scripts/erasure-register.ts export`, étape 1 ci-dessous) et le conserver avec les sauvegardes antérieures ; après la rotation, un rejeu de ces lignes ne retrouve les fiches que par leur identifiant (ce qui suffit pour une restauration de la même base, où les identifiants sont conservés), et l'outil l'indique ligne par ligne (« no matching record » quand l'identifiant manque).

## Après une restauration de sauvegarde

Restaurer une sauvegarde ramène les données de toutes les personnes effacées depuis la date de cette sauvegarde. L'outil est `scripts/erasure-register.ts`, lancé depuis une copie du dépôt avec l'accès à la base (comme `scripts/regenerate-links.ts`, voir [procedure-violation.md](procedure-violation.md)).

1. **Avant la restauration**, exporter le registre de la base actuelle :
   ```
   DATABASE_URL=… AUTH_SECRET=… npx tsx scripts/erasure-register.ts export > registre-effacements.jsonl
   ```
   Si la base actuelle est perdue, reconstituer le fichier depuis les journaux techniques : toutes les lignes qui contiennent `"event":"member.erased"` (le préfixe de la ligne de journal est ignoré à la lecture).
2. Restaurer la sauvegarde ([../deploiement.md](../deploiement.md), « Sauvegarde et restauration »).
3. **Simuler** le rejeu sur la base restaurée (rien n'est écrit) :
   ```
   DATABASE_URL=… AUTH_SECRET=… npx tsx scripts/erasure-register.ts replay registre-effacements.jsonl
   ```
   Pour chaque ligne : « would erase » (fiche revenue avec ses données), « already erased », ou « no matching record » (fiche supprimée depuis, ou créée après la sauvegarde). Les valeurs `AUTH_SECRET` et `TOKEN_ENCRYPTION_KEY` doivent être celles de l'application.
4. **Appliquer** :
   ```
   DATABASE_URL=… AUTH_SECRET=… TOKEN_ENCRYPTION_KEY=… npx tsx scripts/erasure-register.ts replay registre-effacements.jsonl --yes
   ```
   Chaque fiche est effacée de nouveau, exactement comme depuis l'administration, et retrouve sa ligne au registre. L'action est journalisée comme un effacement par le système.
5. Conserver le fichier exporté jusqu'à ce que la sauvegarde restaurée soit sortie de la rotation, puis le supprimer.

La fiche est retrouvée par son identifiant ; seulement si cet identifiant n'existe pas dans la base restaurée, par l'empreinte de son adresse, et jamais pour une fiche créée après l'effacement : une personne qui s'est réinscrite d'elle-même ensuite garde sa nouvelle fiche.
