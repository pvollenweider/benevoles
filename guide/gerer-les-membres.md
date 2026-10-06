---
roles: [admin]
group: membres
order: 10
summary: Le répertoire des bénévoles de l'organisation : ajout, import, adresses à vérifier, heures données et attestation de bénévolat.
related: [inviter-des-membres, doublons-et-fusion, effacer-ou-supprimer-un-membre]
legacy: [admin#gerer-les-membres, admin#heures-par-benevole-pour-une-periode-csv, admin#attestation-de-benevolat]
aliases: []
---

# Gérer les membres

<!-- video: MEMBERS_MANAGEMENT -->

**`/admin/members`**

Le répertoire des membres est le pool de bénévoles connus de votre organisation.

![Répertoire des membres : export, import et ajout, recherche et filtre par étiquette, puis pour chaque membre ses coordonnées, ses étiquettes, ses heures planifiées et les liens Activité, Éditer et Désactiver](/doc-img/admin-members.png)

- **Ajouter** un membre : prénom, nom, email, téléphone, tags, notes internes, et ses **disponibilités** en général (matin, après-midi, soir, plus une remarque comme « pas le dimanche »), facultatives. Le bénévole peut les renseigner lui-même depuis sa page personnelle. Elles s'affichent dans la liste des membres et sous chaque nom dans les inscriptions, et quand vous ajoutez quelqu'un à la main dès que son email correspond à une personne déjà inscrite à l'événement. C'est une information pour vous : rien n'est filtré ni attribué automatiquement.
- **Modifier**, désactiver ou, pour une fiche inactive sans inscription, **supprimer** un membre existant (voir [Effacer ou supprimer un membre](effacer-ou-supprimer-un-membre.md))
- **Importer** des membres en masse : bouton **Importer CSV/Excel** (fichiers `.csv` ou `.xlsx`, 2 Mo et 5000 lignes au plus). Les colonnes sont reconnues par leur intitulé (prénom, nom, email, téléphone, tags ; par exemple `prenom`, `courriel`, `mobile`, `groupes`). Plusieurs tags dans une cellule se séparent par `,`, `;` ou `|`. L'import se fait en deux temps. **Analyser le fichier** montre d'abord, sans rien enregistrer, les membres à créer, à mettre à jour ou ignorés (selon le choix « Si un email existe déjà »), les lignes en erreur avec leur numéro et la raison (nom manquant, email invalide, email en double dans le fichier), et les tags ajoutés ou réutilisés. **Importer** applique ensuite exactement cette analyse. Si des membres ont changé entre-temps, rien n'est enregistré et l'analyse à jour s'affiche, à vérifier avant de confirmer. Les emails sont comparés sans tenir compte des majuscules. Le fichier n'est pas conservé. L'import apparaît une fois dans le journal d'activité de l'organisation, avec les nombres de membres créés et mis à jour. Par organisation, 30 analyses et 10 imports par heure au plus.
- **Rechercher** par texte libre (prénom, nom, email, téléphone) ou filtrer par tag
- **Adresses à vérifier** : une étiquette **Adresse à vérifier** apparaît sur un membre quand un message important (confirmation d'inscription, proposition de liste d'attente, ou rappel pour un créneau proche) a été refusé définitivement par le serveur destinataire, avec la date et une explication neutre (« boîte inexistante ou adresse refusée par le serveur »), jamais une mise en cause de la personne. Un incident temporaire se signale différemment et ne déclenche jamais cette étiquette à lui seul. La case à cocher **Adresses à vérifier**, au-dessus de la liste, filtre sur ces membres et affiche leur nombre. Depuis la ligne d'un membre concerné : **Éditer** corrige l'adresse (le statut disparaît dès qu'une autre adresse est enregistrée, sans attendre un nouvel envoi), **Activité** ouvre ses inscriptions, et **Doublon ?** ouvre les [doublons possibles](doublons-et-fusion.md) de ce membre. Rien n'est bloqué : les envois à cette adresse continuent normalement, l'étiquette n'est qu'un signal.
- **Trier** par prénom, nom, heures planifiées, heures attestées ou dernière participation : cliquer sur l'en-tête de colonne (croissant → décroissant → reset)
- **Activité** : le lien **Activité** d'une ligne ouvre la chronologie du membre, du plus récent au plus ancien : invitations envoyées et utilisées, inscriptions, liste d'attente, annulations, présences, responsabilités de secteur et modifications de la fiche, chacune avec sa date et un lien vers l'événement. Une phrase résume le tout (nombre d'événements, de créneaux, de présences). Ce sont des faits, sans note ni score ; ils disparaissent avec les événements et la fiche.
- **Heures planifiées** : durée totale des créneaux passés sur lesquels le membre a une inscription confirmée, tous événements confondus, qu'il soit venu ou non (seuls les créneaux à venir sont exclus, puisqu'ils ne sont pas encore « donnés »). Un créneau pendant le changement d'heure compte sa durée réelle (une heure de moins au printemps, une de plus en automne).
- **Heures attestées** : parmi ces mêmes créneaux passés, la durée de ceux où une présence a été enregistrée (pointage à l'arrivée), toujours incluse dans les heures planifiées, jamais en plus : un membre présent à chaque créneau a autant d'heures attestées que de planifiées, jamais 0 h attestée pour autant d'heures planifiées.
- **Dernière participation** : la date du dernier créneau passé sur lequel le membre a une inscription confirmée ; un indice sous la date précise celle de la dernière présence enregistrée, ou signale qu'aucune présence n'a été saisie. Rien n'en découle automatiquement (pas de désactivation, pas d'étiquette) : ce sont des faits à votre disposition.

