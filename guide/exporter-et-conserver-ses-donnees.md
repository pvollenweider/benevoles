---
roles: [admin]
group: organisation
order: 20
summary: Exporter un événement, les membres ou le journal à tout moment, et savoir combien de temps chaque donnée est conservée.
related: [archiver-ou-supprimer-un-evenement, effacer-ou-supprimer-un-membre, journal-d-activite-de-l-organisation]
legacy: [admin#exporter-et-conserver-ses-donnees]
aliases: []
---

# Exporter et conserver ses données

<!-- video: DATA_EXPORTS_ARCHIVES -->

Vos données vous appartiennent et sortent de l'application à tout moment, sans demande :

| Export | Où | Format |
|---|---|---|
| Un événement complet (réglages, créneaux, inscriptions avec les bénévoles, pages, responsables, jalons, journal) | page de l'événement → **Rapports** → **Archive de l'événement (JSON)** | JSON |
| Tous les membres (étiquettes, disponibilités, notes, nombre d'inscriptions, membres désactivés compris) | **Membres** → **Exporter les membres (CSV)** | CSV |
| Le journal d'activité de l'organisation | **Paramètres** → **Journal d'activité** → **Exporter tout le journal (CSV)** | CSV |
| Le planning, la liste des bénévoles, les feuilles à imprimer | **Rapports** de l'événement | PDF (depuis le navigateur) |
| La feuille de présence | **Inscriptions** de l'événement → **Exporter les présences (CSV)** | CSV |

Les fichiers CSV s'ouvrent tels quels dans Excel ou LibreOffice (UTF-8, point-virgule). Une valeur qui commence par `=`, `+`, `-` ou `@` (un numéro `+41…`, par exemple) y est précédée d'une apostrophe : le tableur l'affiche comme du texte au lieu de l'exécuter comme une formule. Les archives ne contiennent jamais de lien personnel ni de jeton d'accès.

## Durées de conservation

<!-- retention:start (généré depuis src/lib/retention.ts, npm run retention:docs) -->
| Données | Conservation |
|---|---|
| Membres, événements (dont le contact le jour J, nom et téléphone), créneaux, inscriptions (dont la preuve d'acceptation de la convention des bénévoles pour une inscription publique : empreinte du texte accepté et date), versions de la convention déjà montrées à des bénévoles (texte par empreinte), pages, journaux d'activité, comptes administrateurs, doublons possibles ignorés, logo de l'organisation | tant que l'organisation est active, événements passés compris, sauf les données des bénévoles d'un événement terminé depuis plus de 3 ans (ligne « Événement terminé depuis plus de 3 ans ») ; effacés 30 jours après sa désactivation (délai compté depuis la dernière modification de l'organisation désactivée) |
| Les mêmes données, pour une organisation suspendue pour abus (envoi de spam, contenu abusif) ; la raison de la suspension, notée par l'opérateur | conservées pendant la suspension, jusqu'à la décision de l'opérateur : levée de la suspension (la règle ordinaire s'applique alors) ou suppression définitive |
| Demande d'espace faite sur le site : nom de l'association, sa description et son besoin, nom et adresse email de la personne | 7 jours après la demande, confirmée ou non (l'espace et le compte créés, et la description gardée sur la fiche de l'espace pour l'opérateur, suivent ensuite les règles de l'organisation ; un espace dont le mot de passe n'a jamais été choisi est effacé avec son compte 30 jours après sa création) |
| Liste de blocage des inscriptions : adresse email ou domaine bloqué, empreinte d'une adresse IP (jamais l'adresse elle-même), raison | jusqu'au retrait par l'opérateur ou jusqu'à l'échéance choisie ; une adresse IP est toujours bloquée pour une durée limitée, 90 jours au plus |
| Journal des décisions de l'opérateur : espace validé, refusé, suspendu, désactivé ou supprimé (nom et identifiant de l'espace), ajout ou retrait de la liste de blocage (adresse ou domaine bloqué, jamais une adresse IP en clair), raison donnée, auteur et date | 365 jours après la décision |
| Événement supprimé par un administrateur | effacé immédiatement, avec ses créneaux, inscriptions, invitations, réponses aux questions, responsables, pages, jalons, messages ciblés et son journal |
| Organisation supprimée par l'opérateur du service | effacée immédiatement, avec ses membres et ses administrateurs |
| Fiche absorbée par une fusion de membres : fiche inactive sans donnée personnelle, le temps que les anciens identifiants restent résolus | 30 jours après la fusion |
| Événement terminé depuis plus de 3 ans : sur ses inscriptions, l'identité des bénévoles (nom, email, téléphone, par leur fiche de membre), leurs commentaires et téléphones ; ses réponses aux questions, invitations et responsables de secteur | anonymisées 3 ans après la fin de l'événement : ses inscriptions passent à une fiche « Bénévole effacé » par personne, sans lien avec sa fiche de membre (effectifs, heures et présences gardés, sans nom), le reste est effacé ; l'événement lui-même (titre, dates, créneaux, totaux) et les fiches des membres restent. L'organisation est prévenue 30 jours avant la première anonymisation, puis les événements qui atteignent 3 ans sont anonymisés chaque mois. Règle appliquée lorsque l'opérateur du service l'active |
| Membres retirés, inscriptions annulées ou refusées, questions archivées | tant que l'organisation existe (tant que leur événement existe pour les inscriptions et les questions), sauf anonymisation 3 ans après la fin de l'événement (ligne précédente) et effacement des données personnelles d'un membre à sa demande (ligne suivante) |
| Données personnelles d'un membre dont l'effacement est demandé : nom, email, téléphone, date de naissance, notes, étiquettes, disponibilités, commentaires et téléphones de ses inscriptions, invitations (dont « pas disponible »), réponses aux questions, abonnements aux notifications, désignations comme responsable de secteur à son adresse, emails en file d'envoi qui la concernent, résultats d'envoi | effacées immédiatement ; la fiche devient « Bénévole effacé » et ses inscriptions restent, sans identité, pour les effectifs, les heures et l'historique |
| Emails en file d'envoi (destinataire et contenu) | effacés chaque nuit une fois partis ; ceux en échec ou annulés 30 jours après leur mise en file |
| Résultats d'envoi par destinataire : statut accepté/rejeté/échec, motif normalisé, codes, empreinte de l'adresse | 30 jours |
| Messages ciblés (objet, texte, public, nombres) | 365 jours, ou avec l'événement |
| Invitations d'administrateur non acceptées | effacées 30 jours après leur dernier envoi |
| Administrateur retiré de l'équipe | effacé immédiatement |
| Bénévoles sans organisation ni inscription | effacés au nettoyage suivant |
| Sauvegardes chiffrées de la base | 30 jours sur le serveur, 90 jours en copie hors site |
<!-- retention:end -->

