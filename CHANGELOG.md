# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Unreleased]

### Ajouté

- **Réglages des emails** : dans Paramètres → Emails, chaque organisation choisit quels rappels automatiques partent (J-2, J-1, jour J), si les administrateurs sont prévenus à chaque inscription, et l'adresse à laquelle arrivent les réponses des bénévoles ; un bouton envoie un email de test à votre propre adresse.
- **Lien personnel expliqué** : la page personnelle rappelle que le lien est privé, la date du dernier email qui le contenait, propose de le recevoir à nouveau par email et, si l'organisation a une adresse de contact, d'écrire à l'organisation. Un lien invalide mène à une page qui explique pourquoi et permet de demander un nouveau lien en indiquant son adresse email.
- **Exports et portabilité** : archive JSON complète d'un événement (depuis Rapports), export CSV de tous les membres et de tout le journal d'activité ; le guide administrateur et la politique de confidentialité indiquent les durées de conservation et la procédure de suppression d'une organisation.
- **Emails envoyés** : dans les paramètres, la liste des emails de l'organisation (confirmations, rappels, messages…) avec leur état : en attente, nouvel essai prévu, envoyé, échec définitif, la raison du dernier échec et un bouton **Renvoyer** pour ceux en échec.
- **Santé du service** (super admin) : une page qui rassemble l'état de la base, de la file d'emails, des tâches planifiées (rappels, nettoyage), des sauvegardes (dump, copie hors site, dernier test de restauration), des migrations appliquées, de la version déployée et de la configuration (SMTP, push, secrets). Les tâches enregistrent leur dernier passage ; les sauvegardes le signalent par un battement de cœur.
- **Où en est l'événement ?** : en haut de la page d'un événement, une barre d'étapes (Brouillon → Prêt à publier → Publié → Terminé → Archivé) dit ce qui manque encore et ce que l'étape signifie concrètement : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.
- **Duplication avec choix** : **Dupliquer** ouvre une page où l'on choisit le titre de la copie, son premier jour (toutes les dates sont décalées d'autant) et ce qui suit : créneaux, messages et réglages d'inscription, pages personnalisées, responsables de secteur (décochés par défaut, chacun reçoit un email avec son lien). Un récapitulatif dit ce qui va être créé. Les inscriptions ne sont jamais copiées.
- **Événements non répertoriés** : dans l'édition d'un événement, décocher **Afficher cet événement sur la page publique de l'organisation** le retire de la page d'accueil, de la liste publique et du sitemap (et des moteurs de recherche) tout en le laissant accessible par son lien, avec ses inscriptions. Utile pour un planning réservé aux organisateurs. Ce n'est pas un accès protégé : toute personne qui a le lien peut l'ouvrir. L'administration affiche « Publié — non répertorié » ; les copies et les modèles créent toujours un événement répertorié.
- **Disponibilités des bénévoles** (facultatives) : un bénévole peut indiquer sur sa page personnelle quand il est en général disponible (matin, après-midi, soir) et une remarque ; l'admin le voit et peut le modifier dans la fiche du membre, la liste des membres, les inscriptions et l'ajout manuel. Aucune attribution automatique : chacun choisit toujours ses créneaux.
- **Feuilles à imprimer** : depuis un événement, **Imprimer** propose cinq feuilles lisibles en noir et blanc : planning par jour, planning par poste (avec le responsable), liste avec téléphones (organisateurs), feuille de présence avec cases à cocher et lignes vides, planning individuel par bénévole avec lieux, contacts et consignes.
- **Création en trois étapes** : informations, postes et créneaux, puis une page de vérification qui liste ce qui est prêt et ce qui manque, propose l'aperçu bénévole et publie (ou laisse en brouillon). L'assistant se quitte à tout moment, chaque étape restant une page normale de l'administration.
- **Modifications rapides depuis le planning** : la fenêtre d'un créneau permet de le dupliquer (copie juste après, mêmes réglages), de décaler ses horaires (les inscrits sont prévenus), de fermer ou rouvrir ses inscriptions et d'appliquer un nombre de places à tous les créneaux du poste, jamais en dessous des inscrits déjà confirmés. Ses champs ont désormais des libellés lisibles.
- **Présences** : dans les inscriptions d'un événement, **Marquer présents** note qui est venu (badge **Présent**, compteur, journal), **Annuler la présence** corrige, et **Exporter les présences (CSV)** télécharge la feuille de présence. Sans terminal ni badge : juste savoir qui est venu.
- **Modèles d'événement** : à la création d'un événement, cinq modèles (festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage) créent un brouillon déjà rempli de ses postes et créneaux à partir d'un titre et d'une date. Tout se modifie ensuite comme d'habitude.
- **Écrire aux bénévoles** : depuis un événement, un email avec objet et message à tous les inscrits, aux bénévoles d'un poste ou d'un créneau, ou aux personnes en liste d'attente. Le nombre de destinataires s'affiche, l'aperçu montre l'email tel qu'il sera reçu, et l'envoi est confirmé puis noté dans le journal. Chaque personne le reçoit une fois, avec ses créneaux concernés.
- **Infos pratiques par créneau** : un créneau peut porter un lieu de rendez-vous, une personne de contact (nom, téléphone) et une consigne courte. Le bénévole les retrouve dans l'email de confirmation, les rappels, sa page personnelle et le récapitulatif avant de s'inscrire.
- **Série de créneaux** : dans les créneaux d'un événement, **Créer une série** crée d'un coup tous les créneaux qui se suivent sur une plage horaire (par exemple une buvette de 10 h à 22 h par créneaux de deux heures), avec un aperçu avant création. Chaque créneau reste ensuite modifiable séparément.
- **Où manque-t-il du monde ?** : chaque événement a une page qui répond à cette question : postes sans personne, créneaux à compléter du plus dégarni au plus proche du complet, personnes en liste d'attente, postes sans responsable de secteur, créneaux complets, chaque ligne menant là où on agit. Sur la page de l'événement, le bloc « Créneaux à pourvoir » et ses barres colorées sont remplacés par une phrase (« Il manque encore 12 personnes sur 20 places ») et le lien vers cette page.
- **Recherche globale** : un champ **Rechercher** dans la barre du haut de l'administration (**Ctrl + K**, ou **⌘ + K** sur Mac, pour y aller) retrouve un bénévole, ses inscriptions, un événement ou un créneau dans toute l'organisation, avec un lien vers la page Membres ou les inscriptions déjà filtrées sur le résultat.
- **Aperçu comme un bénévole** : depuis la page d'un événement, **Prévisualiser comme un bénévole** montre la page publique telle que la verront les bénévoles, même pour un brouillon. Le formulaire peut être rempli : l'aperçu affiche alors le message de confirmation et l'email que recevrait le bénévole, sans rien enregistrer ni envoyer.
- **Ce qui demande votre attention** : le tableau de bord commence par les situations à traiter sur vos événements publiés (créneaux bientôt pas complets, places de liste d'attente qui expirent, jalons en retard, invitations non utilisées, postes sans responsable, événement qui commence, événement terminé à archiver), de la plus urgente à la moins urgente, avec un lien vers chacune.
- **Premiers pas** : une nouvelle organisation voit, en haut de la liste des événements et du tableau de bord, la liste des étapes de mise en place dans l'ordre (page publique et charte, fuseau horaire, premier événement, créneaux, publication, inscription de test), avec un lien vers chacune. Les étapes se cochent d'elles-mêmes ; la liste disparaît une fois la mise en place faite, ou peut être masquée.
- **Fuseau horaire par organisation** : dans les paramètres, une organisation peut choisir le fuseau de ses événements (Europe/Zurich par défaut). Il sert aux rappels, à l'heure limite des places proposées en liste d'attente, au journal de l'événement et à l'export PDF.

### Modifié

- **Formulaires des membres** (fiche membre, import, désactivation, responsables de secteur) : même comportement que les formulaires de connexion : erreurs à côté du champ, message conservé, pas de double envoi, panne de réseau expliquée ; la désactivation d'un membre et le retrait d'un responsable demandent une confirmation qui dit ce qui va se passer.
- **Formulaires des créneaux** (création d'un créneau ou d'une série, renommage, couleur et ordre des postes, modifications depuis le planning) : une erreur ou une panne de réseau est expliquée au lieu d'échouer en silence, sans double envoi ; supprimer un créneau ou un poste demande une confirmation qui dit combien de bénévoles sont inscrits et qu'ils seront prévenus.
- **Formulaires de l'événement** (jalons, pages d'information, invitations, relances, rappel manuel) : une erreur ou une panne de réseau est expliquée, la sélection ou la saisie est conservée et **Réessayer** est proposé ; supprimer un jalon ou une page demande une confirmation.
- **Super-admin** : désactiver, réactiver ou supprimer une organisation et envoyer une communication aux administrateurs passent par une confirmation qui dit ce qui va se passer (la suppression demande de taper l'identifiant dans la fenêtre, plus dans une boîte du navigateur) ; la création d'une organisation signale le champ à corriger et une panne de réseau.
- **Annuler un retrait** : après confirmation, retirer des bénévoles de leur créneau laisse 10 secondes pour changer d'avis ; pendant ce temps rien n'est enregistré ni envoyé, **Annuler le retrait** remet les lignes en place et **Retirer maintenant** n'attend pas.
- **Actions sensibles** : retirer des bénévoles, désigner des responsables, renvoyer des liens ou relancer des invités passe par une confirmation qui récapitule ce qui va se passer (personnes concernées, emails envoyés, places proposées à la liste d'attente) ; une fois l'action faite, un lien **Voir dans le journal** ouvre le journal de l'événement à la bonne date.
- **Formulaires de connexion et d'accès** (connexion, mot de passe oublié, nouveau mot de passe, activation d'un compte, invitation d'un administrateur) : erreurs affichées à côté du champ concerné et annoncées, message conservé après succès, protection contre les doubles envois, panne de réseau expliquée au lieu d'un écran figé, remplissage automatique adapté aux gestionnaires de mots de passe.
- **Après une erreur** : sur le formulaire d'inscription, une erreur garde tout ce qui a été saisi et dit de quoi il s'agit (champ à corriger, créneau plus disponible, connexion interrompue, erreur du serveur), avec **Réessayer** quand c'est utile et l'assurance qu'un second envoi ne crée pas de doublon ; dans les inscriptions d'un événement, une action groupée qui échoue garde la sélection, explique si quelque chose a pu être appliqué et propose **Réessayer**.
- **Récapitulatif avant de confirmer** : sur la page d'inscription, le récapitulatif reprend les créneaux choisis dans l'ordre avec le jour et les heures (« fin le lendemain » quand un créneau passe minuit), ce qui les sépare (enchaînés, pause, chevauchement signalé avant l'envoi), inscription ferme ou liste d'attente, âge minimum, et la liste exacte des données transmises à l'organisation.
- **Liste d'attente expliquée** : la même explication en cinq points (inscription pas encore confirmée, ordre, email avec 24 heures pour prendre la place, comment accepter, ce qui se passe sans réponse) apparaît dans le récapitulatif avant confirmation, sur la page de succès, dans l'email et sur la page personnelle, qui montre désormais aussi les inscriptions en liste d'attente avec leur position et, quand une place est proposée, le délai et le lien pour la prendre.
- **Accessibilité** : un lien « Aller au contenu », visible dès qu'on le tabule, ouvre chaque page de l'administration et saute la barre du haut.
- **Interne** : le fichier `src/middleware.ts` devient `src/proxy.ts`, la convention Next.js 16 ; comportement identique (protection des pages admin, en-tête `x-org-slug`).
- **Recherche sans accents** : la recherche globale et les filtres des pages Membres et Inscriptions ignorent les accents : « zoe » trouve Zoé, « francois » trouve François.
- **Rapports** : le lien « Imprimer » de la page d'un événement devient **Rapports** et regroupe l'export complet (en premier) et les feuilles à imprimer ; le lien « Exporter PDF » séparé disparaît. Les plannings par jour, par poste et individuels reprennent la frise de l'export complet, en noir et blanc, avec les prénoms dans les créneaux ; en-têtes, tableaux et feuille de présence ont été redessinés pour l'impression.
- **Où manque-t-il du monde ?** : la page s'ouvre sur une vue d'ensemble (places pourvues, barre de remplissage, phrase de synthèse) ; chaque créneau montre son taux de remplissage à côté des chiffres ; les groupes portent leur compteur ; un message confirme quand il n'y a rien à faire.
- **Publication** : un événement ne peut plus être publié sans créneau, quel que soit le chemin (formulaire d'édition, bouton Publier, API) ; le message l'explique. La création se fait toujours en brouillon, le choix du statut n'apparaît plus à cette étape.
- **Infos pratiques d'un créneau** : la personne de contact et son téléphone ne sont plus visibles sur la page publique d'inscription ; ils ne sont envoyés qu'aux inscrits (confirmation, rappels, page personnelle). Le lieu et la consigne restent publics.

- **Barre du haut de l'administration sur mobile** : sur un petit écran, les liens sont regroupés sous un bouton **Menu** au lieu de déborder de l'écran ; le menu du compte reste accessible. La page en cours est aussi soulignée, en plus d'être en couleur.
- **Menu du compte** : dans la barre du haut, votre nom ouvre un menu avec **Mon compte** et **Se déconnecter**. Le changement de mot de passe quitte la page Paramètres pour une page **Mon compte** dédiée, avec des libellés et messages d'erreur désormais en français.
- **Limitation des tentatives** (connexion, inscription, liens de gestion, mot de passe oublié) : les compteurs sont désormais stockés dans la base de données. Ils ne sont plus remis à zéro à chaque redéploiement et restent justes si l'application tourne sur plusieurs instances.
- **Emails plus fiables** : l'offre et la confirmation de place en liste d'attente, les avis de créneau modifié ou annulé, l'invitation d'un responsable de secteur, l'invitation et la bienvenue d'un admin et la réinitialisation de mot de passe passent eux aussi par la file d'envoi : l'action n'attend plus l'envoi, et un email en échec est renvoyé automatiquement.
- **Inscription plus rapide et emails plus fiables** : la confirmation d'inscription s'affiche sans attendre l'envoi des emails (confirmation, notification aux admins et aux responsables, liste d'attente), qui partent juste après ; un email qui échoue est renvoyé automatiquement plusieurs fois au lieu d'être perdu.
- **Actions groupées sur les inscriptions** (retirer de leur créneau, rendre responsable, renvoyer le lien) : une seule opération pour toute la sélection au lieu d'une par ligne, plus rapide ; rien n'est fait si une des inscriptions sélectionnées n'est pas (ou plus) valide. « Renvoyer le lien » n'envoie plus qu'un email par bénévole, même si plusieurs de ses inscriptions sont sélectionnées.

### Corrigé

- **Duplication d'un événement** : les créneaux copiés gardent leur âge minimum, leur liste d'attente et la couleur choisie pour le poste (#356).
- **Dernier créneau annulé** : annuler le dernier créneau actif d'un événement publié (ou supprimer son dernier poste) le repasse en brouillon au lieu de laisser une page publique vide ; l'administration le signale et le journal le note.
- **Création d'événement** : l'API ne peut plus créer un événement directement archivé ; tout statut envoyé à la création est ignoré.
- **Formulaire d'édition** : après un refus de publication, le statut revient au dernier statut confirmé par le serveur, et non à celui affiché à l'ouverture de la page.
- **Message à la liste d'attente** : le bouton « Gérer mes inscriptions » menait à une page « introuvable » (la page personnelle n'ouvre que les inscriptions confirmées) ; les messages à la liste d'attente n'ont plus de lien.
- **Assistant de création** : revenir à l'étape « Informations » garde l'indicateur d'étapes et un bouton pour continuer ; une coupure réseau à la création ne bloque plus le formulaire.
- **Erreurs serveur** : les réponses d'erreur de la modification d'un événement et de l'import de membres ne contiennent plus de détails techniques.

- **Emails liés à une action** : ils sont désormais enregistrés dans la même transaction que l'action elle-même (inscription, offre et confirmation de place en liste d'attente, créneau modifié ou annulé, ajout d'un responsable de secteur, invitation et activation d'un admin, réinitialisation de mot de passe). Un arrêt du serveur au mauvais moment (redéploiement, plantage) ne peut plus laisser l'action faite sans son email, par exemple une inscription sans confirmation ou une place proposée sans que la personne en soit avertie.
- **Journal de l'événement** : après « Générer l'état initial », le message annonçait « états initialaux générés » au lieu de « états initiaux générés ».
- **Adresses email** : les majuscules et espaces ne sont plus pris en compte ; `Alice@Exemple.ch` et `alice@exemple.ch` désignent le même bénévole ou le même admin (connexion comprise), au lieu de créer deux fiches. Les adresses existantes sont converties en minuscules, sauf les rares doublons qui ne diffèrent que par la casse, laissés tels quels pour un traitement manuel.
- **Heures des rappels et des emails** : les heures des créneaux étaient traitées comme des heures UTC, ce qui décalait de 1 h (hiver) ou 2 h (été) les rappels « jour J » et l'heure d'expiration affichée dans l'email d'offre de liste d'attente ; même décalage dans les heures du journal de l'événement et de l'export PDF. Elles sont désormais calculées dans le fuseau des événements (Europe/Zurich).
- **Doublons d'adresses email** : la base de données refuse désormais deux fiches (bénévoles d'une même organisation, admins, responsables d'un même secteur) dont l'adresse ne diffère que par les majuscules ou des espaces, en plus de la normalisation déjà faite par l'application.
- **Statuts en base** : les contraintes sur les valeurs de statut s'appliquent désormais aussi aux lignes existantes (vérifiées au préalable en production), et non plus seulement aux nouvelles.
- **Configuration du fuseau horaire** : une valeur `APP_TIME_ZONE` invalide empêche désormais l'application de démarrer, avec un message explicite, au lieu de faire échouer plus tard les rappels, les emails, l'export PDF ou le journal.
- **Inscription refusée** : une inscription publique refusée (créneau complet entre-temps, chevauchement, doublon) ne laisse plus de fiche membre créée pour une nouvelle adresse email.

### Sécurité

- **Sessions admin après un changement de mot de passe** : changer ou réinitialiser son mot de passe déconnecte désormais toutes les autres sessions ouvertes auparavant (autres navigateurs, appareils, ou session volée). La session depuis laquelle le mot de passe est changé reste ouverte.
- **Changement de mot de passe** : la vérification du mot de passe actuel (page « Mon compte », profil du super admin) est limitée à 5 échecs par compte et 20 par adresse IP sur 15 minutes. Une session volée ne peut plus essayer des mots de passe à l'infini.
- **Longueur maximale des mots de passe admin** : un nouveau mot de passe est limité à 72 octets en UTF-8, la limite réellement prise en compte par le chiffrement (bcrypt). Une lettre accentuée occupe 2 octets, un emoji jusqu'à 4. Les mots de passe plus longs déjà définis continuent de fonctionner à la connexion.
- **Lien de gestion après inscription** : il n'est plus affiché sur la page de succès pour une adresse email nouvelle, seulement envoyé par email : n'importe qui pouvait inscrire une autre personne avec une adresse encore inconnue de l'organisation et obtenir son lien. Il reste affiché pour une inscription depuis un lien d'invitation membre.
- **Liens personnels des bénévoles, responsables de secteur et invitations** : ne sont plus lisibles dans une copie de la base une fois la clé `TOKEN_ENCRYPTION_KEY` configurée. La base ne garde qu'une empreinte (pour reconnaître un lien) et une copie chiffrée (pour renvoyer le lien par email) ; les liens existants sont chiffrés automatiquement par la tâche de nettoyage quotidienne et restent valables.

## [1.15.0] — 2026-09-28

### Ajouté

- **Téléphone obligatoire, par événement** : nouvelle option dans les paramètres de l'événement pour exiger un numéro de téléphone sur le formulaire d'inscription public (désactivée par défaut, reprise lors d'une duplication). Le numéro saisi est enregistré avec l'inscription et affiché en priorité dans la liste des inscriptions, l'export PDF et la page du responsable de secteur, y compris pour un bénévole déjà connu dont la fiche n'est pas modifiée par le formulaire public.
- **Renvoyer le lien de gestion** : action sur la page des inscriptions pour réémettre par email le lien personnel `/my/[token]` d'un ou plusieurs bénévoles qui l'ont perdu ou supprimé par erreur.
- **Badge « Responsable » sur les inscriptions** : affiché sur une ligne quand ce bénévole est déjà responsable du poste de son créneau.
- **Nombre de places sur le planning public visible sur mobile** : le compteur (« 3/5 ») et l'heure de début s'affichent désormais dès qu'une barre de créneau est un peu plus large que le minimum, plutôt que de rester vides sur les tailles courantes sur téléphone.
- **Lien « Soutenir le projet »** dans le pied de page du site benevol.app et de la documentation (jamais sur les pages d'une organisation, de ses bénévoles ou de l'admin).
- **Heures cumulées par membre** (`/admin/members`) : colonne triable indiquant le total du temps sur des créneaux actifs, tous événements confondus. Volontairement absente de l'export PDF pour ne pas exposer un classement entre bénévoles.

### Modifié

- **Page des inscriptions** : les boutons par ligne (rendre responsable, renvoyer le lien, annuler) sont retirés au profit d'une sélection (cases à cocher) suivie d'une action dans la barre d'outils qui apparaît — la même mécanique que les actions groupées, désormais utilisée aussi pour une seule inscription. Le bouton « Annuler » est renommé « Retirer de leur créneau » pour éviter toute ambiguïté avec l'annulation d'une action en cours, et pour ne pas laisser croire à un retrait du rôle de responsable de secteur.

### Corrigé

- **Planning public** : le nombre de places restantes s'affiche dans la barre du créneau, et l'âge minimum d'un créneau sélectionné est rappelé dans la carte « Créneaux sélectionnés ».
- **Emails** : le texte de tous les emails (confirmations, rappels, invitations…) était centré par erreur ; il est désormais aligné à gauche, dans une mise en page un peu plus large.
- **Accessibilité du bouton de rappels push** : le résultat (« Rappels push activés » ou notifications bloquées) est annoncé aux lecteurs d'écran et reçoit le focus quand le bouton disparaît ; contraste du message de succès renforcé ; icônes décoratives masquées aux technologies d'assistance.
- **Inscriptions simultanées** : deux inscriptions envoyées en même temps pour la dernière place ne peuvent plus dépasser la capacité du créneau, un double envoi du formulaire ne crée plus deux inscriptions, et deux désistements simultanés proposent bien deux places à deux personnes différentes de la liste d'attente. Une place proposée à la liste d'attente reste réservée jusqu'à confirmation ou expiration. Les éventuels doublons existants (même personne inscrite deux fois au même créneau) sont annulés à la mise à jour, en gardant la plus ancienne inscription.
- **Âge minimum** : l'âge est désormais vérifié à la date du créneau et non à la date d'inscription ; un bénévole qui atteint l'âge requis entre son inscription et le créneau n'est plus refusé.
- **Super admin sans organisation sélectionnée** : l'espace admin ne bascule plus silencieusement sur la plus ancienne organisation ; il renvoie vers la liste des organisations pour en choisir une. L'en-tête affiche aussi désormais l'organisation réellement sélectionnée (il affichait toujours la plus ancienne).
- **Export PDF** : les heures qui passent minuit s'affichaient en brut au-delà de 23h (« 24h », « 26h ») au lieu de repartir à zéro ; la colonne « Libellé » s'affichait vide quand aucun créneau du jour n'avait de libellé distinct de son poste.
- **Sentry** : filtre le bruit bénin « The destination stream closed early » (abandon client, pas une erreur applicative).

### Sécurité

- **Inscription publique avec l'adresse email d'un autre bénévole** : le formulaire ne renvoie plus le lien de gestion d'un bénévole déjà connu (ni en cas d'inscription en double, ni après une nouvelle inscription), et ne modifie plus ses informations enregistrées (nom, téléphone, date de naissance). Le lien part uniquement par email, sauf pour une adresse nouvelle ou une inscription depuis un lien d'invitation membre. Deux inscriptions simultanées d'une même personne à des créneaux qui se chevauchent ne peuvent plus passer toutes les deux.
- **Isolation entre organisations renforcée** : toutes les opérations de l'espace admin sur les données d'une organisation (lectures, modifications, suppressions, créations, y compris pages d'événement, responsables de secteur, échéances et journaux) sont désormais limitées à l'organisation par construction, et non plus seulement par une vérification faite route par route.
- **Sessions admin** : un admin désactivé ou supprimé, ou un admin dont l'organisation est désactivée, perd immédiatement l'accès au lieu de le garder jusqu'à l'expiration de sa session (30 jours) ; un changement de rôle s'applique sans reconnexion.
- **Connexion admin** : après 10 échecs sur un même compte ou 30 depuis une même adresse IP en 15 minutes, les tentatives suivantes sont refusées jusqu'à la fin de la fenêtre.
- **Liens d'activation et de réinitialisation de mot de passe admin** : seule une empreinte (SHA-256) est conservée en base, jamais le lien lui-même ; une copie ou une sauvegarde de la base ne permet plus de prendre le contrôle d'un compte admin. Les liens déjà envoyés restent valables. Renvoyer l'invitation d'un compte en attente génère désormais un nouveau lien (l'ancien cesse de fonctionner).
- **Abonnements push** : s'abonner aux rappels push exige désormais le lien de gestion du bénévole (token d'inscription) au lieu d'une simple adresse email, et l'abonnement est rattaché au bénévole (donc à son organisation). Auparavant, n'importe qui pouvait abonner son navigateur à l'adresse email d'un autre bénévole et recevoir ses rappels, qui contiennent le lien `/my/[token]`. Les abonnements existants sont supprimés ; un navigateur déjà abonné est ré-enregistré automatiquement à la prochaine visite de la page de gestion.

## [1.14.0] — 2026-09-26

### Ajouté

- **Renommer ou supprimer un poste** : le panneau « Gérer les postes » (ex-« Réordonner les postes ») permet, poste par poste, de renommer d'un coup tous ses créneaux (refuse un nom déjà pris par un autre poste, pour ne pas fusionner deux postes par erreur) ou de tous les annuler — même confirmation et notification des bénévoles qu'une suppression de créneau individuelle.
- **Couleur d'un poste** : un point coloré cliquable dans « Gérer les postes » ouvre un choix parmi 16 couleurs prédéfinies (ou « Automatique »), appliqué à la timeline admin et à la page publique.
- **Documentation publique adaptée au mobile, avec un thème sombre** : les pages `/doc` s'affichent correctement sur petit écran (plus de débordement horizontal, zones de clic des liens de navigation agrandies) et proposent un bouton clair/sombre indépendant des préférences système, mémorisé d'une visite à l'autre.
- **Markdown complet dans les communications admin** : le composeur de « Nouveautés produit » et le message de confirmation d'inscription acceptent la syntaxe Markdown complète (titres, gras, italique, listes, citations, code, tableaux, texte barré, listes de tâches, liens automatiques), plus seulement le gras, les liens et les puces.
- **Adresse personnalisée pour « Envoyer un test »** : un champ optionnel permet d'envoyer l'email de test des « Nouveautés produit » à une adresse différente de celle du compte super-admin connecté, sans que cet envoi soit compté dans l'historique des diffusions.
- **Actions groupées sur la liste des inscriptions** : sélection multiple par cases à cocher (avec case d'en-tête pour tout sélectionner) pour annuler plusieurs inscriptions d'un coup ou désigner plusieurs responsables de secteur en une seule action.
- **Nombre de places sur le planning public** : chaque créneau affiche désormais, comme sur la timeline admin, le nombre d'inscrits sur la capacité totale (ex. « 3/5 »), pour faciliter la réservation en petit groupe.

### Corrigé

- **Ordre des postes qui change tout seul** : ajouter ou modifier un créneau d'un poste déjà réordonné pouvait ramener ce poste en tête de la timeline sans action volontaire de l'admin.
- **Duplication d'un événement** : les créneaux déjà supprimés de l'événement source réapparaissaient (rouverts) dans la copie.
- **Noms de postes tronqués** sur la timeline, surtout sur mobile (ex. « Chauffeurs... ») — les noms longs passent maintenant sur deux lignes.
- **Export PDF** : le planning affichait parfois la journée entière (00h–24h) au lieu de la plage réelle des créneaux ; l'ordre des postes dans l'export ne suivait pas toujours l'ordre choisi via « Gérer les postes ».
- **Menu admin sur deux lignes** pour un compte super-admin : les liens « Organisations » et « Communications admin » (ex-« Nouveautés produit ») sont regroupés dans un menu déroulant « Super Admin ».
- **Documentation** (`/doc`) : le pied de page ne reprenait pas le vrai pied de page du site (numéro de version, lien « Espace organisateur »…) ; plusieurs URLs d'exemple montraient l'organisation comme un segment de chemin (`/[org]/[évènement]`) au lieu du sous-domaine réel (`[org].benevol.app/[évènement]`) ; quelques libellés de l'interface décrits dans les guides ne correspondaient plus exactement à l'interface actuelle (inscriptions, créneaux à pourvoir, liste d'attente).
- **Heure de fin d'un nouveau créneau affichée « NaN:NaN »** pendant la saisie de l'heure de début, avant qu'elle ne soit complète ; l'écart par défaut proposé pour l'heure de fin passe de +1h30 à +1h.
- **Un nouveau poste rejoignait le début d'une liste réordonnée manuellement** au lieu de s'ajouter à la fin, dès son premier créneau.

---

## [1.13.0] — 2026-09-25

### Ajouté

- **Pages personnalisées d'événement** : en plus du champ unique « instructions publiques », un événement peut avoir plusieurs pages libres (règlement, FAQ, accès, ce qu'il faut apporter…), rédigées en Markdown par l'organisateur et rendues de façon sécurisée (`marked` + DOMPurify, allowlist explicite de balises/attributs, assainies à l'affichage et non à l'écriture). Gestion admin (créer, modifier, réordonner au clavier, supprimer) ; page publique `/[eventSlug]/[pageSlug]` ; liens listés sous les instructions publiques de l'événement ; modifications tracées dans le journal de l'événement (titre et adresse seulement, jamais le contenu).
- **robots.txt et sitemap.xml** : n'existaient pas auparavant — tout était indexable par défaut, y compris les URLs à jeton (`/my/[token]`, `/waitlist/[token]/confirm`) et les routes `/admin`, `/api/`. `robots.ts` interdit désormais ces routes sur le domaine de production, et interdit tout sur le sous-domaine de préproduction, tout hôte hors domaine de production et en développement. `sitemap.ts` est multi-tenant par sous-domaine : chaque organisation n'a que ses propres événements publiés et leurs pages personnalisées dans son `sitemap.xml`.
- **Responsables de secteur** : un ou plusieurs bénévoles peuvent être désignés responsables d'un poste (ex. « Bar »), avec un lien personnel (sans compte à créer) affichant en lecture seule qui est inscrit sur leur poste — nom, email, téléphone, groupés par créneau. Email de notification à chaque nouvelle inscription sur leur poste. Deux raccourcis pour éviter de ressaisir un nom déjà connu : « Depuis les inscrits » sur la page des responsables, et le bouton « Rendre responsable » directement depuis une ligne de la page des inscriptions. La fiche du bénévole concerné (`/admin/members`) reçoit automatiquement le tag « responsable », retiré quand il ne reste plus responsable d'aucun secteur.
- **Journal de l'événement** : historique complet (créneaux, inscriptions, pages, responsables, paramètres de l'événement, invitations) avec trois modes — **Explorer** (liste filtrable), **Rejouer** (reconstitue l'état d'une entité à un instant donné) et **Récit** (raconte en une phrase une chaîne d'événements liés, ex. une annulation qui déclenche une offre de liste d'attente). Une génération de référence (« baseline ») reconstitue un point de départ pour les créneaux et inscriptions antérieurs à cette fonctionnalité, visuellement distincte d'une action réelle. Aucune donnée personnelle des bénévoles ni contenu de page n'est jamais journalisé.
- **Journal d'activité de l'organisation** (`/admin/settings/activity`) : équivalent du journal d'événement pour les entités qui appartiennent à l'organisation et non à un événement précis — création/modification/désactivation d'un membre, invitation/retrait d'un compte admin. Liste filtrable, avec les mêmes principes de confidentialité (jamais de valeurs, seulement les champs modifiés).
- **Jalons de l'événement** : checklist simple de dates clés (ex. « Fermer les inscriptions », « Envoyer les rappels ») sur la page de l'événement — titre, échéance, coché ou non. Purement informatif, un jalon dépassé et non coché est mis en évidence.
- **Âge minimum sur un poste** : un créneau peut exiger un âge minimum (majorité, permis de conduire…). Affiché en info sur le planning public (ex. « 18+ »), le créneau reste sélectionnable — la date de naissance n'est demandée dans le formulaire d'inscription que si un créneau sélectionné l'exige, et l'inscription est refusée côté serveur si la condition n'est pas remplie.
- **Broadcasts produit aux beta-testeurs** : le super-admin peut rédiger (Markdown, aperçu en direct) et envoyer un email « nouveautés » à tous les comptes admin de toutes les organisations, avec envoi de test et historique des envois. Chaque compte admin peut se désinscrire (lien signé, sans jeton stocké) ; désinscription distincte du fait d'avoir un compte.
- **Documentation publique** (`/doc`, `/doc/admin`, `/doc/benevole`) : les guides administrateur et bénévole sont maintenant des pages publiques sur benevol.app, avec captures d'écran et FAQ, au lieu de fichiers Markdown lisibles seulement sur GitHub — liées depuis le pied de page public et depuis la barre de navigation admin (« Aide »).
- **Copie de sauvegarde hors site (Dropbox)** : `cronjob-backup-offsite.yaml` copie chaque nuit les fichiers déjà chiffrés du dump vers Dropbox via `rclone` (upload seulement, jamais de suppression côté Dropbox pilotée par la rotation locale), avec une rétention de 90 jours côté Dropbox, plus longue que les 30 jours du volume local. Mise en place documentée dans `docs/deploiement.md` (jeton OAuth à créer en local, jamais dans le dépôt).

### Corrigé

- **Build Docker de production cassé** : `.dockerignore` exclut tous les fichiers `.md`, y compris `GUIDE_ADMIN.md` et `GUIDE_BENEVOLE.md` que `next build` lit à la génération statique de `/doc/admin` et `/doc/benevole` (nouveauté ci-dessus) — le build échouait (`ENOENT`) dès le premier déploiement de cette version. Les deux fichiers sont maintenant explicitement réinclus.
- **Horaires des créneaux** : ils sont bornés à `00:00`–`23:59`. Le glisser-déposer du planning administrateur pouvait écrire des heures comme `24:00`–`26:00`, voire négatives (`-2:-15`), sans aucun contrôle ; l'horloge repart désormais à zéro après minuit (`fromMin` ramène au jour), l'API refuse les heures hors plage ou identiques avec un message lisible, et le formulaire n'altère plus en silence une heure invalide. Un créneau de nuit s'écrit avec une fin plus petite que le début (`22:00`–`02:00`, affiché « 22h–02h +1 ») ; les anciennes valeurs restent lisibles (affichées modulo 24) et une requête de correction est documentée dans `docs/deploiement.md`.
- **Planning public** : le graphique de chaque jour occupe toute la largeur de la carte (il était comprimé à environ 300 px les jours qui comptent un long créneau, ce qui chevauchait les heures et coupait les textes) ; mise en page fluide en pourcentage, défilement horizontal sur mobile, texte des barres affiché seulement quand il tient, heures de l'axe qui repartent à zéro après minuit et espacées quand la journée est longue, textes plus lisibles, région de défilement nommée.
- **Conflits d'horaires** : la détection de chevauchement comprend maintenant les créneaux qui passent minuit et les chevauchements entre deux dates (côté bénévole et côté administrateur).
- **Lien d'invitation admin expiré** : la tâche planifiée de nettoyage effaçait le jeton d'invitation dès son expiration (7 jours), avant même que la personne invitée n'ait cliqué dessus ; le lien affichait alors le même message générique « invalide ou déjà utilisé » qu'un lien réellement déjà utilisé, au lieu du message « Ce lien a expiré » prévu pour ce cas. Le nettoyage ne touche plus ce jeton avant expiration ; il continue d'être supprimé avec le compte inactif au bout de 30 jours.
- **Sauvegardes de la base de données** : chaque exécution du backup nocturne échouait silencieusement depuis sa création (début mai 2026) — l'image utilisée n'a jamais fourni la commande `openssl`, et l'ancien script ne détectait pas l'échec du chiffrement caché derrière un tube (`pg_dump | gzip | openssl`) ; 144 jours de fichiers de sauvegarde vides, sans alerte. Le script installe désormais `openssl`, vérifie la taille du dump, et re-déchiffre chaque fichier produit pour confirmer qu'il correspond au dump avant de le conserver ; toute anomalie fait échouer le job au lieu de produire un fichier vide. Le manifeste (`k8s/cronjob-backup.yaml`) est maintenant appliqué à chaque déploiement comme les autres tâches planifiées, ce qui n'était pas le cas. Voir `docs/deploiement.md` : aucune sauvegarde antérieure au 22/09/2026 n'est utilisable.
- **Sentry** : n'est plus actif qu'en production. Le développement local et les tests E2E chargeaient le vrai DSN depuis `.env` et envoyaient leurs erreurs (environnement `development`) dans le projet Sentry de production. Le bruit de l'extension navigateur MetaMask (« Failed to connect to MetaMask », injecté par l'extension elle-même sur chaque page, sans rapport avec l'application) est maintenant filtré, comme les autres extensions déjà exclues (`__firefox__`, DarkReader, `window.ethereum`).

### Accessibilité

- Contraste insuffisant corrigé sur plusieurs écrans neufs de cette version (liens de navigation super-admin, texte des commentaires sur le roster public des responsables, texte d'aide du champ « Âge minimum », actions du journal des jalons).
- Focus, sémantique de titres et annonces aux lecteurs d'écran revus sur les nouvelles interfaces (formulaire d'ajout de responsable, listes filtrables des journaux, formulaire du champ âge minimum) — voir le détail dans chaque pull request associée (#186, #189, #192, #194, #195, #200).

---

## [1.12.0] — 2026-09-20

### Ajouté

- **Documentation** : `README.md`, les guides administrateur et bénévole, `FONCTIONNALITES.md`, `CONTRIBUTING.md` et `SECURITY.md` sont remis à jour d'après le code (variables d'environnement, scripts, tâches planifiées, structure, modèle de données). Nouvelles pages dans `docs/` : architecture, configuration, déploiement, rôles et permissions, API. Les captures d'écran du README sont refaites (page d'accueil, timeline sur ordinateur et sur mobile, à partir de l'événement de démonstration du seed).
- **Tests E2E** : isolation de la suppression d'événement entre organisations, titre de la page publique, formulaires de réglages.
- **Titre de la page publique modifiable** : chaque organisation peut définir le titre affiché en haut de sa page publique (et dans l'onglet du navigateur) depuis les paramètres ; « Bénévoles » par défaut. Le nom de l'organisation reste affiché au-dessus. Migration `0007_org_public_title`.
- **Archiver et supprimer un événement** : bouton « Archiver » sur la page de l'événement, et suppression définitive possible uniquement pour un événement archivé. La fenêtre de confirmation affiche un avertissement fort avec le nombre de créneaux, d'inscriptions et d'invitations effacés, propose d'ouvrir l'export PDF avant de supprimer et demande de saisir le titre de l'événement (sans tenir compte des accents ni de la casse). Les bénévoles ne sont pas prévenus. Un bandeau confirme la suppression sur la liste des événements.

### Corrigé

- **Page publique d'une organisation** : les événements terminés ne s'affichent plus comme ouverts avec des places à pourvoir ; les badges de statut suivent `DESIGN.md` (places à pourvoir en vert, complet en bleu) ; la page d'accueil du site n'exécute plus la requête sur tous les événements pour afficher la page de présentation ; le pied de page a un lien « Espace organisateur » vers la connexion.
- **Membres** : le bouton « Importer un fichier » de l'état vide menait à une page inexistante (404) ; il ouvre maintenant la fenêtre d'import.
- **Accessibilité** : les fenêtres « Envoyer le rappel » et « Inviter des membres » ont une vraie sémantique de dialogue (titre lié, Échap, piège de focus, retour du focus, verrou de défilement) via un composant partagé ; le texte gris trop clair (2,5:1) est remplacé sur 22 fichiers ; `DESIGN.md` réserve « Encre Fantôme » au décoratif.
- **Infrastructure** : les sondes Kubernetes de l'application interrogent `/api/health` avec des délais de 3 et 5 s (des échecs par délai apparaissaient pendant les déploiements) ; la sonde Postgres passe par un shell (elle journalisait `FATAL: role "root" does not exist` toutes les 5 s) ; l'image du webhook Gandi se construit de nouveau (Go 1.25) et est validée à chaque pull request.
- **Données de démonstration** : les dates du seed correspondent aux jours annoncés (samedi 13 et dimanche 14 juin 2026).
- **Réglages de l'organisation** : les formulaires « Nom de l'organisation » et « Identifiant public (slug) » ont désormais des étiquettes, des textes d'aide, des messages de succès et d'erreur annoncés aux lecteurs d'écran, des contrastes conformes et des noms explicites sur les boutons de suppression des anciens identifiants. L'adresse affichée par le formulaire du slug est calculée côté serveur, ce qui supprime une erreur d'hydratation React sur cette page.

### Sécurité

- **Sentry** : `sendDefaultPii` passe à `false` (plus d'adresse IP, de cookies ni d'en-têtes de requête envoyés) sur le navigateur, le serveur et l'edge ; `includeLocalVariables` est désactivé côté serveur (il ouvrait l'inspecteur Node et joignait les valeurs des variables locales aux événements). Les jetons d'accès contenus dans les URLs (`/my/…`, `/waitlist/…/confirm`, `?token=…`) sont masqués dans les événements, transactions, spans et fils d'Ariane avant envoi. La politique de confidentialité cite désormais Sentry (région UE) comme sous-traitant.
- **Route publique supprimée** : `GET /api/public/events/[slug]` n'était appelée nulle part et cherchait un événement par slug sans filtrer par organisation, alors que le slug n'est unique que par organisation.
- **Dépôt** : le binaire compilé du webhook Gandi (83 Mo) n'est plus suivi par git.

### Modifié

- **Node 26** partout : `.nvmrc` (`26.9.0`, la version du cluster), CI, déploiement, README et guide de contribution. Auparavant la CI testait Node 24 alors que la production tournait sous Node 26. L'image Docker installe la CLI Prisma 7.10.0, alignée sur `package-lock.json`.
- **Déploiement** : `SENTRY_DSN` est synchronisé dans le secret Kubernetes (il manquait, donc Sentry ne recevait pas les erreurs serveur) ; le manifeste du webhook Gandi référence le tag de son commit, avec la procédure de mise à jour documentée.
- **`DELETE /api/admin/events/[id]`** supprime désormais l'événement au lieu de l'archiver ; il exige un événement archivé (409 sinon) et le titre en confirmation (400 sinon). L'archivage passe par `PATCH { publicStatus: "archived" }`.

---

## [1.11.3] — 2026-09-20

### Corrigé

- **Sentry côté serveur** : `instrumentation.ts` à la racine était ignoré par Next.js (l'application vit dans `src/app`). Les configurations Sentry serveur et edge ne se chargeaient pas et `onRequestError` n'était pas branché. Le fichier est fusionné dans `src/instrumentation.ts`, les erreurs serveur remontent désormais dans Sentry.
- **Sentry côté client** : les erreurs provoquées par les scripts injectés par les navigateurs iOS (Firefox, Brave : `__firefox__`, `DarkReader`, `window.ethereum`) sont filtrées.

### Sécurité

- **Dépendances** : `go.opentelemetry.io/otel` (gandi-webhook) mis à jour en 1.45.0, ce qui ferme les alertes Dependabot associées. Mise à jour groupée de 28 dépendances npm.
- **Code scanning** : le répertoire `.github/skills/` (outils de développement tiers, 20 alertes CodeQL) n'est plus versionné.

### Modifié

- **CI** : `actions/upload-artifact` 4 → 7.

---

## [1.11.2] — 2026-09-14

### Sécurité

- **Dépendances** : correction de 8 alertes Dependabot — `google.golang.org/grpc` (DoS xDS, gandi-webhook), `mysql2` (fuite d'identifiants via downgrade d'auth, DoS zlib), `deepmerge-ts` (épuisement de pile), `@hono/node-server` (path traversal et bypass serveStatic), `valibot`, `uuid`. Les dépendances transitives figées par Prisma sont désormais forcées via `overrides` dans `package.json`.
- **`nodemailer`** : mise à jour 9 → 10.
- **`baseline-browser-mapping`** : mise à jour des données de compatibilité navigateurs.

### Supprimé

- **Export Excel (`.xlsx`)** : fonctionnalité retirée ; le bouton « Exporter Excel » est supprimé de l'interface admin. L'export PDF reste disponible. L'import de membres via xlsx n'est pas affecté.

---

## [1.11.1] — 2026-09-12

### Corrigé

- **`/admin/settings/admins`** : erreur non gérée quand la réponse serveur arrive vide (proxy/timeout transitoire) — alignement sur le pattern déjà utilisé ailleurs dans le code (`.catch(() => ({}))`).

### Sécurité

- **Dépendances** : `gandi-webhook` — `golang.org/x/crypto` 0.51.0 → 0.52.0, `google.golang.org/grpc` 1.79.3 → 1.83.1 (9 CVE critiques/hautes corrigées) ; `@sentry/nextjs` 10.56.0 → 10.74.0 (`@opentelemetry/core` 2.7.1 → 2.11.0, CVE modérée corrigée).

---

## [1.11.0] — 2026-06-10

### Ajouté

- **Liste d'attente — interface publique** : les créneaux complets avec liste d'attente activée s'affichent en couleur du rôle avec rayures diagonales blanches (distinctif du gris hachuré « Complet ») ; les horaires restent visibles ; un sous-label « Complet · file d'attente » apparaît sous la barre ; un bénévole qui sélectionne ce créneau voit « En attente » avec une coche dans le récap
- **Liste d'attente — récap sidebar** : les créneaux en liste d'attente sélectionnés sont listés avec une note « Complet · liste d'attente si place libérée » dans le style secondaire (cohérent avec les sous-labels existants)
- **Liste d'attente — export PDF** : colonne « File d'attente » conditionnelle dans le tableau Récap par poste (affichée uniquement si au moins un créneau a des personnes en attente)
- **Liste d'attente — promotion admin** : l'annulation d'une inscription depuis l'interface admin (via DELETE ou PATCH `status: cancelled`) déclenche désormais la promotion automatique de la première personne en liste d'attente, comme c'était déjà le cas pour les annulations publiques

### Refactoring

- **`gantt-utils.ts`** : extraction des utilitaires partagés (`toMin`, `toMinEnd`, `fromMin`, `fmt`, `clamp`, `GanttShow`) dans `src/lib/gantt-utils.ts`

### Infrastructure

- **`.understand-anything/`** ajouté à `.gitignore` ; dossier retiré du dépôt

### Documentation

- Incohérence Node.js corrigée (`≥ 22` → `26` dans `CONTRIBUTING.md`)
- `README.md` : structure `lib/` mise à jour (`gantt-utils.ts`, `waitlist.ts`, `AdminDayTimeline`)
- `FONCTIONNALITES.md` : liste d'attente documentée (côté public et admin), notifications `waitlist_*` ajoutées au tableau, compteur de tests supprimé
- `GUIDE_ADMIN.md` : section « Activer la liste d'attente » dans la gestion des créneaux
- `GUIDE_BENEVOLE.md` : FAQ créneau complet explique la liste d'attente et le délai de 24 h

---

## [1.10.0] — 2026-06-09

### Ajouté

- **Page membres — colonnes Prénom / Nom séparées** : les deux colonnes sont triables individuellement (clic sur l'en-tête : croissant → décroissant → reset) ; le tri est annoncé aux lecteurs d'écran via une live region (`aria-live="polite"`)

### Amélioré

- **Export Excel** : le récap par poste est déplacé sur une feuille dédiée « Récap par poste » ; les feuilles de jour ne contiennent plus que le Gantt
- **Export PDF** : restructuré en 3 sections uniformes (Planning / Récap par poste / Liste des bénévoles) sans saut de page forcé entre elles

### Infrastructure

- **Fusion des tables `Member` et `Volunteer`** : source de vérité unique pour le répertoire de l'organisation et les inscriptions — les exports et rappels reflètent désormais directement les modifications de la fiche membre
- **`SENTRY_AUTH_TOKEN` passé via secret Docker** (`--mount=type=secret`) au lieu d'une variable d'environnement — le token ne se retrouve plus dans les couches de l'image
- Node.js mis à jour vers **26** dans les images Docker et la configuration CI

### Ajouté (repris de la période beta.6 → 1.10.0, jamais documenté)

- **Auto-inscription au répertoire de l'organisation** : un bénévole qui s'inscrit à un créneau, sans être déjà dans la liste des membres, y est automatiquement ajouté avec le tag « Bénévole ». Une modification de sa fiche membre met à son tour à jour ses inscriptions (exports, rappels).
- **Modale d'édition d'un membre** sur la page Membres, avec piège de focus, sémantique de dialogue et annonces aux lecteurs d'écran.

---

## [1.0.0-beta.6] — 2026-05-07

### Ajouté

- **Liste d'attente pour créneaux complets** : un créneau peut être ouvert à la liste d'attente une fois complet ; une place libérée est automatiquement proposée à la personne suivante (email, 24h pour confirmer via `/waitlist/[token]/confirm`, sinon la place passe au suivant). Une tâche planifiée expire les offres non confirmées et relance la promotion.
- **Tableau de bord admin** : statistiques globales de l'organisation (événements, taux de remplissage, bénévoles, membres) et barres de remplissage par événement (rouge/orange/jaune/vert).
- **Message de confirmation personnalisable** : un texte en Markdown, avec variables ({{prenom}}, {{créneau}}…), affiché sur la page de succès, sur `/my/[token]` et dans l'email de confirmation.
- **Notifications push navigateur** : un bénévole peut s'abonner (page de succès ou `/my/[token]`) pour recevoir un rappel J-2, J-1 et jour J en plus de l'email.
- **Changement de mot de passe** depuis les réglages admin, sans passer par le lien « mot de passe oublié » (mot de passe actuel requis).
- **Charte du bénévole configurable** : bascule pour mentionner ou non une assurance de l'organisation ; texte mis à jour pour le contexte légal suisse (LPD, code des obligations, LAA).

### Amélioré

- **Mise en page desktop de la page publique** : timeline et barre latérale (infos événement, créneaux sélectionnés, appel à l'action) sur deux colonnes.
- **Page événement admin** : la mention « X manquants » est remplacée par une barre de progression colorée (places pourvues / capacité).
- **Rappels automatiques** : une tâche planifiée horaire envoie les rappels J-2/J-1/jour J, distincts du rappel manuel ponctuel.
- **Emails** : structure HTML complète (carte blanche sur fond gris, texte d'aperçu avant ouverture) sur tous les templates ; tutoiement unifié côté bénévole.
- **Monitoring d'erreurs (Sentry)** ajouté.

---

## [1.0.0-beta.5] — 2026-05-01

### Ajouté

- **Charte du bénévole** : texte par défaut éditable dans les paramètres de l'organisation (`/admin/settings/admins`) ; présenté aux bénévoles lors de l'inscription sous forme de modal « Lire la charte » avec case à cocher obligatoire ; le texte peut être personnalisé par organisation ou réinitialisé au texte par défaut
- **Page profil super admin** (`/super-admin/profile`) : modification de l'email et du mot de passe avec vérification du mot de passe courant
- **Email de bienvenue admin** : envoyé automatiquement après l'activation du compte (premier mot de passe défini via le lien d'invitation)
- **Bouton « Tester l'envoi d'email »** sur la page d'invitations : envoie un email de test à l'adresse de son choix pour vérifier la configuration SMTP
- **Page d'accueil publique** (`www.benevol.app`) : landing page avec présentation des fonctionnalités pour les visiteurs sans sous-domaine d'organisation
- **Règles de mot de passe renforcées** : 10 caractères minimum, majuscule, minuscule, chiffre et caractère spécial obligatoires ; indicateur visuel en temps réel sur tous les formulaires de création/modification de mot de passe

### Amélioré

- **Ton des emails bénévoles** : tous les templates sont réécrits avec un ton chaleureux et personnel — salutation `Hello [Prénom] !`, tutoiement, signature `Un grand M E R C I, une grosse bise et à très vite !`
- **Session bénévole depuis l'email** : cliquer sur le lien « Gérer mes inscriptions » d'un email stocke le token en `localStorage` ; si le bénévole navigue ensuite vers la page de l'événement, il est automatiquement reconnu (créneaux en vert, nom affiché) ; le lien « Retour à l'accueil » pointe désormais directement sur la page de l'événement
- **URLs dans les emails** : les liens `/my/[token]` utilisent désormais le sous-domaine de l'organisation (`cdp.benevol.app/my/…`) au lieu de `www.benevol.app/my/…`, dans tous les types de notifications (confirmation, rappels J-2/J-1/JJ, rappel manuel, modification de créneau)
- **Email de notification admin (nouvelle inscription)** : les créneaux incluent maintenant le rôle, le libellé (si différent du rôle), la date et les horaires

### Corrigé

- **`showSchedule` non sauvegardé** lors de la création d'un événement (le champ était absent du schéma Zod de validation côté API)
- **Lien « Gérer → » super admin** redirigait vers `0.0.0.0:3000` au lieu du domaine public (utilisation de `x-forwarded-host` à la place de `req.url`)
- **Page `accept-invite`** redirigée vers le login par le middleware (ajout d'une exception pour les pages admin publiques)

---

## [1.0.0-beta.4] — 2026-05-01

### Ajouté

- **Slug d'organisation modifiable** : le super admin et les admins peuvent changer le slug de leur organisation depuis les paramètres ; les anciens slugs sont archivés dans `OrgSlugHistory` et redirigent automatiquement vers le slug courant ; un avertissement est affiché si des événements publiés risquent d'avoir des liens cassés ; suppression individuelle des anciens slugs possible
- **Contexte d'organisation dans le super-admin** : cliquer sur « Gérer → » depuis la fiche d'une organisation pose un cookie `sa-org-id` ; les routes `/admin/*` adoptent automatiquement cette organisation ; la navbar admin affiche le nom de l'organisation courante
- **Édition inline dans le super-admin** : nom et slug modifiables directement depuis la fiche organisation sans formulaire séparé

### Amélioré

- **URLs super-admin** : les fiches d'organisations utilisent désormais le slug (`/super-admin/organizations/mon-org`) au lieu de l'identifiant interne
- **Formulaire événement** : `endDate` se positionne automatiquement sur `startDate` lors de la première saisie ; la section « Spectacles » ne se déverrouille qu'une fois les deux dates renseignées ; la durée par défaut d'un spectacle est de 90 minutes (`startTime` + 90 min → `endTime` auto-remplie)
- **Timeline — couleurs des rôles personnalisés** : les rôles non reconnus dans la palette standard reçoivent une couleur déterministe calculée par hash du nom (8 teintes disponibles : indigo, cyan, lime, rose, fuchsia, sky, emerald, yellow)
- **Timeline — durée par défaut des créneaux** : passage de 60 à **90 minutes** lors de la création d'un nouveau créneau
- **Timeline publique** : les bandes de spectacles sont à nouveau visibles en fond sur toutes les lignes de rôle

### Corrigé

- **URL publique sur localhost** : `eventPublicUrl` inclut désormais `?org=<slug>` en l'absence de sous-domaine ; le middleware lit ce paramètre comme `x-org-slug` en fallback ; l'API `/api/public/[eventSlug]` lit également `?org=` si le header est absent
- **Timeline — décalage à 0h** : un créneau avec `endTime = "00:00"` (overnight) tirait l'échelle jusqu'à minuit ; corrigé par `toMinEnd(end, start)` qui ajoute 1 440 min quand `end ≤ start`

---

## [1.0.0-beta.3] — 2026-04-30

### Ajouté

- **Architecture multi-tenant SaaS** : chaque organisation dispose d'un espace isolé — événements, membres et admins sont cloisonnés via un client Prisma étendu (`getOrgClient`) qui injecte `organizationId` dans tous les reads
- **URLs incluant le slug d'organisation** : `/{orgSlug}/{eventSlug}` — les anciens chemins `/events/[slug]` ont été supprimés
- **Super admin** (`/super-admin`) : interface dédiée pour créer et gérer les organisations ; rôle `super_admin` protégé au niveau middleware
- **Gestion de l'équipe admin** (`/admin/settings/admins`) : inviter un nouvel admin par email (lien d'activation à durée limitée), retirer un admin, lister les invitations en attente
- **Onboarding par lien sécurisé** : le premier admin d'une organisation crée son mot de passe via un token révocable (valide 7 jours) — aucun mot de passe temporaire transmis en clair
- **Pool de membres** (`/admin/members`) : répertoire de bénévoles connus de l'organisation, indépendant des inscriptions ; champs libres (tags, notes internes), import CSV/TSV, recherche et filtre par tag
- **Invitations tokenisées** (`/admin/events/[id]/invitations`) : envoi batch vers des membres sélectionnés par nom ou tag ; chaque invitation génère une URL qui pré-remplit le formulaire ; vue d'état (inscrit / pas encore répondu) avec relance ciblée
- **Communications automatiques** : rappels J-2, J-1 et Jour J envoyés par cron (`/api/cron/reminders`) ; notification automatique aux bénévoles en cas d'annulation ou de modification d'horaires d'un créneau
- **Rappel manuel** : bouton d'envoi depuis la page de l'événement ; chaque bénévole reçoit un seul email regroupant tous ses créneaux
- **QR code** : téléchargement PNG/SVG du QR code de la page publique depuis la page admin de l'événement
- **20 tests d'isolation cross-tenant** (Vitest) — vérifient qu'aucune route ne divulgue ou ne modifie des données d'une autre organisation

### Modifié

- Middleware reécrit pour protéger `/super-admin/*` (rôle requis) en plus de `/admin/*` (authentification)
- Lien « Vue publique » affiché uniquement si l'événement est publié
- Migration Prisma unique (squashée) : les 6 migrations précédentes ont été consolidées en une seule migration `init`
- Variables d'environnement : `ADMIN_EMAIL` / `ADMIN_PASSWORD` supprimées ; `CRON_SECRET` ajouté

---

## [1.0.0-beta.2] — 2026-04-26

### Ajouté

- **Réordonnancement des postes** : panneau glisser-déposer dans la gestion des créneaux pour changer l'ordre des lignes dans les timelines admin et publique ; persisté via le champ `displayOrder` sur les créneaux (API `POST /api/admin/events/[id]/reorder-roles`)
- **Navigation créneaux → inscriptions** : bouton « Voir les inscriptions → » dans le popover de chaque créneau ; la page d'inscriptions s'ouvre pré-filtrée sur le créneau et le rôle correspondants
- **Détection de conflits contextuelle à l'ajout manuel** : le message d'avertissement n'apparaît que si le créneau sélectionné dans le formulaire est déjà pris ou en conflit horaire avec les inscriptions existantes du bénévole identifié par son email

### Amélioré

- **Affichage des places libres** : les barres de la timeline admin affichent désormais `X/Y · Z libre(s)` ; la vue liste montre une sous-ligne colorée (vert = places disponibles, orange = complet)
- **Saisie des horaires** : les champs Début/Fin acceptent une saisie partielle (`9` → `09:00`, `14:3` → `14:30`, `21` → `21:00`)
- **Ordre des rôles** : les deux timelines (admin et publique) respectent le `displayOrder` des créneaux pour l'ordre des lignes de rôle

### Corrigé

- Le champ `displayOrder` est désormais transmis depuis l'API publique jusqu'au composant `DayTimeline`, garantissant que l'ordre admin se reflète côté bénévole

---

## [1.0.0-beta.1] — 2026-04-24

Première version bêta publique. Toutes les fonctionnalités de base sont stables.

### Fonctionnalités

- **Timeline publique** : planning Gantt interactif par jour avec scroll horizontal sur mobile
  - Positionnement pixel-exact avec échelle dynamique (calculée à partir du créneau le plus large)
  - Sélection multi-créneaux, détection de conflits en temps réel, affichage du statut
  - Bandes colorées en fond pour le programme des spectacles
- **Inscription bénévole** : formulaire avec validation, consentement, session persistante via `localStorage`
- **Gestion personnelle** (`/my/[token]`) : consultation et annulation de ses inscriptions
- **Interface admin** : CRUD complet des événements, créneaux et programme des spectacles
  - Publication / dépublication en un clic
  - Pré-sélection automatique du créneau filtré lors d'un ajout manuel
  - Suivi des inscriptions en temps réel
- **Exports** : Excel (`.xlsx`) et PDF avec Gantt + tableaux récapitulatifs
- **Emails** : confirmation bénévole + notification admin optionnelle (SMTP Nodemailer)
- **Auth admin** : NextAuth v5, credentials, session sécurisée
- **CI/CD** : GitHub Actions → build Docker → déploiement Kubernetes automatique

### Infrastructure

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4
- PostgreSQL 16 + Prisma 7 (driver `@prisma/adapter-pg`)
- Node.js 22 requis
- Déploiement Docker Compose et Kubernetes (manifestes inclus)
- Init container pour migrations automatiques au démarrage

### Corrections notables

- Scroll horizontal mobile : passage d'un positionnement en % (qui ne scrollait pas) à des pixels absolus
- Auth derrière reverse proxy : `AUTH_TRUST_HOST` + `AUTH_URL` pour NextAuth v5
- Token Prisma WASM dans l'image Docker standalone
- Contrainte unique `editToken` lors d'inscriptions multi-créneaux

---

## [0.1.0] — 2026-04-10

MVP initial : schéma BDD, page publique, interface admin, exports, CI/CD.
