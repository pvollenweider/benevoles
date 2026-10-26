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

<!-- video: EVENT_QUESTIONS -->

**Événements**, puis l'événement, puis l'onglet **Paramètres**, et **Questions** dans ses pages.

![Page des questions d'un événement : « Taille de t-shirt » (choix unique S à XL, obligatoire), « Régime alimentaire » et « Permis de conduire » (texte court), chacune avec son nombre de réponses et les actions Monter, Descendre, Modifier et Retirer, puis le début de la synthèse des réponses](/doc-img/admin-questions.png)

Jusqu'à 5 questions ajoutées au formulaire d'inscription, quand l'événement demande une information de plus : taille de t-shirt, permis, régime, expérience, transport. Types : **texte court**, **oui / non**, **choix unique**, **choix multiple** (un choix par ligne, au moins deux) ou **nombre**, obligatoire ou facultative. L'ordre se change avec **Monter** et **Descendre**.

Chaque bénévole répond une fois pour l'événement. S'il se réinscrit depuis son invitation (ou lors de sa toute première inscription), sa nouvelle réponse remplace l'ancienne, et une question facultative laissée vide efface l'ancienne réponse. Depuis le formulaire public sans invitation, rien ne prouve qui a saisi l'adresse email : seules les réponses manquantes sont ajoutées, les réponses existantes ne sont jamais remplacées. Le serveur vérifie les réponses (une réponse obligatoire manquante ou un choix inconnu refuse l'inscription, avec la raison). Les réponses apparaissent sous chaque inscription, dans la feuille de présence (CSV, une colonne par question) et dans l'archive de l'événement, et le récapitulatif avant l'envoi les liste dans « Transmis à l'organisation ». Chaque bénévole revoit les siennes sur sa page **Mes inscriptions**, sous ses créneaux, et peut les modifier tant qu'il peut encore annuler un de ses créneaux lui-même (jusqu'au début du créneau, ou jusqu'au délai d'annulation de l'événement) ; ensuite, il vous écrit. Une question obligatoire ne peut pas y être vidée. Chaque modification est inscrite au journal de l'événement (la question, l'ancienne et la nouvelle réponse) et vous est signalée par email, regroupée comme les désistements : un seul email pour les modifications de quelques minutes, avec la réponse finale de chaque bénévole. Cet email suit le paramètre « Prévenir les organisateurs à chaque inscription » (voir [Paramètres et suivi des emails](parametres-et-suivi-des-emails.md)).

## Question de type nombre

Le type **Nombre** demande un nombre entier, par exemple « Combien de personnes viennent avec toi au repas ? » : la synthèse additionne les réponses. Sous **Valeurs acceptées**, le **Minimum** et le **Maximum** sont facultatifs : sans minimum, les réponses commencent à 0 ; sans maximum, elles n'ont pas de limite. Les nombres négatifs et les nombres à virgule ne sont pas acceptés. Le bénévole voit la plage acceptée sous le champ (« Un nombre entier, de 1 à 10. »), et son téléphone affiche le clavier numérique. Une réponse hors de la plage est refusée, avec la raison, à l'inscription comme sur sa page **Mes inscriptions**.

Quand une question de type nombre a déjà des réponses, ses bornes peuvent changer tant qu'elles acceptent encore les nombres déjà donnés : si un bénévole a répondu 7, le maximum ne peut pas descendre sous 7.

## Poser une question à certains postes seulement

Une question peut ne concerner que certaines équipes, par exemple « As-tu déjà tenu une caisse ? » pour le Bar. Dans **Modifier** (ou à l'ajout), sous **À qui poser cette question ?**, choisissez **Certains postes seulement**, puis cochez sous **Postes à qui la poser** un ou plusieurs postes de l'événement. Par défaut, **Tous les bénévoles**.

- Sur le formulaire, la question n'apparaît qu'aux bénévoles qui choisissent au moins un créneau de l'un de ces postes. Si le bénévole revient en arrière et change ses créneaux, elle apparaît ou disparaît en conséquence. Cachée, elle n'est jamais obligatoire, même cochée **Réponse obligatoire**, et une réponse envoyée pour elle est ignorée.
- Le serveur vérifie la même règle, à partir des créneaux de l'inscription. Depuis sa page **Mes inscriptions**, ou en revenant s'inscrire à d'autres créneaux depuis elle, le bénévole répond aux questions des postes de tous ses créneaux en cours (confirmés, en liste d'attente ou en demande).
- Si le bénévole quitte le dernier créneau concerné, sa réponse reste enregistrée, visible dans les inscriptions et les exports, mais la question n'est plus obligatoire pour lui. Sa page **Mes inscriptions** la montre à part, sans pouvoir la modifier, sous « Réponses conservées pour tes anciens postes » ; elle redevient modifiable s'il reprend un créneau de ce poste.
- Dans la liste, la question indique ses postes (« Posée seulement pour : Bar »).
- Une question de suivi est posée aux mêmes bénévoles que sa question : elle n'a pas de paramètre à elle. Si elle cesse d'être une question de suivi, elle garde les postes de son ancienne question.
- Renommer un poste l'emporte dans les questions qui le nomment. Supprimer un poste le retire de leurs postes : une question qui n'avait que ce poste n'est alors posée à personne (l'éditeur le signale), jamais à tous. Les réponses déjà données restent attachées à la question.
- Une copie de l'événement reprend les postes de chaque question, même si la copie ne reprend pas leurs créneaux : la question sera posée dès que des créneaux de ces postes existent.

