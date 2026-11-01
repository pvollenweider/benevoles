# Politique de sécurité

## Versions supportées

Seule la dernière version publiée reçoit des correctifs de sécurité.

| Version | Supportée |
|---------|-----------|
| 2.5.x   | ✅ |
| 2.4.x   | ❌ |
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
- Ne pas laisser les valeurs par défaut du seed en production (mot de passe `change-me`) : définir `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ORG_ADMIN_EMAIL` et `ORG_ADMIN_PASSWORD` avant `npm run db:seed`, lancé avec `NODE_ENV=production` : le seed refuse alors un mot de passe absent ou qui ne respecte pas les règles

## HTTPS strict (HSTS)

Le service hébergé (benevol.app) répond `Strict-Transport-Security: max-age=31536000` sur chaque hôte (apex, www, sous-domaine de chaque organisation) : un navigateur qui l'a vu passe directement en HTTPS pendant un an, même pour un lien saisi en `http://`. L'en-tête est posé par Traefik (`k8s/middleware-hsts.yaml`), pas par l'application : une instance auto-hébergée choisit sa propre politique HTTPS. Sans `includeSubDomains` (un sous-domaine hors du service n'a pas de certificat valide) ni `preload`.

## Affichage dans un cadre (clickjacking)

Toutes les pages et routes refusent d'être affichées dans le cadre (`<iframe>`) d'un autre site : `Content-Security-Policy: frame-ancestors 'none'` et `X-Frame-Options: DENY`, posés par `src/proxy.ts` (`src/lib/security-headers.ts`). Une seule exception : l'inscription intégrable au site d'une association, `/<événement>?embed=1` et sa confirmation, qui répondent `frame-ancestors *` sans `X-Frame-Options`.

Ce parcours ne contient aucune action destructive en un clic : s'inscrire demande de cocher la convention et le consentement, de remplir le formulaire puis de confirmer, et un retrait demande une confirmation dans une fenêtre. La page n'envoie au site qui l'affiche que sa hauteur (un nombre, `postMessage`), jamais de donnée du bénévole ; l'administration, la page personnelle, l'espace responsable et la connexion ne sont jamais affichables dans un cadre.

## Autres en-têtes de sécurité

Posés sur chaque réponse par `next.config.ts` (`src/lib/security-headers.ts`) :

- `X-Content-Type-Options: nosniff` : le navigateur prend chaque réponse pour le type qu'elle déclare, sans deviner d'après son contenu ; un fichier ne peut pas être exécuté comme un script ou une feuille de style s'il n'en est pas un. Toutes les routes de l'application déclarent leur type.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` : coupe les fonctions de l'appareil dont l'application ne se sert jamais. Le presse-papiers (copier un lien), le partage, le plein écran et l'image dans l'image des vidéos, la lecture automatique et les notifications ne sont pas restreints.
- `Referrer-Policy: strict-origin` (#485) : un lien personnel ne part jamais dans l'en-tête `Referer`.

## Politique de scripts

Chaque page reçoit une politique de scripts imposée (`Content-Security-Policy`), produite par `src/proxy.ts` à chaque requête (`src/lib/security-headers.ts`), dans le même en-tête que le cadre :

```
frame-ancestors 'none'; script-src 'self' 'nonce-<aléatoire>' 'strict-dynamic' 'sha256-…' 'sha256-…' 'sha256-…'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'
```

- Un nonce aléatoire (128 bits) par réponse : Next.js le lit dans la politique et le pose sur ses propres scripts, qui chargent ensuite le reste de l'application (`'strict-dynamic'`). Toutes les pages sont rendues à la requête, donc toutes reçoivent leur nonce.
- Les scripts en ligne de l'application sont des constantes, autorisées par leur empreinte sha256 (`src/lib/inline-scripts.ts`) : la correction des adresses à double barre oblique, le thème des pages de contenu, le bouton « Imprimer » des pages d'impression.
- Refusés : tout autre script en ligne, tout attribut d'événement (`onclick=…`), les liens `javascript:`, les scripts d'un autre site, l'évaluation de texte comme du code (`eval`, sauf en développement, où React en a besoin), les plugins (`<object>`, `<embed>`), une balise `<base>` qui pointe ailleurs, un formulaire envoyé à un autre site.
- Non restreints : styles, images, médias, polices, connexions.

L'inscription intégrable reçoit la même politique, avec `frame-ancestors *`. Aucun rapport n'est envoyé nulle part : un refus apparaît dans la console des outils de développement du navigateur, et un parcours automatisé peut écouter l'évènement `securitypolicyviolation` du document (`e2e/script-policy.spec.ts`).
