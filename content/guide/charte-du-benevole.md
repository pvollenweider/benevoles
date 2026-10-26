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

Dans les paramètres, elle s'appelle « Charte des bénévoles » ; sur la page d'inscription, les bénévoles la voient sous le nom « convention des bénévoles ».

**Paramètres**, puis la section **Charte des bénévoles** (réservé aux propriétaires)

La charte est le texte que les bénévoles doivent lire et accepter avant de finaliser leur inscription. Un texte par défaut est fourni ; vous pouvez le personnaliser librement ou le réinitialiser.

- Le commutateur **Assurance RC fournie par l'organisation** indique si votre organisation a une assurance responsabilité civile pour ces activités. Il ne change que le dernier paragraphe du texte par défaut : activé, l'assurance RC de l'organisation couvre les dommages causés à des tiers ; désactivé, chaque bénévole en répond lui-même et vérifie que son assurance RC privée le couvre. Dans les deux cas, la charte demande à chaque bénévole une couverture accidents personnelle (LAA ou assurance équivalente) : une assurance RC ne couvre pas les accidents dont le bénévole serait lui-même victime.
- Si le texte est encore le texte par défaut, changer le commutateur le remplace par l'autre version. Si vous l'avez personnalisé, votre texte n'est pas modifié : un message le signale sous le commutateur, avec le bouton **Mettre à jour le paragraphe sur l'assurance**. Ce bouton montre d'abord ce qui va changer (le paragraphe sur l'assurance remplacé, ou ajouté à la fin s'il n'y en a pas), puis le change seulement si vous confirmez. Le reste de votre texte ne bouge pas.
- Modifier le texte dans la zone de saisie et cliquer sur **Enregistrer**
- Cliquer sur **Réinitialiser la charte par défaut** pour revenir au texte standard

Dans le formulaire d'inscription, les bénévoles cochent la case « J'ai lu et j'accepte la convention des bénévoles ». Le lien « convention des bénévoles » ouvre une fenêtre « Convention des Bénévoles » avec le texte complet et un bouton « J'ai lu et j'accepte », qui coche la case.

Chaque inscription faite par ce formulaire garde la preuve que la personne a accepté la convention : quel texte exactement (le vôtre, ou le texte par défaut dans sa variante d'assurance) et à quelle date. Elle apparaît sous l'inscription, dans la liste **Inscriptions** de l'événement : « Convention acceptée le 5 octobre 2026 à 14h32 (version en vigueur) », à l'heure de votre organisation. Si vous avez modifié la convention depuis, la ligne dit « version précédente » avec le début de l'empreinte de l'ancien texte. Une inscription ajoutée à la main par un organisateur n'en a pas : personne n'a accepté quoi que ce soit dans ce cas. Les inscriptions plus anciennes que cette preuve n'en ont pas non plus.

Le fuseau horaire de l'organisation, dans lequel ces dates sont affichées, se règle sur la même page (voir [Personnaliser l'organisation](personnaliser-l-organisation.md#fuseau-horaire)).