Ces colonnes n'apparaissent que dans cette page ; elles ne sont jamais incluses dans les **Rapports**, potentiellement partagés avec les bénévoles.

## Heures par bénévole, pour une période (CSV)

Le bandeau **Heures par bénévole, pour une période (CSV)**, au-dessus de la liste, exporte un fichier avec une ligne par membre ayant au moins une inscription confirmée sur la période choisie (douze derniers mois par défaut) : nombre d'événements, de créneaux, heures planifiées et heures attestées, puis une ligne de total pour l'organisation. La case **Inclure les membres sans créneau confirmé sur la période** ajoute aussi ceux qui n'ont rien donné sur cette période, à zéro : utile pour répondre à « qui n'a plus participé depuis… » sans écran supplémentaire. Mêmes règles de comptage que l'attestation de bénévolat : seules les inscriptions actives sur un créneau jamais annulé comptent.

![Page « Activité de Camille Rochat » : un résumé en une phrase, puis la chronologie datée, du plus récent au plus ancien, de ses inscriptions, de sa place en liste d'attente et de son invitation, chacune reliée à l'événement](/doc-img/admin-member-activity.png)

## Attestation de bénévolat

Depuis la page **Activité** d'un membre, le lien **Attestation de bénévolat** ouvre un document imprimable à remettre sur demande : logo (s'il y en a un, en gris à l'impression) et nom de l'organisation, nom du bénévole, période choisie (douze derniers mois par défaut), le détail par événement (postes tenus, nombre de créneaux, heures attestées) et une zone de signature. Seules les présences enregistrées (pointage à l'arrivée) comptent comme heures attestées ; un créneau confirmé sans présence enregistrée n'y figure que si vous cochez **Inclure les heures planifiées sans présence saisie**, et apparaît alors séparément, sous l'intitulé « planifiées ». Un avertissement à l'écran (absent de l'impression) liste les créneaux confirmés sans présence enregistrée sur la période choisie. Un texte libre facultatif (par exemple le rôle tenu) peut être ajouté. Un créneau annulé après coup ne compte jamais, même si une présence y avait été enregistrée. Rien n'est conservé : le document est régénéré à chaque demande.
