# Confirmer son inscription et gérer les erreurs

**Identifiant stable :** `VOLUNTEER_CONFIRMATION_ERRORS`

## Utilité

Comprendre comment reprendre une inscription sans perdre les champs ni créer de doublon.

## Démonstration

1. Remplir le formulaire public et oublier une question obligatoire.
2. Corriger la taille de t-shirt après le vrai message de validation.
3. Rendre le créneau complet dans la base locale pendant la saisie et montrer le refus serveur.
4. Rétablir la capacité, interrompre une requête avec Playwright puis confirmer à nouveau.
5. Rétablir le réseau, confirmer réellement puis ouvrir l’email dans Mailpit.

## Résultat visible

Le formulaire garde les réponses pendant les erreurs. Une inscription réelle est confirmée et son email apparaît dans la boîte locale.

## Compléments vérifiés pour la prochaine prise

Le précontrôle `verify-registration-errors.ts` utilise une organisation fictive
séparée, sans modifier la fixture des vidéos existantes. Les quatre captures
de `server-preflight` ont été inspectées :

- Aline est déjà inscrite de 10h à 12h ; sa demande pour Vestiaire de 11h à 13h
  reçoit un vrai refus serveur 409 avec le créneau qui chevauche. Les champs
  restent présents, et aucune inscription supplémentaire n'est créée.
- Nicolas confirme Logistique. La requête est réellement transmise, le serveur
  répond 201 et crée son inscription, puis seule la réponse au navigateur est
  volontairement perdue. Le formulaire montre « Connexion interrompue ».
- Le nouvel essai reçoit un vrai 409 « déjà inscrit », avec l'indication du lien
  envoyé par email. Une seule inscription de Nicolas subsiste avant et après
  ce nouvel essai ; elle apparaît également dans la vue organisateur.

Rapport `server-preflight/proof.json`. Ce cas de réponse perdue après
enregistrement est distinct de l'interruption avant transmission montrée dans
la première prévisualisation. Les captures ne sont pas une nouvelle vidéo
synchronisée : ces séquences restent à intégrer au recorder et à la narration
continue. La comparaison du succès par invitation est décrite ci-dessous.
Le script refuse de supprimer les inscriptions d'un précontrôle déjà réalisé.

La comparaison réelle `verify-registration-invitation-success.ts` a ensuite
réussi les deux inscriptions dans cette même fixture séparée : Zoé via le
formulaire public ordinaire et Aline depuis une invitation effectivement
envoyée. La première réponse n'expose aucun jeton ; la page n'a pas de lien
personnel et l'email effectivement reçu contient ce lien. L'invitation
préremplit Aline, et sa confirmation affiche « Accéder à mon inscription ».
Les trois images de confirmation et de page personnelle ont été inspectées.

Le test initial s'est arrêté après les deux succès sur un sélecteur trop court
du bouton d'annulation ; le nom contient aussi le libellé du créneau. Le
contrôle a été terminé en lecture seule, sans refaire les inscriptions ou
l'invitation. Rapport `server-preflight/success-comparison.json` ; le jeton
n'est jamais enregistré dans le rapport. L'utilisation de l'invitation est
vérifiée en base. Ces preuves restent à intégrer au tournage de la vidéo 29,
et ne constituent pas encore une validation de son MP4.

Préparation reproductible pour le prochain tournage : le helper
`prepareRegistrationErrorFixture` reste limité à la base locale 45433 et à
l'organisation `video-errors`. Toute réinitialisation demande un paramètre
explicite et vérifie le propriétaire, l'événement, les membres et les
destinataires avant de retirer seulement les IDs inspectés. Il ne touche ni
à l'organisation par défaut ni aux scénarios accessibilité/confidentialité.
Son refus sans réinitialisation explicite a été exécuté : les inscriptions,
membres et messages sont restés inchangés. La remise à zéro a depuis été
exécutée pour les répétitions décrites ci-dessous ; les preuves précédentes
sont conservées comme traces de leurs prises respectives.

## Recorder enrichi de onze chapitres

Le recorder dédié est maintenant branché et a passé sa répétition complète
sur le port 43102. Il reprend les huit sujets initiaux et ajoute le conflit
serveur, la réponse perdue après enregistrement et la comparaison des deux
confirmations. La question t-shirt est réellement requise. Le premier cas
réseau interrompt avant transmission ; le second transmet vraiment, attend
la réponse 201 du serveur, puis perd uniquement sa réponse au navigateur.
Le renvoi ne crée aucun doublon. Résultat réel : cinq inscriptions actives.
Le rapport `registration-error-capture-checks.json` conserve ces vérifications.