Une donnée effacée reste dans les sauvegardes chiffrées jusqu'à leur rotation (voir la dernière ligne).

## Événements terminés depuis plus de 3 ans

Pour ne pas garder sans fin les données personnelles des bénévoles, les inscriptions d'un événement terminé depuis plus de 3 ans sont anonymisées, lorsque l'opérateur du service applique cette règle :

- **Ce qui part** : sur ces inscriptions, le nom, l'adresse email et le téléphone des bénévoles, et leurs commentaires ; les réponses aux questions, les invitations et les responsables de secteur de l'événement.
- **Ce qui reste** : l'événement, ses créneaux, les effectifs, les présences et les heures. Chaque bénévole y devient « Bénévole effacé », sans lien avec sa fiche de membre. Les fiches des membres restent elles aussi, mais ces événements n'apparaissent plus dans leur historique ni sur leur attestation de bénévolat.

Vous êtes prévenu par email 30 jours avant la première anonymisation, avec la liste des événements concernés : exportez avant cette date ce dont vous avez besoin (**Rapports** → **Archive de l'événement (JSON)**, attestations des membres). Ensuite, chaque mois, les événements qui atteignent 3 ans sont anonymisés de la même façon, sans nouveau message.

Un membre qui n'a participé à aucun événement depuis 3 ans garde sa fiche : vous pouvez le désactiver, ou effacer ses données, depuis **Membres** (voir [Effacer ou supprimer un membre](effacer-ou-supprimer-un-membre.md)).

## Supprimer une organisation

Exportez d'abord ce que vous voulez garder, puis demandez la désactivation à l'administrateur de la plateforme (adresse de contact en bas de page). L'organisation devient inaccessible immédiatement ; ses données sont effacées définitivement par le nettoyage automatique 30 jours plus tard, sauvegardes comprises à l'issue de leur propre délai. Pendant ces 30 jours, une réactivation reste possible.
