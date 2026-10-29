# Protéger les pauses et la charge des bénévoles

**Identifiant stable :** `WORKLOAD_PROTECTION`

Voix Kore, une prise continue, narration au vouvoiement (organisateurs) ; les écrans bénévoles ne sont cités que tels qu'ils s'affichent.

## Utilité

Montrer la fonction bêta « Protection des pauses et de la charge » (#1171, PR #1201 à #1208) de bout en bout : préparer les lieux et le repas sur le pouce dans Créneaux, remplir la carte de l'événement (début de la journée de service et ses exemples, limites, « Repères et suggestions » avec leurs sources, jours sans mission, pause repas, trajet entre deux lieux, moins de 18 ans), vérifier l'aperçu, voir l'activation refusée tant qu'un programme dépasse, activer, fixer une limite personnelle, puis ce que voient les bénévoles et l'organisation.

## Démonstration

1. Créneaux, section « Lieux des missions » : Grande Scène, Scène du Lac, Chapiteau ; « Nouveau lieu » « Le Dôme », « Ajouter le lieu ». « Vestiaire du Dôme » reste sans lieu.
2. « Gérer les postes », bouton « Repas : non » de « Bar Grande Scène » : cocher « Poste « Bar Grande Scène » : repas sur le pouce possible sur ses créneaux », « Enregistrer » ; le bouton devient « Repas : sur le pouce ».
3. Informations du Festival du Lac de Montvert, carte « Protection des pauses et de la charge » : « Désactivée ».
4. « Début de la journée de service » 06:00 ; les exemples apparaissent (« Une journée de service va de 6 h à 6 h le lendemain. »).
5. « Reprendre les réglages d'avertissement existants » (6 h, 30 min, 8 h) ; « Durée maximale de missions sur tout l'événement » 20 h ; « Attente maximale entre deux missions d'une même journée » 3 h.
6. « Repères et suggestions » ouvert, sources lues ; boutons « Utiliser 11 h de repos entre deux journées », « Utiliser 30 min de repas entre 11 h 30 et 14 h et entre 18 h et 21 h », « Utiliser 15 min entre deux lieux », « Utiliser les repères pour les moins de 18 ans ».
7. « Jours sans mission » : « Appliquer cette règle », 1 jour sur 3 journées ; l'exemple relit les trois journées du vendredi au dimanche.
8. « Pause repas » remplie (30 min, deux plages, tous les jours) ; « Trajet entre deux lieux » 15 min, ligne « 1 créneau n'a pas de lieu : son trajet n'est pas vérifié. » et lien « Choisir les lieux dans Créneaux ».
9. « Moins de 18 ans » rempli, « Événement : … » sous chaque valeur, ligne sur les 8 personnes sans date de naissance.
10. « En résumé », puis « Aperçu » : « Aperçu : 1 personne dépasserait ces limites. » ; Noah De Jong listé (trois journées avec une mission).
11. « Activer la protection » : refus (« Ces limites ne sont pas respectées aujourd'hui par le programme de Noah De Jong. … rien n'a été activé ni modifié. »), « Programmes à modifier d'abord ».
12. « Jours sans mission » : « Ne pas appliquer cette règle », « Aperçu » (aucun programme), « Activer la protection » : « Activée ».
13. « Limites personnelles », « Ajouter des limites pour une personne » : Camille Rossi, « Durée maximale par journée de service » 6 h, « Enregistrer les limites de la personne ».
14. Page publique : Emma choisit samedi « Accueil Chapiteau » (14 h 30 à 18 h) et « Bar Grande Scène » (18 h à 22 h) ; le récapitulatif affiche « Ces créneaux dépassent les limites de l'événement » (7 h 30 d'affilée, aucun temps entre le Chapiteau et la Grande Scène) ; prénom, nom, email, date de naissance, charte et consentement ; « Confirmer mon inscription » : refus 409, même explication.
15. « Mes inscriptions » de Sarah : « Annuler » sur « Accueil Chapiteau », « Oui, annuler ».
16. Inscriptions : ses deux créneaux du dimanche portent « Limite dépassée : … » (attente entre l'accueil du matin et le bar du soir).
17. « Mes inscriptions » de Sarah rechargée : carte « Pauses et charge », puis « Mes limites ».
18. Informations de l'événement : « Activée », lien « 1 programme à revoir ».

## Résultat visible

Un événement protégé, ses lieux et son repas sur le pouce en place, une limite personnelle, une inscription refusée avec un message précis et un programme à revoir signalé des deux côtés.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts workload-protection` (`scripts/seed-video-workload.ts`) : organisation fictive dédiée `formation-charge` inscrite à la bêta, seule la fonction « Protection des pauses et de la charge » ouverte, événement du vendredi au dimanche au moins deux semaines plus tard, protection désactivée et sans valeurs, trois lieux, huit personnes confirmées. Une prise par seed : la prise ajoute un lieu, règle le repas sur le pouce, active la protection, enregistre une limite personnelle et annule un créneau de Sarah.
- Le planning est jugé d'avance avec le vrai évaluateur (`videos/lib/__tests__/workload-fixture.test.ts`) : sans le repas sur le pouce du bar, la pause repas refuserait les soirées du bar ; avec 1 jour sur 3, seul Noah dépasse ; après « Ne pas appliquer », personne ; Emma dépasse le travail continu et la marge de trajet ; l'annulation de Sarah laisse une attente trop longue.
- Les champs de durée gardent leurs valeurs seulement dans la page : rien n'est enregistré avant « Activer la protection ». Ne pas quitter la page entre le remplissage et l'activation.
- La date de naissance d'Emma (adulte) est demandée parce que la règle des moins de 18 ans est appliquée.
- Noms de scènes et festival inventés ; personnes de `videos/lib/fixture-names.ts`, adresses `video.workload.*@example.org`.
- L'annulation de Sarah envoie les vrais emails dans la boîte locale ; ils ne sont pas montrés.
- Rendu en attente (sources seulement, 2026-10-29). Le recorder (`videos/lib/record-workload-protection.ts`) n'a pas encore été répété : une répétition `--rehearse --quick-rehearse` après un seed neuf est à faire avant la prise narrée.
