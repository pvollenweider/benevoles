# Politique de sécurité

## Versions supportées

Seule la dernière version publiée reçoit des correctifs de sécurité.

| Version | Supportée |
|---------|-----------|
| 1.0.x   | ✅ |
| < 1.0   | ❌ |

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
