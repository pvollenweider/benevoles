# Politique de sécurité

## Versions supportées

Seule la dernière version publiée reçoit des correctifs de sécurité.

| Version | Supportée |
|---------|-----------|
| 2.4.x   | ✅ |
| 2.3.x   | ❌ |
| 2.2.x   | ❌ |
| 2.1.x   | ❌ |
| 2.0.x   | ❌ |
| < 2.0   | ❌ |

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique** pour les failles de sécurité.

Envoyez un email à **polito@gmail.com** avec :

- Une description de la vulnérabilité
- Les étapes pour la reproduire
- L'impact potentiel
- Si possible, une suggestion de correctif

Vous recevrez un accusé de réception sous 48 h. Une fois la faille confirmée et corrigée, un avis de sécurité sera publié et vous serez crédité (sauf si vous préférez rester anonyme).

## Bonnes pratiques de déploiement

- Ne jamais exposer les variables d'environnement dans les logs ou les réponses HTTP
- Utiliser un `AUTH_SECRET` aléatoire d'au moins 32 caractères (ex. `openssl rand -hex 32`)
- Restreindre l'accès à la base de données au seul pod/container de l'application
- Activer HTTPS en production ; ne pas désactiver la vérification TLS
- Renouveler régulièrement les mots de passe SMTP et les secrets NextAuth
- Définir `CRON_SECRET` : sans lui, les endpoints `/api/cron/*` refusent toutes les requêtes en production
- Ne pas laisser les valeurs par défaut du seed en production (mot de passe `change-me`) : définir `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ORG_ADMIN_EMAIL` et `ORG_ADMIN_PASSWORD` avant `npm run db:seed`

## HTTPS strict (HSTS)

Le service hébergé (benevol.app) répond `Strict-Transport-Security: max-age=31536000` sur chaque hôte (apex, www, sous-domaine de chaque organisation) : un navigateur qui l'a vu passe directement en HTTPS pendant un an, même pour un lien saisi en `http://`. L'en-tête est posé par Traefik (`k8s/middleware-hsts.yaml`), pas par l'application : une instance auto-hébergée choisit sa propre politique HTTPS. Sans `includeSubDomains` (un sous-domaine hors du service n'a pas de certificat valide) ni `preload`.

## Affichage dans un cadre (clickjacking)

Toutes les pages et routes refusent d'être affichées dans le cadre (`<iframe>`) d'un autre site : `Content-Security-Policy: frame-ancestors 'none'` et `X-Frame-Options: DENY`, posés par `src/proxy.ts` (`src/lib/security-headers.ts`). Une seule exception : l'inscription intégrable au site d'une association, `/<événement>?embed=1` et sa confirmation, qui répondent `frame-ancestors *` sans `X-Frame-Options`.

Ce parcours ne contient aucune action destructive en un clic : s'inscrire demande de cocher la convention et le consentement, de remplir le formulaire puis de confirmer, et un retrait demande une confirmation dans une fenêtre. La page n'envoie au site qui l'affiche que sa hauteur (un nombre, `postMessage`), jamais de donnée du bénévole ; l'administration, la page personnelle, l'espace responsable et la connexion ne sont jamais affichables dans un cadre.
