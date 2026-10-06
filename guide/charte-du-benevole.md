---
roles: [admin]
group: organisation
order: 50
summary: Personnaliser la convention que les bénévoles acceptent avant de s'inscrire, et retrouver la preuve de leur acceptation.
related: [personnaliser-l-organisation, suivre-les-inscriptions]
legacy: [admin#charte-du-benevole]
aliases: []
---

# Charte du bénévole

<!-- video: ORG_TIMEZONE_CHARTER -->

Dans l'interface, la charte s'appelle « Convention des Bénévoles ».

**`/admin/settings/admins`** → section **Convention des Bénévoles** (réservé aux propriétaires)

La charte est le texte que les bénévoles doivent lire et accepter avant de finaliser leur inscription. Un texte par défaut est fourni ; vous pouvez le personnaliser librement ou le réinitialiser.

- Le commutateur **Assurance RC fournie par l'organisation** choisit la variante du texte par défaut : couverture par l'assurance responsabilité civile de l'organisation, ou couverture accidents personnelle à la charge de chaque bénévole. Changer le commutateur remplace le texte affiché dans la zone de saisie par la variante correspondante ; les modifications non enregistrées sont perdues.
- Modifier le texte dans la zone de saisie et cliquer sur **Enregistrer**
- Cliquer sur **Réinitialiser la convention par défaut** pour revenir au texte standard

Dans le formulaire d'inscription, les bénévoles cochent la case « J'ai lu et j'accepte la convention des bénévoles ». Le lien « convention des bénévoles » ouvre une fenêtre « Convention des Bénévoles » avec le texte complet et un bouton « J'ai lu et j'accepte », qui coche la case.

Chaque inscription faite par ce formulaire garde la preuve que la personne a accepté la convention : quel texte exactement (le vôtre, ou le texte par défaut dans sa variante d'assurance) et à quelle date. Elle apparaît sous l'inscription, dans la liste **Inscriptions** de l'événement : « Convention acceptée le 5 octobre 2026 à 14h32 (version en vigueur) », à l'heure de votre organisation. Si vous avez modifié la convention depuis, la ligne dit « version précédente » avec le début de l'empreinte de l'ancien texte. Une inscription ajoutée à la main par un administrateur n'en a pas : personne n'a accepté quoi que ce soit dans ce cas. Les inscriptions plus anciennes que cette preuve n'en ont pas non plus.

Le fuseau horaire de l'organisation, dans lequel ces dates sont affichées, se règle sur la même page (voir [Personnaliser l'organisation](personnaliser-l-organisation.md#fuseau-horaire)).
