# Projet d'accord de sous-traitance (article 28 du RGPD)

> **PROJET, non valable en l'état.** Structure établie depuis l'inventaire technique, à faire relire et compléter par une personne qualifiée avant toute utilisation. Les passages entre crochets sont à compléter ou à décider.

## 1. Parties et objet

Entre **[l'organisation cliente]**, responsable du traitement, et **[l'opérateur de benevol.app, identité, adresse]**, sous-traitant. L'accord encadre les traitements de données personnelles effectués par le sous-traitant pour le compte du responsable dans le cadre du service benevol.app : planification de bénévoles, inscriptions, communications.

## 2. Description du traitement

- **Nature et finalités** : hébergement et mise à disposition du service ; inscription des bénévoles aux créneaux ; envoi des emails et notifications décidés par le responsable ; exports.
- **Personnes concernées** : bénévoles et membres du responsable ; ses administrateurs.
- **Catégories de données** : voir [inventaire.md](inventaire.md) (identité, contact, date de naissance si un créneau l'exige, inscriptions, disponibilités, étiquettes et notes, communications). Aucune catégorie particulière (article 9) n'est demandée par le service ; le responsable s'engage à ne pas en saisir dans les champs libres [à décider].
- **Durée** : celle de l'utilisation du service, puis les délais de [../retention.md](../retention.md).

## 3. Obligations du sous-traitant

- Traiter les données uniquement sur instruction documentée du responsable (l'utilisation du service vaut instruction pour les traitements décrits ici).
- Confidentialité des personnes autorisées à traiter les données.
- Mesures de sécurité (article 32) : chiffrement des communications (HTTPS), des sauvegardes (AES-256) et des liens personnels en base (AES-256-GCM, hachage SHA-256) ; isolement des données par organisation, vérifié par des tests ; mots de passe hachés (bcrypt) ; limitation de fréquence ; journal des actions [à compléter par les mesures organisationnelles].
- **Sous-traitants ultérieurs** : liste en [sous-traitants.md](sous-traitants.md). Le responsable est informé de tout ajout ou remplacement [délai de préavis à décider] et peut s'y opposer.
- Aide au responsable pour l'exercice des droits (export, rectification, suppression depuis l'administration ; transmission des demandes reçues par erreur).
- Aide pour la sécurité, les analyses d'impact et les consultations préalables, dans la mesure des informations dont il dispose.
- **Violation de données** : notification au responsable dans les meilleurs délais et au plus tard **[délai, par exemple 48 heures]** après en avoir pris connaissance, avec les informations disponibles [procédure à écrire].
- **Fin du contrat** : export par le responsable, puis suppression selon [../retention.md](../retention.md), sauvegardes comprises à l'issue de leur rotation.
- Mise à disposition des informations nécessaires pour démontrer le respect de ces obligations, et contribution aux audits [modalités à décider].

## 4. Obligations du responsable

Base légale et information des personnes concernées ; exactitude et minimisation des données qu'il saisit ou fait saisir ; usage du service conforme à ces finalités.

## 5. Transferts hors de l'Union européenne

[À établir selon la vérification des sous-traitants : notamment la copie hors site des sauvegardes chiffrées.]

## 6. Droit applicable et signature

[À décider.]
