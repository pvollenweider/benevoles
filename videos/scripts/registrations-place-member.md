# Placer un membre sur plusieurs créneaux

Public : organisateurs. Niveau essentiel. Durée visée : 90–120 secondes.

## Parcours et narration

### welcome

Un membre vous a confirmé deux horaires ? Vous pouvez les enregistrer ensemble, sans recopier ses coordonnées. Ouvrons Inscriptions, puis Ajouter manuellement. Le formulaire commence par Membre existant : il cherche dans votre liste de membres.

### member

Cherchons Sarah par son nom, puis cliquons sur Chercher. Le résultat affiche aussi son email pour éviter une confusion. Cliquez sur Choisir. Le résumé Membre choisi reprend ses coordonnées. Changer de personne permet de corriger le choix avant de valider.

### shifts

Choisissons un premier créneau, à l’accueil de quinze à dix-huit heures. Cliquez ensuite sur Ajouter un autre créneau. La ligne Créneau deux, facultatif, apparaît avec son bouton Retirer. Choisissons le démontage du lendemain, également de quinze à dix-huit heures. Les deux horaires seront ajoutés ensemble.

### add

Avant de valider, lisez la phrase sous la note. Un email de confirmation partira à Sarah dans une dizaine de minutes, avec tous les créneaux ajoutés pour cette personne à cet événement. Cliquez sur Ajouter. Les deux inscriptions apparaissent, et le message confirme l’ajout sur les deux créneaux.

### email

Dix minutes plus tard, ouvrons la boîte de démonstration. Le véritable email indique qui a inscrit Sarah et pour quelle organisation. Il liste ses deux créneaux, puis son lien personnel pour consulter ses inscriptions. Plusieurs ajouts pour la même personne et le même événement sont regroupés après le dernier ajout. Sans adresse email, aucun message ne part.

## Preuves réelles

Sarah est un membre avec email. Le seed retire uniquement ses deux inscriptions de démonstration à ajouter. Le recorder vérifie le lien à sa fiche, les deux inscriptions et une seule ligne outbox. Hors écran, après « Dix minutes plus tard », seule cette ligne devient due, puis POST /api/cron/outbox est appelé avec l’authentification réelle du cron. Le message Mailpit doit réellement contenir les deux horaires et le lien benevol.app ; aucune fabrication d’email.

## Correction de la première prise

Le bandeau de résultat annonce les inscriptions ; seul le formulaire annonce l’email avant validation. Narration corrigée et filtre immédiat supprimé pour conserver le bandeau visible. Une seule reprise, changements uniquement sous videos/.

## Reprise de la boîte email — batch 13

Narration auditée réutilisée sans régénération. Nettoyage limité aux messages identifiés de la fixture Montvert et suppression des anciennes confirmations en attente pour la personne et cet événement, avant chaque seed/prise. Les autres messages sont conservés. Mailpit est ouvert en suivant le résultat de recherche pour préserver la liste filtrée ; les identifiants des messages réellement affichés sont vérifiés. Le MP4 final (93,840 s) ne montre que la confirmation de cette prise, dont les deux créneaux et le lien personnel. Contrôles complets et revue des frames de 73 à 93 secondes : READY local, non publié.
