# Confirmer son inscription et gérer les erreurs

**Identifiant stable :** `VOLUNTEER_CONFIRMATION_ERRORS`

## Utilité

Comprendre comment reprendre une inscription sans perdre les champs ni créer de doublon.

## Démonstration

1. Remplir le formulaire public et oublier une question obligatoire.
2. Corriger la taille de t-shirt après le vrai message de validation.
3. Rendre le créneau complet dans la base locale pendant la saisie et montrer le refus serveur.
4. Rétablir la capacité, interrompre une requête avec Playwright puis confirmer à nouveau.
5. Rétablir le réseau, confirmer réellement puis ouvrir l’email dans Mailpit.

## Résultat visible

Le formulaire garde les réponses pendant les erreurs. Une inscription réelle est confirmée et son email apparaît dans la boîte locale.

## Points d’attention

La coupure réseau est explicitement annoncée comme une simulation. La capacité change réellement dans la base locale. Le format email ne prouve pas que la boîte existe. Le lien personnel n’est pas affiché sur une confirmation publique ordinaire ; le parcours par invitation, montré dans les modules Invitations, prouve l’identité et peut le fournir.

## Observation produit à évaluer

Le modèle d’email `registration.ts` affiche le message personnalisé tel quel, sans interpoler les variables annoncées dans le formulaire de réglages. Le jeu de données utilise donc un texte sans variable. Ce comportement devra être évalué lors du module consacré aux modèles et variables ; la formation ne doit pas promettre cette interpolation dans l’email sans vérification.
