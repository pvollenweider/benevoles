---
title: benevol.app passe en 2.9 : toutes ses inscriptions en un lien, une page d'inscription plus lisible
date: 2026-11-28
summary: Une page pour toutes les inscriptions, 50 modèles de messages, un créneau à partager seul, des créneaux qui se chevauchent, une frise plus lisible.
version: 2.9.0
---

La 2.9 part de ce que les bénévoles voient : leur page d'inscription, leurs emails, leur agenda. Beaucoup de ces changements viennent de retours d'organisateurs, en particulier d'un trail qui mobilise des dizaines de postes.

## Toutes ses inscriptions en un lien

Un bénévole qui aide à la fête de printemps, puis au marché de Noël, avait un lien par événement. Le bouton **Mes inscriptions** de ses emails ouvre maintenant une seule page avec ses créneaux à venir dans tous vos événements. Il peut y annuler un créneau, et « J'ai perdu mon lien » le lui renvoie par email. Les liens déjà reçus fonctionnent toujours.

Depuis cette page, **Mon calendrier** abonne son agenda à tous ses créneaux confirmés. Si vous déplacez un horaire, son agenda suit tout seul.

→ [Ma page personnelle](/doc/ma-page-personnelle#toutes-tes-inscriptions-aupres-de-l-organisation)
▶ Vidéo : [Retrouver toutes mes inscriptions](/videos/VOLUNTEER_ORG_REGISTRATIONS)
▶ Vidéo : [Ajouter ses créneaux à son calendrier](/videos/VOLUNTEER_CALENDAR)

## 50 modèles de messages

Alerte météo, remplacement urgent, changement de lieu de rendez-vous, « Merci ! » : la bibliothèque propose 50 textes en 11 catégories, avec l'aperçu de l'email. Ajoutez-en un en un clic, puis adaptez-le. Les mentions « [à compléter] » bloquent l'envoi tant qu'elles restent, pour qu'aucun message ne parte à moitié rempli.

→ [Modèles de messages](/doc/ecrire-aux-benevoles#modeles-de-messages)
▶ Vidéo : [La bibliothèque de modèles de messages](/videos/MESSAGE_TEMPLATES)

## Partager un seul créneau

Il manque deux personnes au rangement du dimanche soir. Depuis « Où manque-t-il du monde ? », **Partager ce créneau** donne un lien et un QR code vers ce seul créneau, à poster dans le groupe de discussion de l'association. Ce lien peut accepter des inscriptions même après la fermeture de l'événement.

→ [Partager un créneau dans un groupe de discussion](/doc/ou-manque-t-il-du-monde#partager-un-creneau-dans-un-groupe-de-discussion)
▶ Vidéo : [Où manque-t-il du monde ?](/videos/STAFFING_GAPS)

## Une page d'inscription plus lisible

- **Liste ou frise selon l'écran** : sur un téléphone, la page s'ouvre en liste, où chaque créneau porte la couleur de son poste ; sur un écran large, en frise. Vous pouvez imposer l'une ou l'autre, et le bénévole garde toujours le dernier mot.
- **Lire un créneau sans le choisir** : un lien « Détails » sous chaque créneau de la liste ; dans la frise, une ligne sous le planning décrit le créneau survolé ou touché, même quand sa barre est trop étroite pour être lue.
- **Créneaux regroupés par secteur**, si vous le souhaitez : signaleurs, ravitaillements, chronométrage… Le réglage est désactivé par défaut, et vos secteurs restent invisibles des bénévoles tant que vous ne l'activez pas.

→ [Choisir ses créneaux](/doc/choisir-ses-creneaux#lire-les-details-d-un-creneau-sans-le-choisir)
→ [Regrouper les créneaux par secteur](/doc/gerer-les-postes#regrouper-les-creneaux-par-secteur-sur-la-page-d-inscription)
▶ Vidéo : [Régler ce que voient les bénévoles sur la page d'inscription](/videos/EVENT_SIGNUP_PAGE_SETTINGS)
▶ Vidéo : [Choisir ses créneaux](/videos/VOLUNTEER_CHOOSE_SHIFTS)

## Des créneaux qui se chevauchent

Sur un trail, une même personne peut tenir un poste de signaleur qui déborde sur le début du ravitaillement. Une option de l'événement autorise maintenant deux créneaux aux mêmes heures. Le bénévole confirme son choix au lieu d'être bloqué, et les chevauchements restent signalés dans vos inscriptions.

→ [Créer un événement](/doc/creer-un-evenement)

## Et aussi

- **Convention des bénévoles** : c'est son nom partout, et une organisation peut choisir de ne pas en demander. ▶ [La vidéo](/videos/ORG_TIMEZONE_CHARTER)
- **Une adresse refusée, vous le savez tout de suite** : si l'adresse d'un bénévole attendu dans les trois jours est refusée, vous recevez une alerte avec son prochain créneau et son téléphone. Les refus qui arrivent après l'envoi passent aussi « Adresse à vérifier » dans le quart d'heure.
- **Plannings imprimables** : les journées denses sont découpées en tranches de six heures, et la liste avec téléphones passe en paysage.
- **État du service** : [statut.benevol.app](https://statut.benevol.app), hébergé hors du serveur, vérifie le site toutes les 5 minutes et garde l'historique des incidents.

## Pour les installations auto-hébergées

Sur Kubernetes, une action est requise avant la mise à jour : l'application et les migrations se connectent chacune avec leur propre rôle PostgreSQL. Avec Docker Compose, rien à changer.

→ [Mise à jour depuis 2.8.x](https://github.com/pvollenweider/benevoles/blob/main/docs/deploiement.md#mise-à-jour-depuis-28x)

## Et maintenant ?

Ouvrez votre prochain événement, essayez la nouvelle page d'inscription sur votre téléphone, et dites-nous ce qui vous manque : [contact@benevol.app](mailto:contact@benevol.app). Tout le détail est dans les [Nouveautés](/nouveautes#2.9.0).

benevol.app vous rend service ? [Un avis de quelques minutes sur Capterra](https://reviews.capterra.com/products/new/e8375e2e-c922-446e-b311-504ef3570801?lang=fr) aide d'autres associations à le trouver. Et si vous voulez soutenir le projet, [vous pouvez nous offrir un café](https://buymeacoffee.com/benevol.app). Les deux font connaître benevol.app, agrandissent la communauté et nous aident à améliorer l'outil. L'hébergement, lui, est gratuit aujourd'hui.

À très vite,
L'équipe benevol.app
