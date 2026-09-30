# Écarts entre la politique de confidentialité et l'inventaire

À corriger dans `src/app/legal/privacy/page.tsx` après relecture par une personne qualifiée.

1. **Dropbox manque** dans la liste des sous-traitants (section 4), alors que les sauvegardes chiffrées y sont copiées 90 jours. Si le stockage est hors UE, la section « Transferts » doit le dire, avec les garanties.
2. **« Chaque sous-traitant est lié par un accord de traitement »** : le dépôt ne permet pas de le vérifier. À confirmer pour chacun, ou à reformuler.
3. **Notifications du navigateur** : non mentionnées. Elles transitent par le service de notification du navigateur du bénévole (titre et première ligne d'un message).
4. **Fournisseur SMTP** : la page cite Gandi ; le dépôt ne fixe pas le fournisseur. À confirmer.
5. **Logs de connexion, 90 jours** : la rotation n'est pas automatisée dans le dépôt (procédure manuelle, `k8s/log-rotation.md`). À vérifier sur le serveur, comme l'indique [../retention.md](../retention.md).
6. **Procédure de violation de données** : absente. À écrire (voir l'inventaire).
