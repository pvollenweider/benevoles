# VOLUNTEER_HOURS_CERTIFICATE — heures, attestations et bilan

Identifiant : `VOLUNTEER_HOURS_CERTIFICATE`.
Slug : `volunteer-hours-certificate`.
Source de narration : `videos/manifests/volunteer-hours-certificate.json`.
Voix Kore, vouvoiement, ton souriant, patient et bienveillant. Aucune balise de
pause à prononcer, aucune promesse de mesure chronométrée.

Les huit chapitres expliquent l'utilité, montrent les gestes réels et vérifient
leur résultat : liste des membres, dernière participation et tris, chronologie, deux exports de période, paramètres
de l'attestation, distinction présence/prévision, PDF imprimé réellement et
résumé d'événement. Le module est dans `videos/lib/record-volunteer-hours.ts`.

## Environnement privé

- Serveur exclusivement `http://localhost:43114`, mode wrapper `serve-hours`.
- Organisation `video-hours` / `formation-heures` ; aucun membre de `default`.
- Personnes fictives aux noms naturels : Aline Mercier, Benoît Favre, Clara Besson ; organisatrice Élodie Rochat.
- Logo vectoriel original rasterisé localement en PNG 240 × 80 : octets, dimensions et SHA-256 exacts contrôlés avant chaque revue/reset. Le rendu `grayscale(1)` est vérifié avec les vraies règles CSS d'impression du produit.
- Owner `video.hours.owner@example.org` ; son hash est conservé lors du reset.
- Première création : hash repris uniquement du compte de formation navigation
  dont l'identité complète est explicitement vérifiée.
- Huit inscriptions et trois événements aux identifiants exacts ; les réponses,
  invitations, notifications et autres données imprévues bloquent le reset.
- Ledger `videos/output/volunteer-hours-certificate/ownership.json` lié à la date
  de création de l'organisation et à l'empreinte du scénario.
- Les calculs importent les helpers de la compilation main prouvée, pas ceux de
  l'ancien checkout de travail.

## Impression

Le bouton produit appelle son vrai `window.print()` et conserve sa journalisation.
Il n'est ni intercepté ni remplacé. En mode headless, le callback utilise ensuite
`page.pdf()` sur cette même page avec ses règles CSS d'impression. Il vérifie
les octets PDF, l'empreinte, le texte, les pages et l'origine de compilation, puis
montre la première page rendue par Poppler avec une légende explicite :
« PDF réel — impression locale du navigateur ». Ce n'est pas un téléchargement
PDF serveur ni une validation du dialogue d'impression natif.

Les autres pages du document doivent également être rendues et relues avant
publication si le PDF dépasse une page. Ne pas revendiquer une signature numérique.

## Exécution, après compilation courante et autorisation de runtime

Préparation par wrapper `prepare-volunteer-hours.ts`, puis rehearsal non narré.
Après réussite, `--reset-owned` prépare une prise fraîche. Générer la narration
seulement lorsque les quotas TTS sont disponibles, puis capture narrée, assemblage
avec musique/clics/frappes, extraction des images, transcription multilingue du
MP4, validation technique et vraie revue audiovisuelle. Les preuves ne sont jamais
reportées rétroactivement sur une ancienne capture.

L'intégration et les tests purs ne prouvent pas encore la validité de la fixture en
base ni l'exécution des sélecteurs. Aucune vidéo de ce parcours n'est encore livrée.


## Révision du 2026-10-16 — lot 22-5

Relecture du produit main `43c1aae776430702dd155711b25f4f0a1331fce5`, CHANGELOG [Unreleased] et PR fusionnées #990 à #1012, #1021 (onglets lot 2), #1022 (#1013). Étiquettes, Modifier, Heures prévues, navigation Inscriptions / Invitations et Documents à imprimer vérifiées dans les scénarios.

WAITING TTS — plafond mensuel connu ; aucun nouvel appel. Régénérer la narration ENTIÈRE, même voix, une seule passe, `continuousPauseTags: false`. Phrases changées :

