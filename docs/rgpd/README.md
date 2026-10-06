# Dossier RGPD et nLPD (projet)

Travail de l'issue #485. **Les documents de ce dossier ne sont pas publiés, n'ont pas de valeur contractuelle et ne constituent ni un avis juridique ni une attestation de conformité.** Seuls l'accord de sous-traitance et la liste des sous-traitants sont publiés, depuis la racine du dépôt (décision du 2026-10-06 ci-dessous). Le dossier part du comportement réel du code et distingue ce qui est implémenté, configuré en production, garanti par contrat, ou à décider ; tout ce qui dépend de la production ou d'un contrat est marqué « à confirmer ».

| Document | Contenu |
|---|---|
| [inventaire.md](inventaire.md) | données traitées, rôles, journaux, hébergement, droits des personnes, établis depuis le code avec leur source |
| [sous-traitants.md](sous-traitants.md) | sous-traitants ultérieurs et ce qu'il reste à prouver pour chacun ; services techniques hors liste |
| [ACCORD-SOUS-TRAITANCE.md](../../ACCORD-SOUS-TRAITANCE.md) | accord de sous-traitance art. 28 RGPD / art. 9 nLPD et ses annexes, **publié** sur `/legal/sous-traitance` (version du 6 octobre 2026, révisable) |
| [SOUS-TRAITANTS.md](../../SOUS-TRAITANTS.md) | liste publique des sous-traitants (annexe III de l'accord), **publiée** sur `/legal/sous-traitants` ; ses faits viennent de [sous-traitants.md](sous-traitants.md), vérifié par un test |
| [convention-benevoles-variantes-brouillon.md](convention-benevoles-variantes-brouillon.md) | brouillon des variantes par pays de la convention de bénévolat (#569) — **brouillon à relire** |
| [prompt-relecture-juridique.md](prompt-relecture-juridique.md) | prompt de relecture juridique combiné (#485 et #569), pour une personne qualifiée ou une IA juridique spécialisée |
| [procedure-violation.md](procedure-violation.md) | procédure interne en cas de violation, registre des incidents |
| [procedure-effacement.md](procedure-effacement.md) | demande d'effacement d'un bénévole, registre des effacements et rejeu après une restauration |
| [verifications-production.md](verifications-production.md) | checklist des vérifications de production et des contrats |
| [ecarts.md](ecarts.md) | écarts avec la politique de confidentialité publiée |

Les durées de conservation viennent de [../retention.md](../retention.md), généré depuis `src/lib/retention.ts` et vérifié par les tests (#486).

## Décision de l'opérateur (2026-10-06)

L'accord de sous-traitance et la liste des sous-traitants sont publiés sans attendre la relecture juridique (« on modifiera au besoin plus tard ») : sources [ACCORD-SOUS-TRAITANCE.md](../../ACCORD-SOUS-TRAITANCE.md) et [SOUS-TRAITANTS.md](../../SOUS-TRAITANTS.md), pages `/legal/sous-traitance` et `/legal/sous-traitants`. Les choix faits pour publier, à confirmer à la relecture : information 30 jours avant un changement de sous-traitant ; notification des violations « sans délai injustifié, aussi rapidement que possible », sans délai chiffré ; audit sur demande écrite, aux frais de l'organisation ; responsabilité et droit applicable renvoyés aux CGU. L'accord d'Infomaniak pour Swiss Backup reste présenté comme « en cours de vérification ».

## Décision de l'opérateur (2026-10-05)

L'inventaire factuel et les brouillons (accord art. 28, liste publique des sous-traitants, variantes de la convention) sont préparés maintenant et marqués « à relire » ; la relecture juridique est **unique et combinée** pour #485 et #569, menée via le [prompt de relecture juridique](prompt-relecture-juridique.md) remis à une personne qualifiée (ou, en première passe, à des agents spécialisés). Pour la convention, une version générique par défaut pour la Suisse, la France et la Belgique, plus une version « autre pays », suffit à ce stade.

## Évolutions du produit nécessaires

- Sans ticket pour l'instant, à décider :
  - installation de la rotation des journaux dans le dépôt plutôt qu'une procédure manuelle ;
  - durée de vie des liens personnels en clair dans les emails en file d'envoi (`NotificationOutbox`).
- **Convention de bénévolat (#569)**, décidé le 2026-10-05, à faire **avant** toute nouvelle rédaction du texte par défaut : remplacer « au moins 48 heures à l'avance » par « dès que possible » dans `src/lib/volunteer-charter.ts` (le produit permet un retrait à tout moment et prévient déjà les organisateurs, #559) ; conserver une preuve de l'acceptation de la convention (quel texte, par version ou empreinte, et quand). Ce sont des changements de code, **hors du périmètre de ce dossier documentaire** : à faire dans une PR séparée.

## Conclusion

| Statut | Éléments |
|---|---|
| **Publié** | l'accord de sous-traitance et la liste des sous-traitants (2026-10-06), et la matrice de conservation ([../retention.md](../retention.md)) |
| **À valider juridiquement** | répartition des rôles, qualification des services push, accord de traitement et ses annexes, délai de notification des violations, procédure de violation, texte de la politique publique |
| **À vérifier en production et dans les contrats** | tout [verifications-production.md](verifications-production.md) : hébergeur, SMTP, copie hors site (Infomaniak Swiss Backup), Sentry, rotation des journaux, clé des sauvegardes, accès |
| **Évolution du produit** | les points de la section précédente |

## Cadre retenu (décision de l'opérateur, 2026-09-30)

- **Référence : le droit français et le RGPD.** Le service est hébergé en France (OVH, Roubaix) et les contrats des prestataires relèvent du droit français. On s'en tient à ce qui est légal en France, sans démarche supplémentaire.
- **Pas de courrier aux prestataires** : ni instructions écrites à OVH (DPA § 8.1), ni demande à Gandi sur la durée de ses journaux SMTP. Ces points restent notés, sans suite prévue.
- **Copie hors site : Infomaniak Swiss Backup (Suisse) depuis le 2026-10-05** (#524). L'écart Dropbox (offre individuelle, États-Unis, sans accord de traitement spécifique) est clos : plus rien n'y est envoyé et les anciennes copies sont en cours de suppression (#697). Reste à confirmer l'accord de traitement d'Infomaniak pour Swiss Backup.
