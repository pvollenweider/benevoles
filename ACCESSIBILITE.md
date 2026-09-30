# Accessibilité

benevol.app vise le niveau **AA des WCAG 2.2**. Cette page dit ce qui a été vérifié, comment, et ce qui ne l'est pas encore.

Déclaration établie le 30 septembre 2026, sur la base d'une auto-évaluation à la même date.

## Périmètre

La page publique des événements hébergés sur benevol.app et leur formulaire d'inscription, la page personnelle des bénévoles et celle des responsables de secteur, l'espace des organisateurs, et les pages de documentation. Le contenu écrit par les organisateurs et les services externes (carte OpenStreetMap) n'en font pas partie.

Technologies utilisées : HTML, CSS, JavaScript, WAI-ARIA.

## État

**Partiellement conforme, en auto-évaluation.** La conformité n'a pas été évaluée critère par critère, et aucun audit indépendant n'a été réalisé : nous ne prétendons donc pas à une conformité complète.

## Ce qui est vérifié, et comment

- **Tests automatiques** : l'outil axe-core (règles WCAG 2.0 à 2.2, niveaux A et AA) analyse les pages de contenu (présentation des fonctionnalités, index de la documentation, guide du bénévole, cette page, politique de confidentialité), la page d'un événement et son formulaire d'inscription, la connexion à l'administration, la liste des événements, la page d'un événement dans l'administration et ses pages Créneaux, Inscriptions, Écrire aux bénévoles et Invitations. Ils tournent sur Chromium en affichage ordinateur ; cette page et l'index de la documentation sont aussi analysés à 320 pixels de large, en thème sombre. Les contrôles automatiques d'une modification échouent si ces tests signalent un défaut grave ou critique. Ils ne voient qu'une partie des problèmes possibles.
- **Revue de chaque changement d'interface** : chaque modification des écrans passe par une revue d'accessibilité dédiée (structure, noms accessibles, clavier, focus, annonces, contraste, libellés) ; ses remarques bloquantes sont corrigées avant publication.
- **Clavier** : les parcours ci-dessous sont conçus pour être utilisés au clavier seul, avec un lien d'évitement sur les pages de l'administration et de la documentation, et un focus visible. Une vérification manuelle complète et datée de ces parcours reste à faire.

Parcours concernés : découvrir un événement ; choisir ses créneaux ; remplir et envoyer l'inscription ; ouvrir sa page personnelle, annuler un créneau, quitter une liste d'attente ou retirer une demande ; accepter une place de liste d'attente ; se connecter à l'administration ; créer un événement, ajouter des créneaux, suivre les inscriptions et écrire aux bénévoles.

## Pas encore vérifié

- Aucun essai complet avec un lecteur d'écran (NVDA, JAWS, VoiceOver) n'a encore été mené sur ces parcours.
- Aucun audit n'a été réalisé par un organisme indépendant.
- Certains écrans ne sont pas encore analysés automatiquement : la page d'accueil d'une organisation, la page personnelle, la page du responsable de secteur, la confirmation d'une inscription, l'acceptation d'une place de liste d'attente, le guide de l'organisateur et les conditions d'utilisation ; dans l'administration, le tableau de bord, les membres, les réglages, le journal, les pages de suivi d'un événement (« Où manque-t-il du monde ? », vérification avant publication), l'espace de l'opérateur et les fenêtres.
- Le formulaire d'inscription, surtout utilisé sur téléphone, n'est analysé qu'en affichage ordinateur.

## Limites connues

- Sur la **page personnelle**, la demande de confirmation d'une annulation ne reçoit pas le focus quand elle s'ouvre, et le focus se perd quand on la referme ou après l'annulation : un lecteur d'écran ne l'annonce pas, et la touche Échap ne la ferme pas. En cas d'erreur, un message « Ce lien ne fonctionne pas » remplace toute la page, alors que le lien reste valable. Le bouton d'annulation et le bouton de confirmation n'atteignent pas le contraste minimum.
- Sur le **planning public**, un créneau auquel on est déjà inscrit n'est pas distingué : il a l'apparence d'un créneau libre, n'est pas sélectionnable, et un lecteur d'écran l'annonce comme un créneau à sélectionner.
- Dans l'**administration**, les dates et les compteurs du journal d'un événement ont un contraste insuffisant, comme le message qui confirme l'enregistrement d'un événement.
- Le **planning** d'une journée est une chronologie horizontale : sur un petit écran, il faut la faire défiler latéralement. Chaque créneau reste un bouton nommé en toutes lettres (poste, heures, places, conditions).
- Le **planning**, les **feuilles** et les **badges** à imprimer sont des pages HTML, pas encore analysées par les tests automatiques. Un PDF enregistré depuis le navigateur n'est balisé pour les lecteurs d'écran que si le navigateur le fait. Les présences s'exportent aussi en CSV.
- Le lien **Voir sur la carte** ouvre OpenStreetMap, un service externe dont nous ne maîtrisons pas l'accessibilité.
- Le contenu écrit par les organisateurs (messages, pages d'information, consignes) dépend de leur rédaction.

## Signaler un problème

Si un élément vous empêche de vous inscrire ou de gérer un événement, écrivez à [contact@benevol.app](mailto:contact@benevol.app) en indiquant la page et ce qui bloque. Nous vous répondons et, si besoin, trouvons une autre façon de vous donner l'information. Si notre réponse ne vous satisfait pas, vous pouvez nous relancer à la même adresse ; il n'existe pas de procédure de recours propre à ce service.
