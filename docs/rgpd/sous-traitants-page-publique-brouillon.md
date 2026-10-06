# Brouillon — liste publique des sous-traitants

> **BROUILLON À RELIRE PAR UNE PERSONNE QUALIFIÉE. Sans valeur en l'état, pas un avis juridique.**
> Rédigé pour servir de contenu à une future page publique (type `/confidentialite/sous-traitants`
> ou une section de la politique de confidentialité). Ce document ne crée pas cette page : il en
> propose seulement le texte. Les faits viennent de [sous-traitants.md](sous-traitants.md), qui
> détaille les sources et ce qui reste à vérifier ; en cas d'écart, ce dernier fait foi.
>
> À faire par la personne qualifiée avant publication : vérifier que chaque ligne reste exacte au
> moment de la publication (un DPA ou une offre peut changer), choisir la formulation définitive,
> et compléter la ligne Infomaniak une fois son accord de traitement confirmé (voir la note en bas
> de page).

## Sous-traitants de benevol.app

Le service fait appel aux prestataires suivants pour traiter les données que votre organisation
nous confie. Chacun agit sur nos instructions, pour les finalités décrites ci-dessous — jamais
pour son propre compte.

| Prestataire | Service | Données concernées | Localisation | Garanties | Lien |
|---|---|---|---|---|---|
| **OVH SAS** (France) | Hébergement du serveur, de l'application et de la base de données ; sauvegardes locales chiffrées | Toutes les données du service | France (datacenter de Roubaix) | Annexe de traitement des données (DPA) acceptée ; aucune sauvegarde du contenu par OVH en dehors du service ; accès à distance de filiales hors UE encadré par les clauses contractuelles types de la Commission européenne pour la sécurité et la maintenance | [ovhcloud.com/fr/personal-data-protection](https://www.ovhcloud.com/fr/personal-data-protection/faq/) |
| **Gandi SAS** (France) | Envoi des emails du service (invitations, rappels, notifications) | Adresse email, contenu des emails, liens personnels d'inscription | France (données de messagerie, sans transfert selon le contrat) | Accord de traitement des données (DPA) | [gandi.net/fr/contracts/privacy-policy](https://www.gandi.net/en/contracts/privacy-policy) |
| **Infomaniak Network SA** (Suisse), offre Swiss Backup | Copie de sauvegarde hors site, chiffrée avant l'envoi | Sauvegarde chiffrée de la base de données (le service garde seul la clé de déchiffrement) | Suisse (selon le fournisseur) | Sauvegarde chiffrée avant l'envoi ; accord de traitement des données [en cours de vérification, voir note ci-dessous] | [lien vers la page de confidentialité d'Infomaniak à ajouter] |
| **Sentry** (Functional Software, Inc., États-Unis) | Suivi des erreurs techniques du service | Rapports d'erreur techniques, allégés des données personnelles (adresses, jetons d'accès et contenu retirés avant l'envoi) | Union européenne (traitement), États-Unis (gestion du compte) | Accord de traitement des données (DPA) ; garanties de transfert (clauses contractuelles types) | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/) |
| Services de notification des navigateurs (selon le navigateur utilisé : Google, Mozilla, Apple ou Microsoft) | Acheminement des notifications que vous activez volontairement dans votre navigateur | Message chiffré (le fournisseur ne peut pas le lire), adresse technique de votre abonnement | Variable selon le navigateur | Chiffrement de bout en bout du contenu du message (norme RFC 8291) | — |

## Ce que cette liste ne couvre pas

- Les services qui ne reçoivent aucune donnée personnelle de votre organisation (DNS, certificats
  de sécurité, vérification technique de mise à jour du logiciel) ne sont pas repris ici : ils sont
  listés à titre d'information dans notre documentation technique.
- Toute évolution de cette liste (ajout, remplacement) vous est annoncée à l'avance, avec un délai
  raisonnable pour vous y opposer, avant son entrée en vigueur.

## Note sur la copie hors site (à trancher avant publication)

Depuis le 2026-10-05, la copie de sauvegarde hors site part chez Infomaniak Swiss Backup (Suisse).
Jusqu'à cette date elle allait sur un compte Dropbox individuel (États-Unis), dont les anciennes
copies sont en cours de suppression ; Dropbox n'est plus un sous-traitant et n'a pas sa place dans
cette liste. L'accord de traitement propre à Swiss Backup n'est pas encore confirmé (voir
[sous-traitants.md](sous-traitants.md)) : la colonne « Garanties » de la ligne Infomaniak ne doit
pas en annoncer un avant cette confirmation.

La page ne doit dans tous les cas jamais annoncer un sous-traitant qui n'est pas encore utilisé :
un futur fournisseur d'envoi transactionnel avec rapports d'échec détaillés est à l'étude (#602,
non tranché) et n'a pas sa place ici tant qu'il n'est pas choisi et effectivement en service.
