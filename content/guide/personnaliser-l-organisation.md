---
roles: [admin]
group: organisation
order: 40
summary: Nom, adresse, logo, titre public, fuseau horaire, « Qui est inscrit » par défaut et taux horaire pour valoriser le bénévolat.
related: [charte-du-benevole, equipe-admin, premiers-pas]
legacy: [admin#nom-et-adresse-de-l-organisation, admin#logo-de-l-organisation, admin#titre-de-la-page-publique, admin#fuseau-horaire]
aliases: []
---

# Personnaliser l'organisation

<!-- video: ORG_PUBLIC_IDENTITY -->

Ces réglages sont sur la page **Paramètres** et réservés aux propriétaires.

## Nom et adresse de l'organisation

Sections **Nom de l'organisation** et **Adresse de votre espace** :

- **Nom de l'organisation** : 2 à 100 caractères. Affiché dans l'administration, dans les emails et au-dessus du titre de la page publique.
- **Adresse de votre espace** : l'**Identifiant** qui forme l'adresse (`identifiant.benevol.app`, affichée sous le champ pendant la saisie), 2 à 40 caractères : lettres minuscules, chiffres et tirets, sans tiret au début ni à la fin. Si des événements sont publiés, une confirmation est demandée avant le changement. Après l'enregistrement, vous êtes redirigé(e) vers la nouvelle adresse.
- **Anciens identifiants** : ils continuent de rediriger vers l'adresse actuelle, pour que les liens déjà partagés fonctionnent. **Supprimer** un ancien identifiant arrête cette redirection : les liens qui l'utilisent ne fonctionnent plus.

## Logo de l'organisation

Section **Logo de l'organisation**. Le logo apparaît en haut de la page publique de l'organisation et de chaque événement, sur les feuilles à imprimer des **Documents à imprimer**, sur les badges, sur les attestations de bénévolat et en haut des emails envoyés au nom de l'organisation. Le nom de l'organisation reste toujours écrit à côté : le logo ne le remplace jamais.

- **Choisir une image** : un fichier PNG ou JPEG de 2 Mo au plus (pas de SVG). Un aperçu s'affiche avant l'envoi ; cliquez sur **Enregistrer le logo**. L'image est réduite à 512 pixels de côté au plus et ses métadonnées (date, appareil, position) sont retirées.
- Le logo est affiché sur fond blanc et souvent imprimé en noir et blanc (feuilles, badges en noir et blanc, attestations) : préférez une version foncée sur fond clair ou transparent. Un logo blanc sur fond transparent ne se verrait pas.
- **Remplacer** : choisissez une autre image et enregistrez-la ; elle remplace la précédente partout.
- **Retirer le logo** : après confirmation, il disparaît des pages, documents et prochains emails. Les emails déjà envoyés affichent alors le nom de l'organisation à la place de l'image.
- Dans les emails, le logo est une image chargée depuis benevol.app. Si la messagerie du destinataire bloque les images, elle affiche le nom de l'organisation à la place.

Les changements de logo apparaissent dans le [journal d'activité](journal-d-activite-de-l-organisation.md) (type **Organisation**). Le logo est effacé avec l'organisation.

## Titre de la page publique

Section **Titre de la page publique**. Le titre affiché en haut de la page publique de vos événements (l'adresse de votre organisation, sans nom d'événement). Par défaut : « Bénévoles ». Saisissez le texte de votre choix (2 à 100 caractères) puis **Enregistrer** ; le même texte devient le titre de l'onglet du navigateur. Le nom de l'organisation reste affiché juste au-dessus. **Rétablir « Bénévoles »** revient au titre par défaut. Ce titre ne s'applique pas aux pages d'événement, qui gardent le titre de l'événement.

## Fuseau horaire

Section **Fuseau horaire**. Les heures des créneaux sont des heures locales : ce réglage indique dans quel fuseau les lire. Il sert à envoyer les rappels au bon moment, à indiquer l'heure limite d'une place proposée en liste d'attente, et à afficher les heures du journal de l'événement et des **Documents à imprimer**. Par défaut, c'est le fuseau de la plateforme (Europe/Zurich) ; choisissez-en un autre si vos événements ont lieu ailleurs, puis **Enregistrer**. Changer de fuseau ne modifie pas les heures affichées des créneaux, mais décale le moment où leurs rappels partent.

## Qui est inscrit, réglage par défaut

Section **Qui est inscrit**. La case **Par défaut, montrer aux bénévoles qui est inscrit**, cochée par défaut, donne la valeur de départ du réglage de même nom des événements créés ensuite, sur une page blanche comme depuis un modèle (voir le réglage dans [Créer un événement](creer-un-evenement.md#page-blanche)). Sous la case, une phrase le résume et le lien **En savoir plus** ouvre cette page. Cochez-la ou décochez-la, puis **Enregistrer**. Les événements existants ne changent pas : chacun garde son propre réglage, modifiable dans ses réglages. Une copie faite avec **Dupliquer** reprend le réglage de l'événement d'origine quand ses réglages sont copiés, et ce réglage par défaut sinon (voir [Dupliquer un événement](dupliquer-un-evenement.md)). Dans tous les cas, un nom n'apparaît que si le bénévole l'accepte. En vidéo : [montrer aux bénévoles qui est inscrit](/videos/SHIFT_ROSTER_VISIBILITY#doc).

## Valorisation du bénévolat

Section **Valorisation du bénévolat**. Pour un dossier de subvention ou les comptes annuels, vous pouvez estimer la valeur du travail de vos bénévoles (contribution volontaire en nature) : les heures multipliées par un taux horaire que votre association choisit. Saisissez le **Taux horaire** (par exemple 28,50), choisissez la **Devise** (CHF ou EUR, obligatoire avec un taux), puis **Enregistrer**. La date d'enregistrement s'affiche sous les champs.

Avec un taux, le [résumé de l'événement](rapports-badges-et-resume.md#resume-de-l-evenement) et l'export [Heures par bénévole](gerer-les-membres.md#heures-par-benevole-pour-une-periode-csv) donnent la valeur estimée des heures prévues et des heures attestées, avec le taux utilisé. C'est le taux enregistré au moment où vous les consultez qui compte. Ce n'est pas une valeur officielle : aucun taux n'est proposé, à vous de retenir celui qui convient à votre association et à vos financeurs. Videz le champ puis **Enregistrer** pour retirer le taux : les heures ne sont plus valorisées nulle part.