Ce paramètre est indépendant du **Poste concerné** ci-dessous, qui ne décide que de qui est prévenu quand une réponse change.

## Rattacher une question à un poste

Une question peut concerner une équipe plutôt que l'organisation, par exemple « Est-ce que vous mangez avec nous au repas offert en soirée ? » pour l'équipe Cuisine. Dans **Modifier**, choisissez son **Poste concerné** (« Aucun » par défaut). Quand un bénévole modifie ensuite sa réponse depuis sa page **Mes inscriptions**, l'email part aux [responsables de secteur](responsables-de-secteur.md) de ce poste au lieu de vous : ils voient le nom du bénévole, la question, l'ancienne et la nouvelle réponse, avec le lien vers leur page de responsable. Si le poste n'a aucun responsable, vous restez prévenu, comme pour une question sans poste : aucune modification ne se perd. Dans la liste, le poste figure à côté de la question (« Poste : Cuisine »), et la liste déroulante signale les postes sans responsable. Les modifications restent inscrites au journal de l'événement, comme les autres.

Rattacher une question à un poste ne change pas le formulaire : pour choisir à qui elle est posée, utilisez **À qui poser cette question ?** (voir plus haut). Renommer le poste emporte la question avec lui ; supprimer le poste la détache, et ses modifications reviennent aux organisateurs. Seuls les postes qui ont des créneaux sont proposés.

Une question qui a déjà des réponses garde son type, et les choix déjà retenus ne peuvent pas être retirés (créez une nouvelle question si besoin). **Retirer** une question qui a des réponses la sort du formulaire, mais ses réponses restent dans les inscriptions et les exports jusqu'à la suppression de l'événement ; sans réponse, elle est simplement supprimée. Une copie de l'événement reprend les questions (sans les réponses) avec les paramètres, type et bornes compris ; une question rattachée à un poste le reste si la copie reprend les créneaux de ce poste.

## Question de suivi

