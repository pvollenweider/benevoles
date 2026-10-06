# Recevoir ses rappels sur son téléphone

Vidéo autonome **33** — identifiant `VOLUNTEER_PHONE_NOTIFICATIONS`.
Voix **Kore**, une génération continue, souriante, chaleureuse et patiente ; aucune balise de pause prononcée.

**État : préparation éditoriale, non capturée.** Aucun abonnement, envoi, appareil ou résultat de réception n'est validé par ce document. Le manifeste ne rend pas le recorder prêt. Une livraison reste bloquée tant que les démonstrations ci-dessous manquent.

## Référence produit et périmètre

Relecture des sources de `origin/main`, commit `fcea46ccaf5f830988ccbb60a3f4634ddb0b1cb5`, le 6 octobre 2026 :

- `GUIDE_BENEVOLE.md`, index des guides ;
- `guide/ma-page-personnelle.md` et `guide/rappels.md`, lus intégralement ;
- `src/components/PushSubscribeButton.tsx`, `src/lib/push-availability.ts`, `src/app/api/public/push/route.ts`, `src/lib/push.ts` et `public/sw.js` ;
- le brief existant `videos/scripts/volunteer-push-notifications.md`, qui exige déjà la réception réelle.

Ce commit est une référence de rédaction, **pas une preuve de capture**. Avant tournage : vérifier le dernier commit distant, construire une copie propre et attester le serveur réellement filmé. Revoir notamment le composant push si `main` évolue.

Le site n'offre pas actuellement de bouton bénévole « Désactiver » dans ce composant. Ne pas en inventer un. La désactivation utilisateur montrée se fait dans les autorisations du navigateur ; la route technique `DELETE` n'est pas un parcours à enseigner à un bénévole.

## Utilité

Recevoir sur son appareil les rappels de ses créneaux confirmés et certains messages urgents, en complément des emails. Comprendre que le choix appartient au bénévole, que l'appareil et le navigateur comptent, et que désactiver les notifications ne retire aucune inscription.

## Jeu de données et conditions réelles

- Organisation et bénévole fictifs dédiés ; adresse `example.org`, inscription active, événement publié et créneau confirmé.
- Deux créneaux confirmés le même jour et un autre jour, plus une demande sur validation et une inscription en attente : rendre visibles les différences sans les annoncer comme confirmées.
- Lien personnel réellement valide, limité à cette fixture. Ne pas écrire son jeton, un endpoint push ou les clés d'abonnement dans les rapports, transcripts publics ou noms de fichiers.
- Serveur isolé avec clés VAPID de démonstration, jamais de production ; boîte SMTP de démonstration pour observer séparément les emails.
- Vrai appareil/profil navigateur dédié, sans compte ni notifications personnelles. HTTPS pour un appareil distant ; une origine locale acceptée par le navigateur convient seulement à un test local. Consigner la valeur réelle de `isSecureContext`, la présence des API et les versions testées.
- Sur un téléphone, vérifier les conditions de ce téléphone et de son navigateur au moment du tournage. Ne pas extrapoler depuis Chromium desktop, ni promettre une liste de compatibilité non vérifiée.
- Profils séparés pour autorisation initiale, refus et retrait. Aucun `grantPermissions`, mock de `Notification.requestPermission`, faux `PushSubscription` ou service worker de remplacement dans une prise présentée comme réelle.
- Les fenêtres système de permission et les notifications exigent une capture native de l'appareil concerné. Une carte HTML, une capture Mailpit, un compteur serveur ou un succès du fournisseur push ne remplace jamais la réception système.

## Démonstration et résultat visible

Chaque chapitre du manifeste a un écran préparé avant la parole. Utiliser les durées audio réelles, puis horodater les résultats. Pas de navigation accélérée pendant une explication.

