# VOLUNTEER_HOURS_CERTIFICATE — heures, attestations et bilan

Identifiant : `VOLUNTEER_HOURS_CERTIFICATE`.
Slug : `volunteer-hours-certificate`.
Source de narration : `videos/manifests/volunteer-hours-certificate.json`.
Voix Kore, vouvoiement, ton souriant, patient et bienveillant. Aucune balise de
pause à prononcer, aucune promesse de mesure chronométrée.

Les huit chapitres expliquent l'utilité, montrent les gestes réels et vérifient
leur résultat : liste des membres, dernière participation et tris, chronologie, deux exports de période, réglages
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