La remise à zéro explicite a retiré seulement les anciennes données fictives
inspectées de cette organisation (trois membres, six lignes de file et les
éléments de l'ancien événement), puis recréé le scénario. Les autres
organisations sont intactes. Le contrôle de destinataire utilise `openPayload`
pour les notifications chiffrées : il n'accepte pas un payload inconnu.
Les anciennes preuves de précontrôle restent des traces de ces prises passées,
pas une description du nouvel état courant.

L'ancien montage de huit chapitres, sa capture, timeline et manifeste sont
conservés dans `previous-eight-scenes`. Le nouveau fichier brut est une
répétition sans voix synchronisée, pas un MP4 final. Le manifeste de onze
chapitres demande une nouvelle narration Kore continue. Une tentative normale
refuse l'audit absent avant toute remise à zéro ou remplacement : le SHA-256
de la capture est resté identique avant/après ce refus,
`0b40fb5156da817779a63f1e81d3c695e7407732a40a0d868ae1498497c46ca4`.
Le contrôle de préservation a ensuite confirmé les cinq inscriptions intactes.
La nouvelle voix, l'alignement, le montage et ses audits finaux restent à faire.

### Contrôle visuel de la répétition, 6 octobre

Les images à 85 % des chapitres conflit et réponse perdue ne suffisent pas à
prouver leur résultat : elles montrent encore la saisie. Une image tardive
de la réponse perdue montre réellement la ligne unique de Nicolas dans les
inscriptions. L'image tardive du conflit montre encore le bouton de
confirmation : le recorder attend désormais le rendu du vrai message
d'erreur, le fait défiler à l'écran et le maintient au moins 1,8 seconde.
La comparaison par invitation exige aussi `emailsSent = 1`, au-delà du seul
statut HTTP 201. La nouvelle répétition des onze chapitres est passée, avec
cinq inscriptions finales. Son image à 51 secondes a été inspectée : le
message rouge de chevauchement, le créneau Accueil concerné et le lien de
retour au planning sont visibles, les informations restent remplies.
Le contrôle TypeScript passe. Cela ne constitue pas une validation de
synchronisation vocale ; les anciens extraits du dossier de revue doivent
être réextraits avant d'être utilisés pour cette nouvelle capture.

Le contrôle des images comprend maintenant une cinquième image, juste avant
la fin de chaque chapitre, et identifie la capture par son SHA-256. Il a révélé
que l'ouverture du lien personnel ne restait pas assez longtemps à l'écran :
le recorder attend désormais le rendu stabilisé de « Mes inscriptions » puis
1,8 seconde. Une répétition suivante a été arrêtée par un vrai HTTP 429 local,
avant le succès : ce n'est pas une prise réussie. Le navigateur de ce scénario
utilise maintenant l'adresse TEST-NET-1 `192.0.2.29` exclusivement sur le
serveur local 43102 ; la préparation remet à zéro son seul compteur
`registrations:192.0.2.29` dans la base vidéo isolée. La limite applicative
20/heure reste active et les compteurs partagés/loopback ne sont pas modifiés.

La répétition suivante est passée sur les onze chapitres. Les 55 images ont
été réextraites et indexées avec le SHA-256 de cette nouvelle capture. Quatre
images de fin ont été inspectées individuellement : refus de chevauchement,
ligne unique de Nicolas après reprise, page personnelle d'Aline affichant
ses deux créneaux, puis liste organisateur des cinq inscriptions. La page
personnelle est cette fois effectivement présente dans la capture. Cela ne
signifie pas que les 55 images ou la synchronisation vocale sont validées.

## Points d’attention

La coupure réseau est explicitement annoncée comme une simulation. La capacité change réellement dans la base locale. Le format email ne prouve pas que la boîte existe. Le lien personnel n’est pas affiché sur une confirmation publique ordinaire ; le parcours par invitation, montré dans les modules Invitations, prouve l’identité et peut le fournir.

## Observation produit à évaluer

Le modèle d’email `registration.ts` affiche le message personnalisé tel quel, sans interpoler les variables annoncées dans le formulaire de réglages. Le jeu de données utilise donc un texte sans variable. Ce comportement devra être évalué lors du module consacré aux modèles et variables ; la formation ne doit pas promettre cette interpolation dans l’email sans vérification.
