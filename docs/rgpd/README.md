# Dossier RGPD et nLPD (projet)

Travail de l'issue #485. **Rien ici n'est publié, n'a de valeur contractuelle ni ne constitue un avis juridique ou une attestation de conformité.** Le dossier part du comportement réel du code et distingue ce qui est implémenté, configuré en production, garanti par contrat, ou à décider ; tout ce qui dépend de la production ou d'un contrat est marqué « à confirmer ».

| Document | Contenu |
|---|---|
| [inventaire.md](inventaire.md) | données traitées, rôles, journaux, hébergement, droits des personnes, établis depuis le code avec leur source |
| [sous-traitants.md](sous-traitants.md) | sous-traitants ultérieurs et ce qu'il reste à prouver pour chacun ; services techniques hors liste |
| [projet-accord-traitement.md](projet-accord-traitement.md) | trame d'accord art. 28 (sur la base recommandée des clauses types de la Commission), annexes versionnées |
| [procedure-violation.md](procedure-violation.md) | procédure interne en cas de violation, registre des incidents |
| [verifications-production.md](verifications-production.md) | checklist des vérifications de production et des contrats |
| [ecarts.md](ecarts.md) | écarts avec la politique de confidentialité publiée |

Les durées de conservation viennent de [../retention.md](../retention.md), généré depuis `src/lib/retention.ts` et vérifié par les tests (#486).

## Évolutions du produit nécessaires

- **Effacement ou anonymisation individuelle d'un bénévole** : #516. Aujourd'hui, « supprimer » un membre le désactive seulement.
- Sans ticket pour l'instant, à décider :
  - procédure écrite d'une demande d'effacement exécutée à la main, et registre des demandes ;
  - rejeu des effacements après une restauration de sauvegarde ;
  - installation de la rotation des journaux dans le dépôt plutôt qu'une procédure manuelle ;
  - durée de vie des liens personnels en clair dans les emails en file d'envoi (`NotificationOutbox`).

## Conclusion

| Statut | Éléments |
|---|---|
| **Publiable** en l'état | rien de ce dossier ; seule la matrice de conservation ([../retention.md](../retention.md)) est déjà publique, pour les traitements internes |
| **À valider juridiquement** | répartition des rôles, qualification des services push, accord de traitement et ses annexes, délai de notification des violations, procédure de violation, texte de la politique publique |
| **À vérifier en production et dans les contrats** | tout [verifications-production.md](verifications-production.md) : hébergeur, SMTP, Dropbox, Sentry, rotation des journaux, clé des sauvegardes, accès |
| **Évolution du produit** | effacement individuel (#516) et les points de la section précédente |
