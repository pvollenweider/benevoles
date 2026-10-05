# Brouillon — variantes de la convention de bénévolat par pays (#569)

> **BROUILLON À RELIRE PAR UNE PERSONNE QUALIFIÉE. Sans valeur en l'état, pas un avis juridique.**
> Rien ici ne remplace ni ne modifie le texte par défaut réellement envoyé aux bénévoles
> (`src/lib/volunteer-charter.ts`) : ce sont des pistes de rédaction, à valider avant toute
> implémentation. Décision de l'opérateur (2026-10-05) : une version générique par défaut pour la
> Suisse, la France et la Belgique, plus une version « autre pays », suffit à ce stade — pas une
> variante par pays détaillée. La relecture de ce brouillon est **combinée** avec celle de l'accord
> de traitement du dossier #485 : voir [prompt-relecture-juridique.md](prompt-relecture-juridique.md).

## Point de départ : le texte actuel du produit

Source : `buildVolunteerCharter()` dans `src/lib/volunteer-charter.ts`. Trois parties fixes
(engagement du bénévole, engagements complémentaires, engagements de l'organisation) et une clause
d'assurance qui varie selon qu'une organisation déclare couvrir elle-même ses bénévoles par sa
responsabilité civile (`hasOrgInsurance: true`, texte par défaut) ou non (le bénévole est alors
renvoyé à sa « couverture accidents personnelle adéquate (LAA ou assurance personnelle
équivalente) »).

**Changement décidé le 2026-10-05, pas encore fait (changement de code, hors du périmètre
documentaire de ce brouillon — voir [README.md](README.md))** : remplacer « De prévenir la
responsable bénévole **au moins 48 heures à l'avance** en cas de désistement... » par « **dès que
possible** », pour correspondre à ce que permet déjà le produit (retrait à tout moment,
notification des organisateurs depuis #559). Les textes ci-dessous **anticipent déjà ce
changement** : ils ne doivent pas servir de référence tant que le code n'a pas été corrigé en
conséquence, pour ne pas documenter un texte que le produit n'envoie pas encore.

## Texte neutre générique (base commune, sans mention de pays)

```
A été convenu que :

1. Engagement bénévole

La personne bénévole s'engage librement pour mener une activité non rémunérée en faveur de
l'organisation, en dehors de son temps professionnel et familial. Elle s'engage :
- à respecter toutes les personnes avec qui elle sera en contact, quelles que soient leur
  origine, leur genre, leur sexualité ou leur identité d'expression ;
- à respecter ses disponibilités validées avec la personne responsable des bénévoles ;
- à participer aux missions confiées selon ses disponibilités ;
- à s'assurer d'une couverture adéquate en cas d'accident survenant dans le cadre de son
  engagement [clause à adapter selon le pays, voir ci-dessous].

2. En outre, la personne bénévole accepte :
- de respecter les consignes de sécurité en vigueur ;
- d'être garante de l'image de l'organisation ;
- de considérer son engagement avec tout le sérieux nécessaire au bon déroulement des
  activités ;
- de prévenir la personne responsable des bénévoles dès que possible en cas de désistement ou
  de changement de disponibilité, afin de ne pas compromettre l'organisation générale de
  l'équipe.

3. L'organisation s'engage envers la personne bénévole :
- à fournir les informations et le matériel nécessaires à l'exercice des missions ;
- à assurer un environnement de travail respectueux et bienveillant ;
- à remettre, sur demande, un certificat de bénévolat à l'issue de l'engagement.

[Clause d'assurance ou de responsabilité civile — voir la note du pays de l'organisation
ci-dessous.]
```

### Questions ouvertes communes à toutes les variantes (#569)

1. **Nature du texte** : s'agit-il d'un engagement moral (charte) ou d'un texte à portée
   contractuelle ? La réponse change ce qui doit figurer dedans (notamment la clause de
   responsabilité) et la rigueur attendue de la preuve d'acceptation.
2. **Acceptation obligatoire** : le produit peut-il, ou doit-il, bloquer une inscription tant que
   la convention n'est pas acceptée ? Cas des mineurs (le produit demande une date de naissance
   seulement si un créneau exige un âge minimum, `Volunteer.birthDate`) : faut-il un consentement
   ou une information distincte pour un bénévole mineur ou son représentant légal ?
3. **Preuve de l'acceptation**, décidée le 2026-10-05 mais pas encore implémentée : quel texte
   garder trace (version exacte ou empreinte), quelle durée de conservation pour cette preuve, et
   son statut au regard de l'inventaire des données personnelles ([inventaire.md](inventaire.md)) —
   une nouvelle catégorie de donnée à ajouter une fois le mécanisme choisi.
4. **Articulation avec le certificat de bénévolat** (#556, livré) et la notification de retrait
   (#559, livré) : le texte ci-dessus doit rester synchronisé avec ce que le produit fait
   réellement, pour ne pas promettre plus (ou moins) que ce qui existe.

## Suisse

Mention conservée **à l'identique du texte d'aujourd'hui** : la personne bénévole est renvoyée à
« sa propre couverture accidents (LAA ou assurance personnelle équivalente) » quand l'organisation
ne déclare pas la couvrir elle-même par sa responsabilité civile.

- Point de départ officiel pour la personne qualifiée : l'assurance-accidents selon la LAA
  (assurance-accidents obligatoire) couvre en principe les personnes salariées ; sa portée pour une
  personne bénévole non salariée de l'organisation (donc sans rapport de travail avec elle) **n'est
  pas établie par ce brouillon** — c'est une question à trancher par la personne qualifiée, pas une
  affirmation. Sources officielles à vérifier : [SUVA, assurance-accidents LAA](https://www.suva.ch/fr-ch/assurance/assurance-accidents/assurance-accidents-laa) ;
  [OFAS/AVS-AI, fiche 6.05 Assurance-accidents LAA](https://www.ahv-iv.ch/p/6.05.f).
- Cadre nLPD pour l'accord de traitement associé : [EDÖB, Externalisation (sous-traitance)](https://www.edoeb.admin.ch/fr/externalisation-sous-traitance) ;
  texte de l'art. 9 LPD : [Fedlex, RS 235.1](https://www.fedlex.admin.ch/eli/cc/2022/491/fr).

### Questions ouvertes (Suisse)

- La mention LAA suffit-elle, ou faut-il préciser qu'elle ne s'applique peut-être pas telle quelle
  à un bénévole (par opposition à un salarié de l'organisation) ?
- Le canton ou le type d'organisation (association, fondation, collectivité) change-t-il la
  réponse ?

## France

Pas de mention d'assurance obligatoire aujourd'hui dans le texte par défaut ; à décider si la
variante française doit en ajouter une, et laquelle.

- Point de départ officiel : [associations.gouv.fr, « L'assurance et la protection sociale des
  bénévoles »](https://associations.gouv.fr/lassurance-et-la-protection-sociale-des-benevoles).
  Ce que ce brouillon retient, **à vérifier par la personne qualifiée, pas une affirmation
  définitive** : l'assurance responsabilité civile de l'association est couramment présentée comme
  fortement recommandée plutôt que systématiquement obligatoire par la loi (sauf obligations
  propres à certains secteurs, par exemple certaines fédérations sportives) ; une couverture
  « accidents corporels » du bénévole lui-même est en général une option complémentaire, pas une
  obligation légale générale.
- Cadre RGPD pour l'accord de traitement associé : CNIL, [« Sous-traitant » (qualification
  juridique)](https://www.cnil.fr/fr/qualification-juridique-sous-traitance) et [« Clauses
  contractuelles types entre responsable de traitement et sous-traitant »](https://www.cnil.fr/fr/clauses-contractuelles-types-entre-responsable-de-traitement-et-sous-traitant).

### Questions ouvertes (France)

- Faut-il ajouter une clause sur l'assurance responsabilité civile de l'association (souvent
  présentée comme fortement recommandée), et une mention de la couverture accident du bénévole
  (souvent facultative) ? Avec quelle formulation, pour ne pas laisser croire à une obligation qui
  n'existe pas, ni l'inverse ?
- Le secteur d'activité de l'organisation (sportif, médico-social, etc.) impose-t-il une couverture
  spécifique à mentionner ?

## Belgique

Pas de mention d'assurance aujourd'hui dans le texte par défaut, alors que la loi belge sur le
volontariat impose une obligation précise à la plupart des organisations.

- Point de départ officiel : loi du 3 juillet 2005 relative aux droits des volontaires, [texte
  consolidé (Justel/Moniteur belge)](https://www.ejustice.just.fgov.be/eli/loi/2005/07/03/2005022674/justel).
  Ce que ce brouillon retient, **à vérifier par la personne qualifiée, pas une affirmation
  définitive** : la loi impose à l'organisation de souscrire une assurance couvrant au moins la
  responsabilité civile extracontractuelle de ses volontaires et de l'organisation elle-même pour
  les dommages causés dans le cadre du volontariat, sauf pour les « associations de fait » sans
  personnel ni structure plus large, qui en seraient dispensées.
- Cadre RGPD pour l'accord de traitement associé : Autorité de protection des données, [recommandation n° 06/2017](https://www.autoriteprotectiondonnees.be/publications/recommandation-n-06-2017.pdf)
  (sous-traitance, antérieure au RGPD mais pertinente comme point de départ, à confronter aux
  lignes directrices plus récentes).

### Questions ouvertes (Belgique)

- L'organisation cliente type (association, ASBL) entre-t-elle dans le champ de l'obligation
  d'assurance de la loi de 2005, ou peut-elle être une « association de fait » dispensée ? La
  convention doit-elle mentionner cette assurance comme acquise, ou demander confirmation à
  l'organisation ?
- Faut-il une clause distincte pour les dommages causés *par* le volontaire et *subis par* le
  volontaire (deux logiques différentes dans la loi) ?

## Autre pays

Variante **sans aucune hypothèse légale** : aucune mention d'assurance, de régime d'accident ni de
texte de loi présumée applicable. Le texte neutre générique ci-dessus, avec la clause d'assurance
remplacée par un espace à compléter par l'organisation elle-même (« selon les règles applicables
dans son pays et son secteur ») plutôt qu'une affirmation du produit.

### Questions ouvertes (autre pays)

- Le produit doit-il laisser l'organisation rédiger elle-même cette clause (texte libre), ou
  seulement avertir qu'aucune vérification n'a été faite pour son pays ?
- Faut-il une mise en garde visible pour l'organisation, au moment où elle choisit cette variante,
  l'invitant à faire valider son propre texte ?
