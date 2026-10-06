---
roles: [admin]
group: membres
order: 20
summary: Repérer les fiches de membres qui désignent sans doute la même personne, puis fusionner deux fiches avec un aperçu complet.
related: [gerer-les-membres, effacer-ou-supprimer-un-membre]
legacy: [admin#doublons-possibles, admin#fusionner-deux-fiches-en-double]
aliases: []
---

# Doublons et fusion de fiches

## Doublons possibles

Le lien **Doublons possibles (N)**, dans l'en-tête de la page **Membres**, n'apparaît que s'il y a au moins une paire à regarder. Chaque paire montre les deux fiches et les raisons, en mots, pour lesquelles elles se ressemblent : même nom et prénom (après normalisation des majuscules, accents, espaces, traits d'union et apostrophes), même numéro de téléphone (après normalisation des formats suisses et français courants), adresses email très proches (faute de frappe probable sur le même domaine, ou domaine mal orthographié), l'une des deux fiches a une adresse à vérifier proche de l'autre, ou même date de naissance. Un nom identique seul reste présenté comme incertain (« un homonyme n'est pas forcément la même personne ») ; un numéro ou une adresse partagés seuls ne sont jamais présentés comme une probable même personne (une famille, un standard commun expliquent aussi bien un numéro partagé). **Rien n'est fusionné ni modifié depuis cette page** : ce ne sont que des suggestions.

Pour chaque paire : **Ignorer** la retire de la liste (elle ne revient pas, sauf si un nouveau type de signal apparaît plus tard entre ces deux fiches, par exemple une date de naissance ajoutée après coup) ; **Comparer et fusionner** ouvre l'aperçu de fusion ci-dessous, réservé aux propriétaires (les organisateurs voient la paire et un message indiquant qu'un propriétaire doit s'en charger). Le lien **Doublon ?** d'une fiche à l'adresse à vérifier (voir [Gérer les membres](gerer-les-membres.md)) ouvre directement les paires de cette fiche.

Les fiches déjà fusionnées (absorbées par une autre) ne sont jamais suggérées. Seuls les membres de votre organisation sont comparés.

## Fusionner deux fiches en double

Quand deux fiches du répertoire désignent en fait la même personne (une adresse email saisie de travers, un doublon de saisie), le lien **Fusionner avec un autre membre** de la page **Activité** d'un membre, ou **Comparer et fusionner** depuis **Doublons possibles**, ouvre la fusion. Réservée aux propriétaires de l'organisation (les organisateurs peuvent repérer un doublon mais pas fusionner).

1. **Choisir la fiche à absorber** : recherchez par nom ou email la seconde fiche, celle qui disparaîtra.
2. **Aperçu** : pour chaque champ où les deux fiches diffèrent (prénom, nom, email, téléphone, date de naissance, note de disponibilité), choisissez la valeur à garder ; pour les notes internes, gardez celles d'une fiche, prenez celles de l'autre, ou mettez les deux à la suite. Les étiquettes et les disponibilités des deux fiches sont toujours réunies, sans choix à faire. Un tableau indique ce qui va être déplacé : inscriptions (par statut), invitations, réponses aux questions, et ce qui ne l'est pas (les abonnements aux notifications du navigateur, jamais déplacés).
3. **Points à vérifier** : si les deux fiches étaient inscrites au même créneau, l'inscription la plus avancée est gardée et l'autre annulée (avec une trace dans le journal de l'événement) ; les autres points (chevauchement de créneaux, limite de postes, âge minimum, poste réservé) sont seulement signalés, pas bloqués, puisque vous avez déjà placé ces personnes en connaissance de cause. Une réponse différente à une même question, ou une invitation au même événement des deux côtés quand ce n'est pas déjà tranché par « déjà utilisée en premier », demande un choix explicite avant de pouvoir confirmer.
4. **Confirmer** : la fusion est **irréversible**. La fiche absorbée est désactivée et vidée de ses informations personnelles (nom, email, téléphone, notes, date de naissance, étiquettes). Les liens personnels (inscriptions, invitations) déplacés depuis la fiche absorbée sont régénérés : une case à cocher permet d'envoyer aussi les nouveaux liens à l'adresse conservée. Les anciens liens affichent la page « lien plus valide » habituelle.

L'historique (journal de l'événement, journal de l'organisation) n'est jamais réécrit ; la page **Activité** de la fiche conservée continue à montrer les faits enregistrés sous l'ancienne fiche. Les responsables de secteur sont repérés par email, pas déplacés automatiquement : s'ils correspondent à l'adresse abandonnée, mettez-les à jour à la main.

## Questions fréquentes

### Une personne s'est inscrite avec une adresse email mal saisie et a maintenant deux fiches.

Quand un email lui est définitivement refusé, sa fiche porte l'étiquette **Adresse à vérifier** : corrigez l'adresse depuis sa fiche. Si une seconde fiche a été créée, la page **Doublons possibles** la propose à côté de la première, avec les raisons du rapprochement ; le propriétaire de l'organisation peut alors **fusionner** les deux fiches, avec un aperçu de tout ce qui sera déplacé avant de confirmer.
