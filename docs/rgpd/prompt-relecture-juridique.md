# Prompt de relecture juridique combiné (#485 et #569)

> À remettre, tel quel ou adapté, à une personne qualifiée (avocat·e ou juriste spécialisé·e en
> protection des données et droit des associations) ou, en première passe, à une IA juridique
> spécialisée. Couvre ensemble l'inventaire RGPD/nLPD (#485) et la révision de la convention de
> bénévolat (#569), décidé combiné par l'opérateur le 2026-10-05. Ce prompt ne contient aucun avis
> juridique : seulement des faits vérifiés dans le dépôt et des questions précises.

---

## Contexte du produit

benevol.app est un service de gestion de bénévoles pour des événements associatifs. Les
bénévoles s'inscrivent **sans créer de compte** : ils reçoivent un lien personnel par email et
gèrent leur inscription depuis ce lien. Les organisations clientes sont situées principalement en
**Suisse, en France et en Belgique**. L'éditeur du service est un opérateur unique (particulier),
hébergé en France (OVH, Roubaix). Le service traite, pour le compte de chaque organisation
cliente : identité et contact des bénévoles, disponibilités, inscriptions et présences, réponses à
des questions libres posées par l'organisation, étiquettes et notes internes, et les communications
envoyées par l'organisation (emails, messages ciblés, notifications du navigateur).

## Les faits (inventaire vérifié dans le dépôt)

L'inventaire complet, avec pour chaque affirmation sa source dans le code ou la configuration, est
dans [inventaire.md](inventaire.md) et [sous-traitants.md](sous-traitants.md). En résumé :

- **Hébergement** : OVH SAS, serveur dédié Kimsufi, datacenter RBX3 (Roubaix, France) ; DPA OVH
  accepté le 2026-04-02.
- **Envoi des emails** : Gandi Mail (France, sans transfert selon son DPA).
- **Sauvegardes** : locales chiffrées (AES-256) sur le serveur (30 jours), copie hors site chiffrée
  vers un compte Dropbox **individuel** (États-Unis, **sans DPA** pour cette offre, 90 jours) ;
  remplacement par un hébergement suisse prévu mais pas encore en service (#524).
- **Suivi des erreurs** : Sentry (Functional Software, Inc.), région de traitement UE (Francfort),
  compte et réglages aux États-Unis ; jetons d'accès et adresses email systématiquement retirés
  avant l'envoi (`src/lib/sentry-scrub.ts`) ; conservation 30 jours (offre Developer).
- **Notifications du navigateur** : contenu chiffré de bout en bout (RFC 8291) ; le service de
  notification choisi par le navigateur du bénévole (Google, Mozilla, Apple ou Microsoft) voit
  l'existence et des métadonnées du message, jamais son contenu ; rôle juridique de ces services
  **non qualifié**.
- **Droits des personnes** : export (CSV/JSON) disponible pour l'organisation ; désactivation d'un
  membre possible à tout moment ; **effacement individuel disponible seulement pour une fiche
  inactive sans aucune inscription** (#667) ; l'effacement d'une fiche avec historique reste une
  opération manuelle de l'opérateur (#516, ouvert).
- **Violation de données** : procédure interne en projet, pas encore validée ([procedure-violation.md](procedure-violation.md)).

## Les brouillons à relire

1. **Accord de traitement (art. 28 RGPD / art. 9 nLPD)** : [accord-sous-traitance-brouillon.md](accord-sous-traitance-brouillon.md),
   construit sur la base des clauses contractuelles types de la Commission européenne, avec des
   placeholders entre crochets pour tout ce que seule une personne qualifiée (ou l'opérateur, avec
   son avis) peut trancher : entité juridique exacte, délais de notification, plafonds de
   responsabilité, droit applicable.
2. **Liste publique des sous-traitants** : [sous-traitants-page-publique-brouillon.md](sous-traitants-page-publique-brouillon.md),
   texte prêt pour une future page publique, pas encore publiée.
3. **Variantes de la convention de bénévolat** : [convention-benevoles-variantes-brouillon.md](convention-benevoles-variantes-brouillon.md),
   un texte neutre générique plus des notes par pays (Suisse, France, Belgique, « autre pays »),
   construites sur le texte actuel de `src/lib/volunteer-charter.ts` (après le changement décidé
   mais pas encore codé : « dès que possible » plutôt que « au moins 48 heures à l'avance »).

## Questions précises, à répondre point par point avec référence au point concerné

### Accord de traitement et sous-traitants (#485)

1. Le brouillon de l'accord de traitement est-il utilisable en l'état comme base de négociation
   avec une organisation cliente, en Suisse comme dans l'UE ? Quelles clauses manquent ou doivent
   être reformulées (article du brouillon à citer) ?
2. **Sous-traitants hors Suisse/UE** : Sentry (traitement UE, compte aux États-Unis) et Dropbox
   (stockage aux États-Unis, offre individuelle sans DPA) — quelles garanties de transfert sont
   nécessaires dans l'accord, et le maintien de Dropbox en l'état est-il acceptable le temps de la
   migration vers un hébergement suisse (#524), ou faut-il accélérer ce remplacement avant de
   signer un premier accord de traitement ?
3. **Transferts internationaux** : au-delà de Sentry et Dropbox, la liste de
   [sous-traitants.md](sous-traitants.md) appelle-t-elle d'autres clauses de transfert (services de
   notification des navigateurs par exemple) ?
4. **Page publique des sous-traitants** : le contenu de
   [sous-traitants-page-publique-brouillon.md](sous-traitants-page-publique-brouillon.md)
   suffit-il à l'obligation de transparence, et la ligne Dropbox doit-elle être publiée telle
   quelle ou attendre la migration (#524) ?
5. **Délai de notification des violations** (article 11 du brouillon d'accord, actuellement
   laissé à fixer) : quel délai recommander entre la connaissance d'une violation par l'opérateur
   et sa notification à l'organisation cliente, compte tenu du délai que l'organisation doit
   elle-même respecter envers son autorité de contrôle ?
6. **Rôles non tranchés** : la répartition des données des comptes administrateurs entre
   « l'opérateur responsable » et « l'opérateur sous-traitant » (tableau des rôles dans
   [inventaire.md](inventaire.md)) est-elle correcte ?

### Convention de bénévolat (#569)

7. **Nature du texte** : la convention de bénévolat doit-elle être un texte à portée contractuelle,
   ou peut-elle rester un engagement moral (charte) ? Cette qualification change-t-elle ce qui doit
   y figurer ?
8. **Acceptation obligatoire et preuve** : le produit peut-il bloquer une inscription tant que la
   convention n'est pas acceptée ? Quelle preuve d'acceptation est suffisante (quel texte, par
   version ou empreinte, quelle date), et quelle durée de conservation pour cette preuve ? (Décidé
   en principe le 2026-10-05, détail à trancher avec cette relecture.)
9. **Mineurs** : le produit demande une date de naissance seulement quand un créneau exige un âge
   minimum. Faut-il un texte ou un consentement distinct pour un bénévole mineur, ou pour son
   représentant légal ?
10. **Assurance et responsabilité, par pays** — voir le détail et les sources officielles dans
    [convention-benevoles-variantes-brouillon.md](convention-benevoles-variantes-brouillon.md) :
    - **Suisse** : la mention actuelle de la LAA pour un bénévole non salarié de l'organisation
      est-elle correcte, ou trompeuse ?
    - **France** : faut-il ajouter une clause sur l'assurance responsabilité civile de
      l'association et sur la couverture accident du bénévole, et laquelle ?
    - **Belgique** : l'organisation cliente type relève-t-elle de l'obligation d'assurance de la
      loi du 3 juillet 2005 sur le volontariat, et la convention doit-elle en faire mention ou
      demander confirmation à l'organisation ?
    - **Autre pays** : la variante sans aucune hypothèse légale (clause laissée à la charge de
      l'organisation) est-elle une solution acceptable, ou faut-il une mise en garde plus visible ?
11. **Cohérence avec le produit livré** : le texte proposé reste-t-il cohérent avec le certificat
    de bénévolat sur demande (#556, livré) et la notification des organisateurs au retrait (#559,
    livré) ?

### Transversal

12. **Que montrer sur la page de confidentialité publique** (`src/app/legal/privacy/page.tsx`) une
    fois cette relecture faite : quels points de l'accord de traitement, de la liste des
    sous-traitants et de la convention doivent s'y refléter, et avec quelle formulation ?
13. **Coordonnées de l'équipe montrées aux bénévoles (#560)** : l'organisation peut saisir un
    « Contact le jour J » (nom et téléphone d'un organisateur ou d'un membre de l'équipe), montré
    aux seuls bénévoles confirmés (page personnelle, rappels, planning individuel imprimé), jamais
    publiquement, comme le contact d'un créneau déjà existant. Le produit montre aussi aux
    bénévoles confirmés d'un poste le **nom** de son ou ses responsables de secteur (jamais leur
    email ni leur téléphone, sauf s'ils sont aussi saisis comme contact). Ces deux affichages
    demandent-ils une information ou un consentement de la personne concernée en plus de ce que
    l'organisation fait déjà (le contact est saisi par l'organisation, qui reste responsable du
    traitement) ? Faut-il un texte d'aide dans le formulaire, ou une mention dans l'accord de
    traitement ou la politique de confidentialité ?
14. Y a-t-il un risque à traiter en priorité, avant tout le reste de cette liste ?

Merci de répondre point par point, avec, pour chaque réponse, la référence précise au texte ou à la
source officielle sur laquelle elle s'appuie.
