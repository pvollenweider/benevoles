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
- Ne pas laisser les valeurs par défaut du seed en production (mot de passe `change-me`) : définir `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ORG_ADMIN_EMAIL` et `ORG_ADMIN_PASSWORD` avant `npm run db:seed`

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

## Politique de scripts (en observation)

Une politique de scripts est envoyée en mode observation seulement (`Content-Security-Policy-Report-Only`) : elle ne bloque rien, et aucun rapport n'est envoyé nulle part (ni point de collecte, ni service tiers).

```
script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'
```

Elle signale un script chargé depuis un autre site, un plugin (`<object>`, `<embed>`), une balise `<base>` qui pointe ailleurs et, en production, toute évaluation de texte comme du code (`eval`). Elle ne signale pas un script injecté directement dans la page : sans nonce, `'unsafe-inline'` doit rester. Next.js ne pose son nonce sur ses propres scripts que s'il le trouve dans le `script-src` de la politique imposée (`Content-Security-Policy`), et cette politique est déjà celle du cadre (`frame-ancestors`, posée par le proxy). Le passage en mode imposé réunira donc `frame-ancestors` et un `script-src` avec nonce dans une seule politique, produite par le proxy à chaque requête.

Lire les signalements : ouvrir la console des outils de développement du navigateur sur une page ; chaque refus qui aurait eu lieu y apparaît comme un message « [Report Only] » (Chrome, Edge : « … The policy is report-only, so the violation has been logged »). Pour un parcours automatisé, écouter l'évènement `securitypolicyviolation` du document (Playwright : `page.addInitScript` qui journalise `e.effectiveDirective` et `e.blockedURI`). Relevé sur un build de production (2026-10-17) : aucun signalement sur les pages publiques, la page d'un événement, l'inscription intégrée et la connexion ; un signalement `eval` sur la liste des membres de l'administration : le test de capacité de la bibliothèque de validation zod (`Function("")` dans un `try`), qui continue sans si l'évaluation est refusée ; à faire taire avant le passage en mode imposé (option `jitless` de zod).
