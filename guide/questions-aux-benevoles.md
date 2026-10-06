---
roles: [admin]
group: preparer
order: 90
summary: Ajouter jusqu'à 5 questions au formulaire d'inscription, puis compter les réponses pour passer commande.
related: [rapports-badges-et-resume, suivre-les-inscriptions]
legacy: [admin#questions-aux-benevoles, admin#synthese-des-reponses]
aliases: []
---

# Questions aux bénévoles

**`/admin/events/[id]/questions`**, depuis la page de l'événement (**Questions**).

![Page des questions d'un événement : « Taille de t-shirt » (choix unique S à XL, obligatoire) et « Régime alimentaire » (texte court), avec les actions pour les modifier, les réordonner ou les retirer](/doc-img/admin-questions.png)

Jusqu'à 5 questions ajoutées au formulaire d'inscription, quand l'événement demande une information de plus : taille de t-shirt, permis, régime, expérience, transport. Types : **texte court**, **oui / non**, **choix unique** ou **choix multiple** (un choix par ligne, au moins deux), obligatoire ou facultative. L'ordre se change avec **Monter** et **Descendre**.

Chaque bénévole répond une fois pour l'événement. S'il se réinscrit depuis son invitation (ou lors de sa toute première inscription), sa nouvelle réponse remplace l'ancienne, et une question facultative laissée vide efface l'ancienne réponse. Depuis le formulaire public sans invitation, rien ne prouve qui a saisi l'adresse email : seules les réponses manquantes sont ajoutées, les réponses existantes ne sont jamais remplacées. Le serveur vérifie les réponses (une réponse obligatoire manquante ou un choix inconnu refuse l'inscription, avec la raison). Les réponses apparaissent sous chaque inscription, dans la feuille de présence (CSV, une colonne par question) et dans l'archive de l'événement, et le récapitulatif avant l'envoi les liste dans « Transmis à l'organisation ».

Une question qui a déjà des réponses garde son type, et les choix déjà retenus ne peuvent pas être retirés (créez une nouvelle question si besoin). **Retirer** une question qui a des réponses la sort du formulaire, mais ses réponses restent dans les inscriptions et les exports jusqu'à la suppression de l'événement ; sans réponse, elle est simplement supprimée. Une copie de l'événement reprend les questions (sans les réponses) avec les réglages.

Ne demandez que ce qui est nécessaire à l'organisation, et pas d'information sensible (santé, religion, opinions…) : les réponses sont des données personnelles.

## Synthèse des réponses

Sous la liste des questions, **Synthèse des réponses** compte les réponses, par exemple pour savoir combien de t-shirts de chaque taille commander. Un tableau par question :

- **choix unique** et **choix multiple** : le nombre de bénévoles par choix, dans l'ordre de la question, puis **Sans réponse**. Pour un choix multiple, chacun peut cocher plusieurs choix : le total peut dépasser le nombre de bénévoles ;
- **oui / non** : les deux totaux, puis **Sans réponse** ;
- **texte court** : les réponses regroupées sans tenir compte des majuscules, des accents ni des espaces autour (« Végétarien » et « vegetarien » comptent ensemble, sous l'orthographe la plus saisie), la plus fréquente en premier, puis **Sans réponse**.

Qui est compté : chaque bénévole qui a au moins un créneau confirmé sur l'événement, une seule fois quel que soit son nombre de créneaux. Les bénévoles sans créneau confirmé mais en liste d'attente, avec une place proposée ou une demande à valider sont comptés à part, dans la colonne **En attente** : une marge pour la commande. Les inscriptions annulées ou refusées ne comptent pas, même si la réponse reste enregistrée. Un choix retiré de la question après avoir été retenu reste compté, après les choix actuels, avec la mention « (choix retiré) ». Les questions retirées n'apparaissent pas.

La ligne **État au** donne la date et l'heure du calcul, dans le fuseau de l'organisation : les inscriptions bougent jusqu'à la commande. **Télécharger la synthèse (CSV)** donne un fichier (question, réponse, confirmés, en attente) à envoyer tel quel à un fournisseur, sans nom ni coordonnées ; **Imprimer la synthèse** ouvre la même synthèse en noir et blanc, aussi disponible dans les [Rapports](rapports-badges-et-resume.md).
