# Double authentification du super admin

Le super admin a accès à toutes les organisations. Depuis le constat F6 du test d'intrusion de l'authentification, son compte demande, en plus du mot de passe, un code à 6 chiffres d'une application d'authentification (TOTP, RFC 6238). Cette page s'adresse à l'opérateur du serveur : fonctionnement, première connexion, codes de secours et réinitialisation d'urgence.

Les comptes des organisations (propriétaires, organisateurs) ne sont pas concernés.

## Fonctionnement

- Après le mot de passe, la session du super admin est « en attente » : toute page de `/admin` ou `/super-admin` mène à `/admin/two-factor`, et les API d'administration répondent 401 (`SECOND_FACTOR_REQUIRED`). Le contrôle est fait sur le serveur pour chaque route et chaque page, pas seulement par la redirection du proxy.
- Un code valide complète la session. Il reste valable 12 heures ; ensuite le code est demandé à nouveau, même si la session continue.
- Codes acceptés : celui de la période de 30 secondes en cours, la précédente et la suivante (une horloge de téléphone décalée de 30 secondes passe). Un code déjà accepté, ou plus ancien, est toujours refusé.
- Limite : 5 codes faux par compte et 20 par adresse IP sur 15 minutes, codes de secours compris. Au-delà, la réponse est 429 pendant le reste de la fenêtre. Si le compteur ne peut pas être lu, la tentative est refusée.
- Le secret de l'application est chiffré en base (AES-256-GCM avec `TOKEN_ENCRYPTION_KEY`, colonnes `AdminUser.totpSecretEnc` et `totpPendingSecretEnc`). Il est repris par la rotation de clé comme les liens personnels (voir [Rotation de la clé de chiffrement](configuration.md#rotation-de-la-clé-de-chiffrement)). Les codes de secours ne sont conservés que sous forme d'empreinte SHA-256 (`AdminRecoveryCode`).
- Sans `TOKEN_ENCRYPTION_KEY`, la double authentification ne peut pas être activée et le super admin ne peut donc pas se connecter : la page l'indique. La clé est déjà obligatoire en production ; en développement, `make dev-setup` et `make e2e-setup` en génèrent une.
- Chaque activation, utilisation d'un code de secours, création de nouveaux codes et réinitialisation envoie une alerte à l'opérateur (ntfy et email, voir `OPERATOR_ALERT_EMAIL`), sans donnée personnelle. Une alerte que vous n'attendiez pas veut dire que quelqu'un d'autre connaît le mot de passe : réinitialisez la double authentification (ci-dessous) et changez le mot de passe.

## Première connexion

Un super admin qui n'a pas encore de second facteur l'active à sa prochaine connexion, sans être bloqué :

1. Se connecter avec le mot de passe sur `/admin/login`.
2. La page « Activez la double authentification » affiche un code QR et la même clé en texte. L'ajouter dans une application d'authentification (Aegis, Google Authenticator, Microsoft Authenticator, ou un gestionnaire de mots de passe qui produit ces codes).
3. Saisir le code affiché par l'application, puis « Activer ».
4. Noter les dix codes de secours (copie ou fichier texte) : ils ne sont affichés qu'une fois.

Le code QR proposé reste le même pendant 24 heures, même après une nouvelle connexion : une entrée déjà ajoutée dans l'application continue de fonctionner. L'activation demande un mot de passe saisi moins d'une heure avant ; au-delà, la page demande de se reconnecter.

Risque connu de cette mise en place : tant que le second facteur n'est pas activé, la personne qui connaît le mot de passe et se connecte la première l'active. L'alerte « Double authentification activée » le signale.

## Codes de secours

- Dix codes de 16 caractères, chacun utilisable une fois, sur la page de connexion (« Utiliser un code de secours »). Majuscules, minuscules, espaces et tirets sont acceptés.
- `/super-admin/profile` affiche le nombre de codes restants et en crée dix nouveaux avec un code de l'application ; les anciens cessent alors de fonctionner.

## Réinitialisation d'urgence

Pour un téléphone perdu sans code de secours. Il faut un accès à la base de données, qui donne déjà tous les droits sur la plateforme : réservé à l'opérateur.

Le script, depuis un checkout du dépôt, avec un accès local à la base (par exemple `kubectl -n benevoles port-forward deploy/postgres 5432:5432` dans un autre terminal, ou l'accès ponctuel décrit dans [Déploiement](deploiement.md#accès-ponctuel-à-la-base)) :

```bash
# Vérifier d'abord, sans rien changer :
DATABASE_URL=… npx tsx scripts/reset-two-factor.ts operateur@example.org
# Réinitialiser :
DATABASE_URL=… npx tsx scripts/reset-two-factor.ts operateur@example.org --yes
```

En une transaction, le script efface le secret, l'activation en cours, le dernier code utilisé et tous les codes de secours, et termine les sessions du compte (`sessionVersion` + 1). Il refuse un compte qui n'est pas super admin. La connexion suivante demande d'activer à nouveau la double authentification. Le script n'a pas besoin de `TOKEN_ENCRYPTION_KEY`.

Sans Node, la même chose en SQL (`psql`), en remplaçant l'adresse :

```sql
BEGIN;
DELETE FROM "AdminRecoveryCode" WHERE "adminUserId" = (SELECT id FROM "AdminUser" WHERE lower(email) = lower('operateur@example.org') AND role = 'super_admin');
UPDATE "AdminUser" SET "totpSecretEnc" = NULL, "totpPendingSecretEnc" = NULL, "totpEnabledAt" = NULL, "totpLastUsedStep" = NULL, "sessionVersion" = "sessionVersion" + 1
  WHERE lower(email) = lower('operateur@example.org') AND role = 'super_admin';
COMMIT;
```

La version SQL n'envoie pas d'alerte. Après une réinitialisation faite parce que le mot de passe a pu fuiter, changer aussi le mot de passe (`/admin/forgot-password` ou `/super-admin/profile`).

## Tests de bout en bout

Les specs Playwright qui se connectent en super admin passent le second facteur avec `e2e/helpers/super-admin.ts`. Le code vient de `scripts/e2e-super-admin-totp.ts`, qui active le compte du seed au premier usage et ne tourne que sur une base locale dont le nom finit par `_e2e`. `e2e/super-admin-two-factor.spec.ts` teste le parcours lui-même (activation, rejeu refusé, codes de secours, API fermées avant le second facteur).
