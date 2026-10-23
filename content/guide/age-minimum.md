---
roles: [admin, benevole]
group: regles
order: 30
summary: Un poste peut exiger un âge minimum : la date de naissance est demandée à l'inscription et l'âge compte au jour du créneau.
related: [inscriptions-sur-validation, s-inscrire]
legacy: [admin#age-minimum-sur-un-poste]
aliases: []
---

# Âge minimum sur un poste

<!-- video: SHIFT_ELIGIBILITY_RULES -->

Un poste peut exiger un âge minimum (majorité, permis de conduire, qualification…), affiché en petit sur le planning public (par exemple « 18+ »). L'âge pris en compte est celui du jour du créneau, pas du jour de l'inscription, et aucun justificatif n'est demandé.

## Côté bénévole

Le créneau reste visible et tu peux le sélectionner normalement, puisque ton âge n'est pas connu avant le formulaire : ta date de naissance t'est demandée à l'inscription, et l'inscription n'aboutit que si tu auras l'âge requis le jour du créneau. Sinon, elle est refusée avec un message clair.

### Le poste demande un âge minimum, mais je n'ai pas mon acte de naissance sur moi

Pas besoin de justificatif à l'inscription : indique simplement ta date de naissance dans le formulaire. Si la condition n'est pas remplie, l'inscription est refusée avec un message clair ; sinon, elle passe normalement.

## Côté organisation

Renseignez le champ **Âge minimum** dans le formulaire du créneau concerné (par exemple `18`, ou `21` pour conduire). Le créneau reste visible et sélectionnable pour tout le monde, et rien d'autre n'est à gérer à la main : c'est la date de naissance, demandée à l'inscription, qui filtre. Une personne que vous ajoutez à la main n'est pas soumise à cette condition.
