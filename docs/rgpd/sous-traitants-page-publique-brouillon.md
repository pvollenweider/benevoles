# Brouillon — liste publique des sous-traitants

> **BROUILLON À RELIRE PAR UNE PERSONNE QUALIFIÉE. Sans valeur en l'état, pas un avis juridique.**
> Rédigé pour servir de contenu à une future page publique (type `/confidentialite/sous-traitants`
> ou une section de la politique de confidentialité). Ce document ne crée pas cette page : il en
> propose seulement le texte. Les faits viennent de [sous-traitants.md](sous-traitants.md), qui
> détaille les sources et ce qui reste à vérifier ; en cas d'écart, ce dernier fait foi.
>
> À faire par la personne qualifiée avant publication : vérifier que chaque ligne reste exacte au
> moment de la publication (un DPA ou une offre peut changer), choisir la formulation définitive,
> et décider si la version avec ou sans Dropbox doit être publiée en l'état (voir la note en bas de
> page) compte tenu du remplacement prévu (#524).

## Sous-traitants de benevol.app

Le service fait appel aux prestataires suivants pour traiter les données que votre organisation
nous confie. Chacun agit sur nos instructions, pour les finalités décrites ci-dessous — jamais
pour son propre compte.

| Prestataire | Service | Données concernées | Localisation | Garanties | Lien |
|---|---|---|---|---|---|
| **OVH SAS** (France) | Hébergement du serveur, de l'application et de la base de données ; sauvegardes locales chiffrées | Toutes les données du service | France (datacenter de Roubaix) | Annexe de traitement des données (DPA) acceptée ; aucune sauvegarde du contenu par OVH en dehors du service ; accès à distance de filiales hors UE encadré par les clauses contractuelles types de la Commission européenne pour la sécurité et la maintenance | [ovhcloud.com/fr/personal-data-protection](https://www.ovhcloud.com/fr/personal-data-protection/faq/) |
| **Gandi SAS** (France) | Envoi des emails du service (invitations, rappels, notifications) | Adresse email, contenu des emails, liens personnels d'inscription | France (données de messagerie, sans transfert selon le contrat) | Accord de traitement des données (DPA) | [gandi.net/fr/contracts/privacy-policy](https://www.gandi.net/en/contracts/privacy-policy) |
| **Dropbox** [si cette ligne est conservée, voir note ci-dessous] | Copie de sauvegarde hors site, chiffrée avant l'envoi | Sauvegarde chiffrée de la base de données (le service garde seul la clé de déchiffrement) | États-Unis (offre utilisée actuellement) | Sauvegarde chiffrée avant l'envoi ; remplacement prévu par un hébergement suisse | [dropbox.com/privacy](https://www.dropbox.com/privacy) |
| **Sentry** (Functional Software, Inc., États-Unis) | Suivi des erreurs techniques du service | Rapports d'erreur techniques, allégés des données personnelles (adresses, jetons d'accès et contenu retirés avant l'envoi) | Union européenne (traitement), États-Unis (gestion du compte) | Accord de traitement des données (DPA) ; garanties de transfert (clauses contractuelles types) | [sentry.io/legal/dpa](https://sentry.io/legal/dpa/) |
| Services de notification des navigateurs (selon le navigateur utilisé : Google, Mozilla, Apple ou Microsoft) | Acheminement des notifications que vous activez volontairement dans votre navigateur | Message chiffré (le fournisseur ne peut pas le lire), adresse technique de votre abonnement | Variable selon le navigateur | Chiffrement de bout en bout du contenu du message (norme RFC 8291) | — |

## Ce que cette liste ne couvre pas

- Les services qui ne reçoivent aucune donnée personnelle de votre organisation (DNS, certificats
  de sécurité, vérification technique de mise à jour du logiciel) ne sont pas repris ici : ils sont
  listés à titre d'information dans notre documentation technique.
- Toute évolution de cette liste (ajout, remplacement) vous est annoncée à l'avance, avec un délai
  raisonnable pour vous y opposer, avant son entrée en vigueur.

## Note sur Dropbox (à trancher avant publication)

Au moment de la rédaction de ce brouillon, la copie de sauvegarde hors site utilise encore un
compte Dropbox individuel (États-Unis, sans accord de traitement des données spécifique) ; un
remplacement par un hébergement suisse est prévu mais pas encore en service. Deux options pour la
personne qualifiée :

1. publier la ligne Dropbox telle quelle, en toute transparence, le temps de la migration ;
2. attendre la migration avant de publier la liste, pour ne pas devoir la corriger peu après.

La page ne doit dans tous les cas jamais annoncer un sous-traitant qui n'est pas encore utilisé :
un futur fournisseur d'envoi transactionnel avec rapports d'échec détaillés est à l'étude (#602,
non tranché) et n'a pas sa place ici tant qu'il n'est pas choisi et effectivement en service.
