# Sous-traitants ultérieurs (projet)

Liste destinée à l'annexe III de l'accord ([projet-accord-traitement.md](projet-accord-traitement.md)). **Aucune ligne n'est vérifiée** : chaque case « à confirmer » demande une preuve (contrat, capture de la configuration du compte, page officielle du fournisseur) et la date de la vérification. Le détail des vérifications est dans [verifications-production.md](verifications-production.md).

| Prestataire | Service et finalité | Données concernées | Rôle probable | Localisation et accès | Contrat, DPA, transferts | Conservation chez lui | Vérifié le |
|---|---|---|---|---|---|---|---|
| Hébergeur du serveur (OVH / Kimsufi selon la politique publiée) | serveur : application, base, sauvegardes locales | toutes | sous-traitant | à confirmer : entité, centre de données, accès du support hors de France | à confirmer : conditions et DPA de l'offre souscrite (lien à ajouter) | selon le contrat, à confirmer | — |
| Fournisseur SMTP réellement configuré (Gandi selon la politique publiée, **non vérifié**) | envoi des emails | destinataire, contenu des emails, liens personnels compris | sous-traitant | à confirmer | à confirmer : DPA (lien à ajouter) | journaux et files du fournisseur : à confirmer | — |
| Dropbox | copie hors site des sauvegardes, chiffrées avant l'envoi | sauvegardes chiffrées de la base (l'opérateur détient la clé) | sous-traitant | à confirmer : entité contractante selon l'offre, région de stockage du compte, accès possibles hors de Suisse et de l'UE | à confirmer : conditions, DPA, mécanisme de transfert | fichiers supprimés et versions : à confirmer selon l'offre | — |
| Sentry (Functional Software) | suivi des erreurs, enregistrements de navigation masqués | rapports d'erreur minimisés ([inventaire.md](inventaire.md)) | sous-traitant | à confirmer : région du projet de production (la politique publiée dit UE, Allemagne), sous-traitants de Sentry, accès hors UE | à confirmer : DPA accepté dans le compte, mécanisme de transfert | erreurs, traces, enregistrements : à confirmer selon l'offre et les réglages du projet | — |
| Services push des navigateurs (Google, Mozilla, Apple, Microsoft) | acheminer les notifications activées par un bénévole | message chiffré, endpoint, métadonnées (heure, taille) | **à qualifier juridiquement** | selon le navigateur | à confirmer : conditions applicables (lien à ajouter) | durée de vie demandée : 3 jours (`TTL`, `src/lib/push.ts`) ; conservation effective à confirmer | — |

## Inventaire technique, hors liste contractuelle

Ces services ne traitent pas de données des bénévoles et ne sont a priori pas des sous-traitants au sens de l'article 28. Ils restent dans l'inventaire technique.

| Service | Usage | Pourquoi hors liste |
|---|---|---|
| Gandi (DNS) | zone DNS du domaine, validation des certificats (webhook cert-manager) | enregistrements techniques, pas de données des bénévoles. Si Gandi est aussi le fournisseur SMTP, il figure dans la liste ci-dessus à ce titre. |
| Let's Encrypt | certificats TLS | noms de domaine publics seulement |

## Tenue de la liste

- Chaque ajout ou remplacement suit la procédure de l'accord : information préalable, délai, droit d'opposition.
- La liste porte une version et une date d'effet ; l'accord signé renvoie à la version en vigueur à sa signature.
