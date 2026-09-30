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
3. **Préserver les preuves** : journaux (proxy, conteneurs, base), événements Sentry, état des secrets, sans les altérer ; copies datées.
4. **Confiner** : révoquer les secrets ou jetons concernés (clé de chiffrement des liens, clés VAPID, mots de passe, jetons rclone), bloquer l'accès, corriger ou désactiver la fonction en cause.
5. **Évaluer** :
   - organisations touchées et personnes concernées (bénévoles, administrateurs, responsables de secteur) ;
   - nature, volume et sensibilité des données (champs libres compris) ;
   - probabilité et gravité du risque pour les personnes.
6. **Informer les organisations touchées** dans le délai de l'accord, avec : nature de la violation, catégories et nombre approximatif de personnes et d'enregistrements, conséquences probables, mesures prises ou proposées, contact. Compléter au fur et à mesure.
7. **Coopérer** avec les organisations : informations pour leur propre notification, texte d'information des personnes si elles le décident.
8. **Traitements propres de l'opérateur** : évaluer la notification au PFPDT et, si des personnes dans l'UE sont concernées, aux autorités européennes ; informer les personnes si le risque l'exige.
9. **Clore** : retour d'expérience, actions correctives avec responsable et échéance, mise à jour de l'annexe II des mesures de sécurité.

## Registre des incidents

Tenu par l'opérateur, **y compris pour les incidents non notifiés**. Pour chaque entrée : dates (connaissance, confinement, informations envoyées), faits, données et personnes concernées, évaluation du risque et sa justification, décisions et qui les a prises, notifications faites ou motifs de non-notification, actions correctives.

[Emplacement du registre, accès restreint : à décider.]