- Dans la liste des membres, regardons les heures prévues et les heures attestées.
- Pour Aline, douze heures sont prévues sur ses créneaux confirmés, passés et à venir, et six correspondent à une présence saisie.
- Ces six heures font partie des douze : elles ne s'ajoutent pas.
- Les inscriptions annulées et les créneaux annulés sont exclus, et les horaires qui se chevauchent ne sont comptés qu’une fois.
- Il compte les créneaux confirmés non annulés de cette période, avec les heures prévues et attestées séparées.
- Le total indique six heures prévues, dont deux attestées.
- Regardons cette colonne, puis cochons Inclure les heures prévues sans présence saisie.
- Attention à la lecture : cette nouvelle colonne est le complément, pas le total des heures prévues de la liste des membres.
- Pour Aline, nous retrouvons six heures attestées, une participation terminée avant la fin et aucune heure prévue sans présence.
- Enfin, ouvrons Documents pour la Fête de septembre.
- Nous retrouvons six heures prévues, dont deux attestées, puis le remplissage par poste.


## Lot 41 — départ avant la fin

La fixture marque le créneau de l’après-midi d’Aline comme terminé avant la fin : arrivée conservée, durée inconnue. Douze heures restent prévues, six attestées ; sur mai–septembre, une participation terminée avant la fin, zéro heure prévue sans présence. Le CSV de septembre reste à six heures prévues dont deux attestées, avec une participation terminée avant la fin. Deux présences sur trois créneaux sont enregistrées dans le résumé, dont ce départ.

Le libellé actuel du produit est « Participations terminées avant la fin ». La colonne apparaît quand le document en compte, contrairement à l’ancienne note d’évidence qui la disait toujours visible. La fixture en montre réellement une ; aucun changement produit.

### Narration courante des chapitres modifiés

### hours-list

Reconnaître l'engagement, c'est aussi disposer d'un bilan clair. Dans la liste des membres, regardons les heures prévues et les heures attestées. Pour Aline, douze heures sont prévues sur ses créneaux confirmés, passés et à venir, et six sont attestées après une présence saisie. Une participation terminée avant la fin reste enregistrée, mais n'atteste aucune heure : sa durée réellement effectuée est inconnue. Ces six heures font partie des douze : elles ne s'ajoutent pas. Les inscriptions annulées et les créneaux annulés sont exclus, et les horaires qui se chevauchent ne sont comptés qu’une fois. Toutes les personnes et les données de cette démonstration sont fictives.

### activity

Ouvrons l'activité d'Aline. Vous retrouvez les faits enregistrés, leur date et l'événement concerné. C'est utile pour comprendre son parcours et vérifier ce qui s'est passé. Ce journal ne mesure pas le temps réellement travaillé : les heures attestées reposent sur une présence saisie et sur la durée du créneau, sauf les participations terminées avant la fin, qui n'attestent aucune heure. L'absence de présence saisie ne permet pas, à elle seule, de conclure qu'une personne était absente.

### certificate-presence

Par défaut, l'attestation met en avant les heures attestées. Regardons cette colonne, puis cochons Inclure les heures prévues sans présence saisie. Attention à la lecture : cette nouvelle colonne est le complément, pas le total des heures prévues de la liste des membres. Pour Aline, nous retrouvons six heures attestées, une participation terminée avant la fin et aucune heure prévue sans présence sur cette période. La colonne Participations terminées avant la fin compte ces participations enregistrées, sans leur attribuer des heures. Ce document ne prétend pas mesurer un temps de travail chronométré. Une présence non saisie n'est pas non plus une preuve d'absence.

### certificate-pdf

Quand le contenu vous convient, cliquons sur Générer et imprimer l'attestation. L'application lance l'impression du navigateur : vous pouvez l'enregistrer en PDF. Pour cette démonstration, nous ouvrons le vrai PDF produit par le moteur d'impression local du navigateur, pas un téléchargement proposé par le serveur. Relisons le nom, la période, les colonnes d'heures, les participations terminées avant la fin et la remarque. Les zones Signature et Nom du signataire restent à compléter. Vérifiez le document avant de le signer et de le remettre à la personne.

### event-summary

Enfin, ouvrons Documents pour la Fête de septembre. Le résumé distingue les personnes et les inscriptions. Ici, deux bénévoles occupent trois créneaux confirmés : une personne participe pour la première fois, l'autre est de retour. Deux participations ont une présence enregistrée, dont une terminée avant la fin. Le bilan compte ce départ à part, sans lui attribuer d'heure attestée. Une présence non saisie n'est pas déclarée absente. Nous retrouvons six heures prévues, dont deux attestées, puis le remplissage par poste. Ces repères vous aident à préparer la prochaine édition, sans confondre inscription, présence et durée prévue.
