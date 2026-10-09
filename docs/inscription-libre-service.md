# Inscription en libre-service

Une association crée son espace elle-même depuis `/inscription` (#810). Cette page décrit le parcours, ce que l'opérateur voit et fait, et les protections contre les abus. Le parcours côté association est expliqué aux organisateurs dans [guide/creer-son-espace.md](../guide/creer-son-espace.md) (`/doc/creer-son-espace`).

## Parcours

1. **Formulaire** (`/inscription`, `src/components/public/signup/SignupForm.tsx`, `POST /api/public/signup`) : nom de l'association, « Votre association et votre besoin » (20 à 1000 caractères), nom et adresse email de la personne. Règles dans `src/lib/signup.ts`. La réponse est toujours la même (« Vérifiez votre boîte email »), que l'email parte ou non : adresse déjà connue, demande bloquée, envoi trop rapide ou limite atteinte ne se distinguent pas.
2. **Demande** (`SignupRequest`) : enregistrée avec l'empreinte d'un jeton, valable 24 heures (`SIGNUP_LINK_HOURS`). L'email « Confirmez votre adresse pour créer votre espace benevol.app » ne contient que le lien, aucun texte saisi. Aucun email ne part si l'adresse a déjà un compte.
3. **Confirmation** (`/inscription/confirmer?t=…`) : ouvrir le lien ne change rien (les antivirus de messagerie ouvrent les liens) ; le bouton **Confirmer et créer mon espace** (`POST /api/public/signup/confirm`, `confirmSignupRequest` dans `src/lib/signup-server.ts`) crée, une seule fois :
   - l'organisation, **en attente de validation** : `publicationApprovedAt` et `outboundEmailApprovedAt` à `null`, `signupDescription` recopiée de la demande ;
   - son compte propriétaire, **inactif**, avec un lien d'activation valable 7 jours.
4. **Mot de passe** : le navigateur est envoyé directement sur la page d'activation habituelle (`/admin/accept-invite`). Le même lien part aussi par email (« Choisissez votre mot de passe benevol.app », type `signup_account_link`, email de la plateforme sans organisation, sans texte saisi), pour la personne qui fermerait la page.
5. **Alerte** à l'opérateur : « Nouvelle demande d'espace », par ntfy et par email, avec le nom de l'espace et le début de sa description (voir [deploiement.md](deploiement.md#alertes-à-lopérateur)).

## Espace en attente

Tant qu'il n'est pas validé (`src/lib/org-approval.ts`) :

- tout se prépare : événements, postes, créneaux, membres, pages, logo (visible de ses administrateurs et du super admin seulement), aperçu ;
- **pas de publication** : la publication est refusée et les pages publiques de l'espace ne répondent pas (`PUBLIC_ORG_WHERE`) ;
- **pas d'email à des tiers** : seuls ses administrateurs **actifs** reçoivent des emails ; une invitation ou un message à un bénévole ne part pas ;
- un bandeau le dit en haut de l'administration de l'espace.

Les deux autorisations sont séparées pour pouvoir, plus tard, les accorder une à une. Toute autre création d'organisation (super admin, scripts) les accorde d'office.

## Ce que fait l'opérateur

- **Voir les demandes** : un bandeau de l'espace super admin donne le nombre d'espaces en attente ; dans `/super-admin/organizations`, ils portent la mention « en attente de validation ». Un récapitulatif quotidien (« espaces en attente ») arrive tant qu'il en reste, en précisant ceux qui attendent depuis plus de 24 heures.
- **Juger** : la fiche de l'espace (`/super-admin/organizations/<identifiant>`) montre le bloc « Demande d'inscription » (la description saisie, en texte brut, liens non cliquables), ses administrateurs et ses chiffres.
- **Valider l'espace** : accorde la publication et les emails ; chaque administrateur de l'espace reçoit « Votre espace benevol.app est activé ».
- **Refuser et supprimer** : l'espace est supprimé avec ses comptes, sans email.

## Lien d'activation perdu

Si la personne ferme la page avant de choisir son mot de passe, l'email « Choisissez votre mot de passe benevol.app » lui donne le lien (7 jours) ; la page « Demande déjà confirmée » le lui rappelle. « Mot de passe oublié » ne sert pas à un compte inactif. Si le lien a expiré ou si l'email manque, la personne écrit à contact@benevol.app ; sur la fiche de l'espace, **Renvoyer l'invitation** crée un nouveau lien (l'ancien cesse de fonctionner) et l'affiche sous le tableau des administrateurs. L'email d'invitation peut ne pas partir, puisque l'espace en attente n'écrit qu'à ses administrateurs actifs : transmettre alors le lien affiché.

## Protections contre les abus

Pas de CAPTCHA (accessibilité, vie privée). À la place :

- un champ piège invisible et une durée minimale de remplissage (3 secondes) : une soumission automatique reçoit la réponse habituelle et rien n'est enregistré ;
- 5 demandes par heure et par adresse IP ;
- les plafonds d'envoi d'emails (`src/lib/notifications/send-limits.ts`) : par destinataire pour les emails déclenchés depuis une page publique, et 60 emails de confirmation par heure pour toute la plateforme (`EMAIL_LIMIT_SIGNUP_PER_HOUR`) ;
- les noms saisis refusent liens, adresses et retours à la ligne, et l'email de confirmation ne reprend aucun texte saisi : il ne peut pas servir à faire passer un message ;
- la **liste de blocage** (`/super-admin/blocklist`) : une adresse email, un domaine (confirmation demandée pour un fournisseur courant) ou une adresse IP (toujours pour une durée limitée, conservée sous forme d'empreinte), avec une raison. Une demande bloquée reçoit la réponse habituelle et rien n'est enregistré ; un blocage posé entre la demande et la confirmation vaut aussi ;
- la **suspension** d'une organisation pour abus, depuis sa fiche (`src/lib/org-suspension.ts`) : ses administrateurs ne se connectent plus, ses pages publiques ne répondent plus et ses emails en attente sont annulés ; ses données sont conservées.

## Fermer l'inscription

`SIGNUP=off` ferme l'inscription : la page affiche « Les inscriptions sont fermées pour le moment » avec l'adresse contact@benevol.app, et l'API répond 403. `deploy.yml` ne transmet pas cette variable au secret Kubernetes : en production, un secret GitHub `SIGNUP` seul n'a aucun effet. Pour fermer rapidement sans changer le workflow :

```bash
kubectl -n benevoles set env deployment/benevoles-app SIGNUP=off
# rouvrir
kubectl -n benevoles set env deployment/benevoles-app SIGNUP-
```

`set env` redémarre le pod. La variable ajoutée ainsi ne figure pas dans `k8s/deployment.yaml` : un déploiement suivant (`kubectl apply`) la laisse en place, l'inscription reste fermée jusqu'à `SIGNUP-`.

## Conservation

Une demande (confirmée ou non) est effacée 7 jours après sa création par le nettoyage quotidien. La description reste ensuite sur la fiche de l'espace, pour l'opérateur, et suit les règles de l'organisation (voir [retention.md](retention.md)).
