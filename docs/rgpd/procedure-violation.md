# Procédure en cas de violation de données (projet interne)

> **PROJET**, à valider (délais, personnes, canaux) avec une personne qualifiée. Document interne de l'opérateur, pas un engagement contractuel : l'accord de traitement ([projet-accord-traitement.md](projet-accord-traitement.md), article 11) fixe ce qui est dû aux organisations.

## Cadre

- En tant que sous-traitant, l'opérateur informe l'organisation (responsable) **aussi rapidement que possible** (nLPD) et **sans délai injustifié** (RGPD). C'est l'organisation qui évalue la notification à l'autorité et l'information des personnes ([PFPDT, violations de données](https://www.edoeb.admin.ch/en/databreach-4)).
- Pour ses propres traitements (journaux techniques, comptes, sécurité), l'opérateur est responsable et évalue lui-même la notification au PFPDT et, le cas échéant, aux autorités européennes compétentes.

## Rôles

| Rôle | Personne | Remplaçant |
|---|---|---|
| Responsable de l'incident (décide, coordonne) | [à désigner] | [à désigner] |
| Technique (confinement, analyse, preuves) | [à désigner] | [à désigner] |
| Communication aux organisations | [à désigner] | [à désigner] |

**Signalement** : [adresse dédiée, par exemple securite@…, et canal de secours]. Tout signalement, interne ou externe (voir `SECURITY.md`), ouvre une entrée au registre.

## Étapes

1. **Enregistrer** : date et heure de la prise de connaissance, source, première description. Le registre sert de chronologie des décisions pour toute la suite.
2. **Qualifier** : s'agit-il d'une violation (perte de confidentialité, d'intégrité ou de disponibilité de données personnelles) ? Garder la trace même si la réponse est non.
3. **Préserver les preuves**, sans les altérer, en copies datées : journaux du proxy et des conteneurs, événements Sentry, journaux d'activité (`EventLog`, `OrgLog`, export CSV du journal de l'organisation, archive de l'événement), file d'envoi (`NotificationOutbox`), compteurs de limitation (`RateLimit`), dernières exécutions (`JobRun`), état des secrets.
   - Le nettoyage nocturne (02:00 UTC) efface les emails envoyés et les compteurs expirés : au besoin, le suspendre (`kubectl -n benevoles patch cronjob app-cleanup -p '{"spec":{"suspend":true}}'`).
   - Mettre de côté un dump antérieur à l'incident avant sa rotation (30 jours sur le serveur, 90 jours hors site).
   - Les requêtes à jeton personnel (`/my/`, `/leader/`, `/waitlist/`, API publiques à jeton) ne figurent **pas** dans le journal d'accès du proxy (`k8s/ingressroute-tokens.yaml`).
4. **Confiner** : changer les secrets concernés (`k8s/secret.yaml`), bloquer l'accès, corriger ou désactiver la fonction en cause.
   - `AUTH_SECRET` : invalide toutes les sessions d'administration et les liens de désabonnement des nouveautés produit.
   - `CRON_SECRET`, `POSTGRES_PASSWORD` et `DATABASE_URL`, `SMTP_PASSWORD`, `BACKUP_PASSPHRASE`, jeton rclone, clés VAPID.
   - `TOKEN_ENCRYPTION_KEY` : rotation par `TOKEN_ENCRYPTION_KEY_ID` et `TOKEN_ENCRYPTION_PREVIOUS_KEYS`. **Changer la clé n'invalide pas les liens déjà envoyés** : la recherche se fait par l'empreinte SHA-256 (`src/lib/token-vault.ts`), un lien reste valable tant que sa ligne existe. Aucune fonction ne régénère les liens des bénévoles : les invalider demande une intervention en base.
   - La session d'un seul administrateur se coupe en réinitialisant son mot de passe (`sessionVersion`). Retirer un responsable de secteur supprime son lien ; une invitation de membre ne cesse de fonctionner qu'en désactivant le membre.
5. **Évaluer** :
   - organisations touchées et personnes concernées (bénévoles, administrateurs, responsables de secteur) ; outils : export des membres (`/api/admin/members/export`), archive JSON de l'événement (`/api/admin/events/[id]/export/archive`, sans les jetons : `src/lib/data-export.ts`), journal d'activité ;
   - nature, volume et sensibilité des données (champs libres compris) ;
   - probabilité et gravité du risque pour les personnes.
6. **Informer les organisations touchées** dans le délai de l'accord, avec : nature de la violation, catégories et nombre approximatif de personnes et d'enregistrements, conséquences probables, mesures prises ou proposées, contact. Compléter au fur et à mesure.
7. **Coopérer** avec les organisations : informations pour leur propre notification, texte d'information des personnes si elles le décident.
8. **Traitements propres de l'opérateur** : évaluer la notification au PFPDT et, si des personnes dans l'UE sont concernées, aux autorités européennes ; informer les personnes si le risque l'exige.
9. **Clore** : retour d'expérience, actions correctives avec responsable et échéance, mise à jour de l'annexe II des mesures de sécurité.

## Registre des incidents

Tenu par l'opérateur, **y compris pour les incidents non notifiés**. Pour chaque entrée : dates (connaissance, confinement, informations envoyées), faits, données et personnes concernées, évaluation du risque et sa justification, décisions et qui les a prises, notifications faites ou motifs de non-notification, actions correctives.

[Emplacement du registre, accès restreint : à décider.]