Une question peut n'être posée qu'après une réponse donnée à une autre question, par exemple « Est-ce que tu manges avec nous le vendredi soir ? », puis seulement si « Oui », « Combien de personnes ? ». Dans **Modifier** (ou à l'ajout), choisissez la question sous **Afficher seulement si…**, puis cochez sous **Réponses qui affichent cette question** la ou les réponses qui la font apparaître. Par défaut, **Toujours (sans condition)**.

- Seule une question **oui / non**, **choix unique** ou **choix multiple** du même événement peut afficher une question de suivi. Pour un choix multiple, il suffit que le bénévole ait coché l'une des réponses choisies.
- Un seul niveau : une question de suivi ne peut pas avoir elle-même de question de suivi, et une question qui en a une ne peut pas dépendre d'une autre.
- Sur le formulaire, la question de suivi apparaît juste après sa question, légèrement en retrait, dès que la réponse correspond ; sinon elle reste cachée et n'est pas obligatoire, même cochée **Réponse obligatoire**.
- Si le bénévole change ensuite sa réponse, depuis sa page **Mes inscriptions** ou en s'inscrivant à d'autres créneaux, et que la question de suivi ne s'applique plus, sa réponse à la question de suivi est effacée. Ce changement est noté dans l'historique et signalé comme les autres modifications de réponses.
- Dans la liste, la question de suivi est placée sous sa question, avec sa condition. **Monter** et **Descendre** déplacent une question avec ses questions de suivi ; une question de suivi ne change de place que parmi celles de la même question.
- **Retirer** une question retire aussi ses questions de suivi (leurs réponses restent dans les exports, comme celles de la question).
- Tant qu'une question a une question de suivi, elle reste une question oui / non ou à choix et garde les réponses qui l'affichent. Une question de suivi qui a déjà des réponses garde sa question : vous pouvez seulement ajouter des réponses qui l'affichent, ou la poser sans condition.
- Les questions de suivi comptent dans la limite de 5 questions. Une copie de l'événement les reprend avec leur condition.

Ne demandez que ce qui est nécessaire à l'organisation, et pas d'information sensible (santé, religion, opinions…) : les réponses sont des données personnelles.

## Synthèse des réponses

Sous la liste des questions, **Synthèse des réponses** compte les réponses, par exemple pour savoir combien de t-shirts de chaque taille commander. Un tableau par question :

- **choix unique** et **choix multiple** : le nombre de bénévoles par choix, dans l'ordre de la question, puis **Sans réponse**. Pour un choix multiple, chacun peut cocher plusieurs choix : le total peut dépasser le nombre de bénévoles ;
- **oui / non** : les deux totaux, puis **Sans réponse** ;
- **nombre** : le **Total** (la somme des nombres indiqués), le **Nombre de réponses**, puis **Sans réponse**. Les bénévoles en attente ont leur propre total, dans la colonne **En attente** ;
- **texte court** : les réponses regroupées sans tenir compte des majuscules, des accents ni des espaces autour (« Végétarien » et « vegetarien » comptent ensemble, sous l'orthographe la plus saisie), la plus fréquente en premier, puis **Sans réponse**.

Une question posée à certains postes seulement ne compte que les bénévoles inscrits sur l'un de ces postes, confirmés ou en attente selon ces inscriptions-là : sa légende nomme les postes et donne le nombre de bénévoles concernés, et le fichier CSV ajoute les postes à son libellé. La réponse conservée d'un bénévole qui a quitté ces postes n'y compte pas.

Une question de suivi a son tableau juste après celui de sa question. Elle ne compte que les bénévoles à qui elle a été posée (ceux dont la réponse l'affiche) : sa légende en donne le nombre, et **Sans réponse** n'y compte pas ceux qui ont répondu « Non ». Dans le fichier CSV, sa condition suit son libellé.

Qui est compté : chaque bénévole qui a au moins un créneau confirmé sur l'événement, une seule fois quel que soit son nombre de créneaux. Les bénévoles sans créneau confirmé mais en liste d'attente, avec une place proposée ou une demande à valider sont comptés à part, dans la colonne **En attente** : une marge pour la commande. Les inscriptions annulées ou refusées ne comptent pas, même si la réponse reste enregistrée. Un choix retiré de la question après avoir été retenu reste compté, après les choix actuels, avec la mention « (choix retiré) ». Les questions retirées n'apparaissent pas.

La ligne **État au** donne la date et l'heure du calcul, dans le fuseau de l'organisation : les inscriptions bougent jusqu'à la commande. **Télécharger la synthèse (CSV)** donne un fichier (question, réponse, confirmés, en attente) à envoyer tel quel à un fournisseur, sans nom ni coordonnées ; **Imprimer la synthèse** ouvre la même synthèse en noir et blanc, aussi disponible dans les [Rapports](rapports-badges-et-resume.md).
