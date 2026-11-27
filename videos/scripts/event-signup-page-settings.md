# Régler ce que voient les bénévoles sur la page d'inscription

**Identifiant stable :** `EVENT_SIGNUP_PAGE_SETTINGS`

Voix Kore, une prise continue, narration au vouvoiement (organisateurs) ; les écrans bénévoles ne sont cités que tels qu'ils s'affichent.

## Utilité

Présenter les quatre réglages qui changent ce que voient les bénévoles sur la page d'inscription, livrés ou modifiés en 2.9, chacun suivi de son effet sur la vraie page : « Affichage des créneaux par défaut » (#1407), « Créneaux qui se chevauchent » (#1467), la convention des bénévoles facultative (#1468) et « Regrouper les créneaux par secteur sur la page d'inscription » (#1469), plus le lien « Détails » de la vue Liste (#1471).

## Démonstration

1. Informations de la « Fête des vendanges de Montvert », groupe « Affichage des créneaux par défaut » : « Automatique » coché, on choisit « Liste » (enregistré tout seul, « Modifications enregistrées à … »).
2. Page d'inscription : la liste s'affiche sur ordinateur, les boutons « Frise » et « Liste » restent au-dessus.
3. On choisit le Bar de 18 h à 21 h : le Vestiaire, aux mêmes heures sur un autre poste, n'est plus proposé.
4. Retour aux informations, groupe « Créneaux qui se chevauchent » : « Autoriser les chevauchements… », fenêtre « Autoriser les créneaux qui se chevauchent ? », « Autoriser » ; la ligne dit « Chevauchements : autorisés » et la note « Attention » apparaît.
5. Page d'inscription : le Bar et le Vestiaire se choisissent ensemble ; « Continuer », le récapitulatif de « Tes informations » affiche « Tu peux quand même t'inscrire. Vérifie que tu peux faire les deux. … ».
6. Paramètres, section « Convention des bénévoles » : l'interrupteur « Demander aux bénévoles d'accepter une convention » passe à non (« Aucune convention n'est demandée à l'inscription. »), « Enregistrer », « Enregistré ».
7. Page d'inscription, un créneau, « Continuer » : ni case « J'ai lu et j'accepte », ni lien « convention des bénévoles ».
8. Informations, carte « Secteurs » : l'interrupteur « Regrouper les créneaux par secteur sur la page d'inscription », désactivé, est activé ; « Regroupement activé : la page d'inscription montre vos secteurs. »
9. Page d'inscription en liste : titres « Accueil », « Buvette », « Autres postes », dans cet ordre ; puis « Frise » : les mêmes groupes sous un bandeau.
10. Retour à la liste : « › Détails » sous un créneau d'« Accueil entrée » montre la description et le lieu (« Grand portail, place du Pressoir ») sans choisir le créneau.

## Points d'attention

- Seed : `scripts/seed-video-scenario.ts signup-page-settings` (organisation dédiée `formation-inscription`, sans bêta ; secteurs « Accueil » et « Buvette » adoptés, « Rangement » sans secteur ; Bar et Vestiaire de 18 h à 21 h ; tous les réglages à leur valeur par défaut). Une prise par seed : la prise change les quatre réglages.
- Le recorder (`videos/lib/record-signup-page-settings.ts`) passe par les vrais écrans et vérifie l'effet de chaque réglage sur la page publique rechargée ; aucune écriture directe en base après le seed.
- Faits : `content/guide/creer-un-evenement.md` (tableau des paramètres), `content/guide/choisir-ses-creneaux.md`, `content/guide/convention-des-benevoles.md`, `content/guide/gerer-les-postes.md#regrouper-les-creneaux-par-secteur-sur-la-page-d-inscription`, `src/lib/signup-recap.ts`.
- À intégrer au guide « Créer un événement » (`<!-- video: EVENT_SIGNUP_PAGE_SETTINGS -->` sous le tableau des paramètres) seulement une fois la vidéo publiée.

## Révision

- Révision 1 (lot 44, 2026-11) : création. Sources écrites par Claude, capture par Codex.
