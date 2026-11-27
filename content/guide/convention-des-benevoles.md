---
roles: [admin]
group: organisation
order: 50
summary: Personnaliser la convention que les bénévoles acceptent avant de s'inscrire, ou choisir de ne pas en demander, et retrouver la preuve d'acceptation.
related: [personnaliser-l-organisation, suivre-les-inscriptions]
legacy: [admin#charte-du-benevole]
aliases: [charte-du-benevole]
---

# Convention des bénévoles

<!-- video: ORG_TIMEZONE_CHARTER -->

**Paramètres**, puis la section **Convention des bénévoles** (réservée aux propriétaires)

La convention est le texte que les bénévoles lisent et acceptent avant de finaliser leur inscription. Trois situations sont possibles.

- **Le texte par défaut** : il est fourni avec l'application et présenté aux bénévoles tant que vous ne l'avez pas personnalisé. Le commutateur **Assurance RC fournie par l'organisation** choisit son dernier paragraphe : activé, l'assurance RC de l'organisation couvre les dommages causés à des tiers ; désactivé, chaque bénévole en répond lui-même et vérifie que son assurance RC privée le couvre. Dans les deux cas, le texte demande à chaque bénévole une couverture accidents personnelle (LAA ou assurance équivalente) : une assurance RC ne couvre pas les accidents dont le bénévole serait lui-même victime. **Réinitialiser la convention par défaut** rétablit ce texte.
- **Votre propre texte** : modifiez le texte dans la zone de saisie, puis cliquez sur **Enregistrer**. Si le texte est encore un texte par défaut, changer le commutateur d'assurance le remplace par l'autre version. Si vous l'avez personnalisé, votre texte n'est pas modifié : un message le signale sous le commutateur, avec le bouton **Mettre à jour le paragraphe sur l'assurance**. Ce bouton montre d'abord ce qui va changer (le paragraphe sur l'assurance remplacé, ou ajouté à la fin s'il n'y en a pas), puis le change seulement si vous confirmez. Le reste de votre texte ne bouge pas.
- **Aucune convention** : désactivez le commutateur **Demander aux bénévoles d'accepter une convention**, puis cliquez sur **Enregistrer**. Les bénévoles s'inscrivent alors sans accepter de convention : la case et le lien « convention des bénévoles » ne sont plus affichés, et seule la case d'accord sur leurs données reste demandée. La clause d'assurance du texte par défaut ne leur est plus présentée, et vous n'avez aucune trace d'une acceptation. Le texte et le choix d'assurance sont conservés : réactiver le commutateur les rétablit.

Le changement ne s'applique qu'aux inscriptions suivantes. Les inscriptions déjà faites gardent la preuve de ce que la personne a accepté, ou son absence. Une demande d'inscription faite alors qu'aucune convention n'était demandée reste sans preuve même si vous activez la convention avant de la confirmer par courriel : la personne s'est inscrite selon les règles qui lui étaient présentées.

Dans le formulaire d'inscription, les bénévoles cochent la case « J'ai lu et j'accepte la convention des bénévoles ». Le lien « convention des bénévoles » ouvre une fenêtre « Convention des bénévoles » avec le texte complet et un bouton « J'ai lu et j'accepte », qui coche la case.

Chaque inscription faite par ce formulaire garde la preuve que la personne a accepté la convention : quel texte exactement (le vôtre, ou le texte par défaut dans sa variante d'assurance) et à quelle date. Elle apparaît sous l'inscription, dans la liste **Inscriptions** de l'événement : « Convention acceptée le 5 octobre 2026 à 14h32 (version en vigueur) », à l'heure de votre organisation. Si vous avez modifié la convention depuis, la ligne dit « version précédente » avec le début de l'empreinte de l'ancien texte. Une inscription ajoutée à la main par un organisateur n'en a pas : personne n'a accepté quoi que ce soit dans ce cas. Une inscription faite sans convention n'en a pas non plus, et les inscriptions plus anciennes que cette preuve non plus.

Le fuseau horaire de l'organisation, dans lequel ces dates sont affichées, se règle sur la même page (voir [Personnaliser l'organisation](personnaliser-l-organisation.md#fuseau-horaire)).
