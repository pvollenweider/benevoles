# Accessibilité

benevol.app vise le niveau **AA des WCAG 2.2**. Cette page dit ce qui a été vérifié, comment, et ce qui ne l'est pas encore.

Déclaration établie le 30 septembre 2026, sur la base d'une auto-évaluation à la même date.

## Périmètre

La page publique des événements hébergés sur benevol.app et leur formulaire d'inscription, la page personnelle des bénévoles, l'espace des organisateurs, et les pages de documentation. Le contenu écrit par les organisateurs et les services externes (carte OpenStreetMap) n'en font pas partie.

Technologies utilisées : HTML, CSS, JavaScript, WAI-ARIA.

## État

**Partiellement conforme, en auto-évaluation.** La conformité n'a pas été évaluée critère par critère, et aucun audit indépendant n'a été réalisé : nous ne prétendons donc pas à une conformité complète.

## Ce qui est vérifié, et comment

- **Tests automatiques** : axe-core analyse les pages publiques de contenu, la page d'un événement et le formulaire d'inscription, la connexion à l'administration, la liste des événements et les pages Créneaux, Inscriptions, Écrire aux bénévoles et Invitations d'un événement. Une modification n'est fusionnée que si ces tests ne signalent aucun défaut grave ou critique. Ils tournent sur Chromium, en affichage ordinateur et mobile, thèmes clair et sombre pour les pages de contenu, et ne voient qu'une partie des problèmes possibles.
- **Revue de chaque changement d'interface** : chaque modification des écrans passe par une revue d'accessibilité dédiée (structure, noms accessibles, clavier, focus, annonces, contraste, libellés) ; ses remarques bloquantes sont corrigées avant publication.
- **Clavier** : les parcours ci-dessous sont conçus pour être utilisés au clavier seul, avec un lien d'évitement sur les pages de l'administration et de la documentation, et un focus visible. Une vérification manuelle complète et datée de ces parcours reste à faire.

Parcours concernés : découvrir un événement ; choisir ses créneaux ; remplir et envoyer l'inscription ; ouvrir sa page personnelle et annuler un créneau ; accepter une place de liste d'attente ; se connecter à l'administration ; créer un événement, ajouter des créneaux, suivre les inscriptions et écrire aux bénévoles.

## Pas encore vérifié

- Aucun essai complet avec un lecteur d'écran (NVDA, JAWS, VoiceOver) n'a encore été mené sur ces parcours.
- Aucun audit n'a été réalisé par un organisme indépendant.
- Certains écrans ne sont pas encore analysés automatiquement : la page personnelle, la confirmation d'une inscription, l'acceptation d'une place de liste d'attente, et les fenêtres de l'administration.

## Limites connues

- Le **planning** d'une journée est une chronologie horizontale : sur un petit écran, il faut la faire défiler latéralement. Chaque créneau reste un bouton nommé en toutes lettres (poste, heures, places, conditions).
- Le **planning** et les **feuilles** à imprimer sont des pages HTML, pas encore analysées par les tests automatiques. Un PDF enregistré depuis le navigateur n'est balisé pour les lecteurs d'écran que si le navigateur le fait. Les présences s'exportent aussi en CSV.
- Le lien **Voir sur la carte** ouvre OpenStreetMap, un service externe dont nous ne maîtrisons pas l'accessibilité.
- Le contenu écrit par les organisateurs (messages, pages d'information, consignes) dépend de leur rédaction.

## Signaler un problème

Si un élément vous empêche de vous inscrire ou de gérer un événement, écrivez à [contact@benevol.app](mailto:contact@benevol.app) en indiquant la page et ce qui bloque. Nous vous répondons et, si besoin, trouvons une autre façon de vous donner l'information. Si notre réponse ne vous satisfait pas, vous pouvez nous relancer à la même adresse ; il n'existe pas de procédure de recours propre à ce service.