| Chapitre | Manipulation complète | Résultat à montrer et preuve nécessaire |
|---|---|---|
| `welcome` | Ouvrir la page personnelle de la bénévole fictive | Créneaux et identité fictive cohérents ; contexte annoncé comme démonstration |
| `conditions` | Montrer l'appareil et le navigateur réellement utilisés | Étiquette système/navigateur, contexte sécurisé et disponibilité constatée ; aucune promesse tous téléphones |
| `personal-link` | Trouver « Recevoir des rappels push » sur la page personnelle | Bouton réel ; montrer aussi son emplacement sur une confirmation issue d'une invitation valide, sans remplacer ce parcours par une URL fabriquée |
| `permission` | Cliquer et répondre à la vraie demande du navigateur | Demande native et choix réellement effectués ; conserver les repères des clics sans données saisies |
| `active` | Attendre l'issue, puis recharger et revenir | « Rappels push activés » ; abonnement réellement rattaché au bon bénévole, vérifié par comptage/identifiant fixture sans divulguer l'endpoint ; ne pas confondre cet état avec réception |
| `reminders` | Déclencher séparément les échéances de démonstration autorisées J-2, J-1 et jour J | Notifications réellement visibles sur l'appareil et emails Mailpit ; un rappel regroupé pour deux créneaux de la même journée ; aucun rappel pour demande/attente ; conserver la preuve des réglages de rappel actifs |
| `delivery` | Envoyer un message ciblé fictif avec option notification, puis ouvrir la notification reçue | Vraie notification système, email complet et arrivée sur la page pertinente ; horodatages envoi/réception/clic. Un fournisseur disant « envoyé » ne prouve pas la livraison à l'écran |
| `blocked` | Dans un profil vierge distinct, refuser la permission | « Notifications bloquées dans les paramètres du navigateur. » ; inscription intacte. Un échec réseau/configuration n'est montré que s'il est produit dans une instance isolée, sans fake de permission |
| `disable` | Retirer la permission via les vrais réglages du navigateur filmé | Autorisation effectivement retirée, retour au site et créneaux inchangés ; ne pas imposer un texte de site que le produit n'affiche pas et ne pas prétendre que la DB est instantanément purgée |
| `result` | Revenir au planning et au récapitulatif email de démonstration | Même inscription, canal email indépendant et moyen de retrouver le lien ; conclusion autonome |

La narration `delivery` décrit le fonctionnement sans prétendre que la réception a déjà été vérifiée. **Cela n'autorise pas à omettre la réception filmée** : si elle n'est pas disponible, le module reste incomplet et non livrable. Aucun montage d'une notification étrangère ou d'un autre appareil ne doit être associé à cet abonnement.

## Points d'attention

- Le bouton peut être absent si le navigateur n'offre pas les API nécessaires ou si le serveur n'a pas de clé VAPID. Après une activation réussie, le composant affiche un statut plutôt qu'un bouton de désactivation.
- Le texte « Rappels push activés » dépend de l'acceptation de l'abonnement par le serveur. Une permission navigateur seule n'est pas suffisante.
- L'abonnement appartient au navigateur/appareil ; la page relie un abonnement déjà existant à la bénévole qui ouvre son lien. Utiliser un profil dédié, jamais un appareil partagé avec des comptes réels.
- Les rappels automatiques dépendent du statut confirmé, de la publication de l'événement et des réglages de l'organisation/événement. L'activation push ne réactive pas des rappels désactivés.
- Les emails de rappel ne sont pas un « secours » lancé uniquement en cas d'échec push : ce sont des envois séparés. Pour un message ciblé envoyé avec notification, le message complet est également envoyé par email ; ne pas généraliser cette phrase à tout type de notification.
- L'autorisation peut être refusée ou retirée. Montrer les réglages du navigateur effectivement filmé, sans imposer ce chemin aux autres systèmes. Ne pas prétendre supprimer immédiatement tous les abonnements serveur ; le serveur nettoie les abonnements expirés selon les réponses 404/410 de son fournisseur.
- Ne pas promettre un rappel reçu à chaque instant : réseau, appareil et permissions ont leurs propres contraintes. La page personnelle reste la référence.

## Critères de livraison bloquants

1. Chaque fonctionnalité ci-dessus possède **utilité, manipulation entière, résultat visible et limites**, avec un passage horodaté dans le MP4 final.
2. Activation et refus capturés nativement, sans autorisation préaccordée présentée comme action humaine.
3. Au moins les trois échéances et un message urgent sont réellement reçus sur le dispositif dédié ; le clic d'une notification ouvre le bon lien. Vérifier le regroupement et la distinction email/push.
4. Retrait de permission réel et inscription inchangée démontrés. Ne pas confondre blocage, absence de support, échec d'activation et désinscription.
5. Preuve produit par prise : commit, empreinte des sources, `BUILD_ID`, locale française, scénario et appareil ; jamais attribuée rétroactivement.
6. Musique Mixkit discrète, sons sur les clics/frappes réellement enregistrés, voix Kore constante et auditable, pas de mots parasites comme « short pause ».
7. Revue du MP4 complet : paroles, écrans, sous-titres, état enregistré et notifications correspondent. Les fenêtres système sont réellement lisibles et les données exclusivement fictives.
8. Si un seul résultat requis manque, indiquer « à produire / non vérifié » dans le suivi interne et conserver le module non capturable/non livré ; aucune couverture complète n'est annoncée.

## Préparation restant à réaliser

Créer la fixture dédiée, configurer le profil/appareil et le serveur actuel, implémenter le recorder natif et les vérifications sans exposer de jetons, puis intégrer l'identifiant au catalogue et à la matrice documentaire. Ce document et le manifeste seuls ne constituent ni un recorder, ni une prise, ni une validation.
