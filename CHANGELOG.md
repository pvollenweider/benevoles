# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [Unreleased]

### Ajouté

- **Licence des tutoriels vidéo** : scripts, narration, textes et vidéos sous CC BY-SA 4.0 (`videos/LICENSE`), le nom et le logo Benevol exclus ; les outils restent sous AGPL v3.
- **Supprimer définitivement un membre sans historique** (#667) : une fiche **inactive** qui n'a **aucune inscription**, quel que soit son statut (confirmée, en liste d'attente, proposée, demandée, annulée, refusée), peut maintenant être supprimée pour de bon, pas seulement désactivée — utile pour les fiches créées par erreur, les tests ou les anciens membres jamais venus. Le bouton **Supprimer** apparaît sur la ligne du membre (liste des membres) et sur sa page Activité seulement quand la fiche remplit les deux conditions, jamais un bouton mort ; sinon la page Activité explique la raison en mots. Une tombe de fusion (#600) n'est jamais proposée, elle est purgée par la rétention. La confirmation nomme la personne, précise que l'action est irréversible et liste ce qui disparaît avec elle (invitations, réponses aux questions des événements, abonnements aux notifications du navigateur, suivis d'envoi d'email, doublons possibles écartés la concernant). La route réexamine l'éligibilité dans une transaction qui verrouille la fiche, pour qu'une inscription concurrente ne puisse jamais passer entre l'ouverture de la boîte de dialogue et la suppression. Réservé à un membre sans inscription : l'effacement d'une fiche avec des inscriptions reste à faire (#516).
- **Doublons possibles** (#601) : des fiches qui se ressemblent (même nom et prénom après normalisation, même numéro de téléphone, adresses email très proches, l'une des deux a une adresse à vérifier (#599) proche de l'autre, ou même date de naissance) sont suggérées sur un lien **Doublons possibles (N)** dans l'en-tête de la page des membres, avec les raisons en mots pour chaque paire, jamais fusionnées automatiquement, jamais présentées comme une certitude (un nom identique reste « un homonyme n'est pas forcément la même personne » ; un téléphone ou un email partagés seuls sont « numéro partagé possible » / « adresse partagée possible », jamais une probable même personne). **Ignorer** une paire ne la cache pas pour toujours : elle revient si un nouveau type de signal apparaît. Les fiches déjà fusionnées (#600) ne sont jamais suggérées. Voir la liste et ignorer une paire sont ouverts aux organisateurs ; **Comparer et fusionner** ouvre la fusion elle-même, réservée aux propriétaires. Le lien **Doublon ?** d'une fiche à l'adresse à vérifier (#599) ouvre directement les paires de cette fiche.
- **Fusionner deux fiches membre confirmées comme la même personne** (#600) : depuis la page Activité d'un membre, une fusion avec aperçu complet (ce qui va bouger, conflit par conflit), choix explicite champ par champ quand les deux fiches diffèrent, et confirmation dans une boîte de dialogue, le tout dans une seule transaction. Les inscriptions (tous statuts), invitations et réponses aux questions de la fiche absorbée sont réassignées à la fiche conservée ; une même place prise des deux côtés garde la plus avancée et annule l'autre ; les liens personnels déplacés sont régénérés (les anciens affichent la page « lien plus valide »), avec une option pour les renvoyer à l'adresse conservée. La fiche absorbée devient une fiche inactive sans donnée personnelle, effacée par le nettoyage habituel. Réservé aux propriétaires de l'organisation ; irréversible.
- **Adresses à vérifier, et échecs d'envoi actionnables** (#599) : un membre dont l'adresse email actuelle a reçu un rejet définitif du serveur destinataire pour un message important (confirmation d'inscription, proposition de liste d'attente, ou rappel) affiche « Adresse à vérifier » sur sa fiche et dans la liste des membres, avec la date et une explication neutre, jamais une mise en cause de la personne — un incident temporaire s'affiche différemment et ne produit jamais ce statut à lui seul. Changer l'adresse lève le statut aussitôt. Une case à cocher **Adresses à vérifier**, au-dessus de la liste des membres, filtre sur ces membres et affiche leur nombre ; depuis une ligne concernée, modifier l'adresse, voir les inscriptions du membre ou chercher un doublon par son nom. Le tableau de bord gagne un item pour ces membres, et un résumé quotidien par email (réglage **Résumé quotidien des adresses à vérifier**, coché par défaut) prévient les administrateurs actifs quand c'est arrivé depuis la veille, jamais plus d'une fois par jour. Écrire aux bénévoles avertit, sans jamais bloquer l'envoi, quand des destinataires ont une adresse à vérifier.
- **Résultat d'envoi SMTP par destinataire** (#598) : chaque email envoyé par l'application est désormais classé : accepté par notre serveur d'envoi (jamais « délivré »), rejet permanent (adresse inexistante ou refusée), échec temporaire, ou non classé — avec un motif normalisé, les codes du serveur et une empreinte de l'adresse, sans jamais garder la réponse brute du serveur, l'adresse en clair, le contenu ou un jeton. Rattaché au membre concerné quand il y en a un (jamais pour un administrateur, un responsable de secteur ou un email de test) ; conservé 30 jours, comme les emails en échec, et effacé avec le membre le jour où son effacement (#516) sera possible. Les résultats d'un membre apparaissent dans l'export CSV des membres, utilisé pour répondre à une demande d'accès. Première étape avant un signalement « Adresse à vérifier » dans l'administration.
- **Résumé d'un événement dans Rapports** (#557) : bénévoles distincts avec un créneau confirmé, dont les nouveaux et ceux de retour (aucune inscription active sur un événement antérieur de l'organisation) ; créneaux confirmés avec une présence enregistrée sur le total, avec une phrase explicite quand le pointage n'a pas été utilisé ou seulement en partie ; heures planifiées (le total) et, parmi elles, heures attestées (« 46 h planifiées, dont 38 h attestées ») ; taux de remplissage global et par poste, numérateur et dénominateur toujours écrits en toutes lettres (« 46 places occupées sur 52 ») ; liste des créneaux restés incomplets. Tant que l'événement n'est pas terminé, un résumé provisoire le signale. Mêmes règles de comptage que l'attestation de bénévolat (#556).
- **Heures par bénévole, pour une période** (#557) : depuis la page des membres, un export CSV (une ligne par membre avec au moins un créneau confirmé sur la période, douze derniers mois par défaut ; événements, créneaux, heures planifiées et heures attestées parmi elles ; une ligne de total) ; option pour inclure aussi les membres sans créneau confirmé sur la période. Une période invalide (fin avant début) répond 400, sans export.
- **Heures attestées et dernière participation sur la liste des membres** (#557) : deux nouvelles colonnes triables, à côté des heures planifiées (désormais limitées aux créneaux passés) — heures attestées (présence enregistrée, toujours incluse dans les planifiées, jamais en plus) et date de la dernière participation, avec la date de la dernière présence enregistrée en complément.
- **Attestation de bénévolat** (#556) : depuis l'activité d'un membre, un document imprimable en noir et blanc, pour une période choisie (douze derniers mois par défaut), avec le nom de l'organisation et du bénévole, le détail par événement (postes tenus, nombre de créneaux) et les **heures attestées**, comptées uniquement sur les présences enregistrées, dans le fuseau de l'organisation (changement d'heure compris). Les heures des créneaux confirmés sans présence enregistrée peuvent être ajoutées à part, sous leur propre intitulé, avec une case à cocher décochée par défaut ; un avertissement, visible à l'écran seulement, liste ces créneaux. Un créneau annulé ne compte jamais, même si une présence y avait été enregistrée avant l'annulation. Texte libre facultatif et zone de signature vierge. Réservé aux propriétaires et organisateurs ; rien n'est conservé, le document est régénéré à la demande.
- **Un membre invité peut répondre qu'il n'est pas disponible** (#558) : l'email d'invitation et la page de l'événement ouverte depuis le lien personnel proposent « Je ne suis pas disponible pour cet événement », avec une étape de confirmation avant que quoi que ce soit ne soit enregistré (jamais sur un simple chargement de page). Aucune raison n'est demandée. L'invitation gagne un troisième état, « Pas disponible », visible dans la liste des invitations à côté de « Participation confirmée » et « Sans réponse » ; un filtre « Sans réponse » et des compteurs qui s'additionnent toujours au total des invités. « Relancer les … sans créneau » et « Écrire aux … sans créneau » (Écrire aux bénévoles) laissent de côté les personnes pas disponibles, et disent combien ont été laissées de côté ; le tableau de bord ne compte plus les personnes pas disponibles dans « invités sans créneau ». S'inscrire ensuite depuis le même lien efface le statut « Pas disponible » ; se désinscrire plus tard ne le remet pas.
- **Les organisateurs sont prévenus d'un désistement** (#559) : quand un bénévole annule une place confirmée ou une demande depuis sa page personnelle ou la page publique de l'événement, un email part aux administrateurs actifs et aux responsables du poste concerné (qui se désiste, de quel créneau, combien de places manquent désormais, si la liste d'attente a repris la place), avec le mot facultatif que le bénévole peut laisser à l'organisation (« Un mot pour l'organisation ? », 300 caractères maximum, jamais conservé une fois l'email envoyé). Quitter la liste d'attente ou refuser une place proposée ne prévient personne. Réglage séparé de celui des nouvelles inscriptions, coché par défaut, dans **Paramètres → Emails**.
- **Invalidation en masse des liens bénévoles après une fuite** (#542) : `scripts/regenerate-links.ts`, un outil opérateur qui régénère le jeton de chaque inscription, responsable de secteur et invitation d'une organisation ou d'un événement (changer `TOKEN_ENCRYPTION_KEY` ne suffisait pas : les liens déjà envoyés restaient valables). Simulation par défaut, `--yes` pour appliquer, `--resend` pour renvoyer les nouveaux liens ; voir `docs/rgpd/procedure-violation.md`.
- **Alerte de nouvelle version pour les instances auto-hébergées** (#612) : une fois par jour, `/api/cron/release-check` compare la version installée à la dernière release publique de GitHub (sans jeton, prereleases et brouillons ignorés) ; désactivable avec `RELEASE_CHECK=off` dans `.env` (aucune requête sortante alors). Une nouvelle version prévient les super admins par email (une seule fois par version) et affiche une bannière masquable dans leur espace, avec un lien vers les notes de version. La page **Santé du service** montre la dernière version connue et la date de la dernière vérification. `benevol.app`, déployé depuis `main`, n'est jamais concerné.

### Modifié

- **Un seul rappel par bénévole, événement et jour** (#672) : auparavant, chaque créneau recevait son propre rappel J-2, J-1 et du jour même, jusqu'à 9 emails (et autant de notifications push) pour une personne inscrite sur 3 créneaux en une journée. Les rappels sont maintenant regroupés par bénévole, par événement et par jour local des créneaux, et déclenchés une fois que le premier créneau du jour entre dans la fenêtre : un seul email liste alors tous les créneaux du jour, dans l'ordre, avec l'heure, le poste, le lieu, le contact et les consignes de chacun. Un créneau de nuit compte sur son jour de début ; une inscription le même jour sur un autre événement reçoit son propre email ; une inscription tardive, après l'envoi du rappel du jour, reçoit le sien sans jamais en manquer ni en dupliquer un. Les réglages existants (rappel J-2, J-1, du jour, par organisation) continuent de s'appliquer tels quels.
- **Un rejet permanent n'est plus réessayé pendant 2 h 30** (#598) : quand le serveur d'envoi refuse définitivement un email (boîte inexistante, adresse refusée), l'application arrête tout de suite les nouvelles tentatives au lieu d'épuiser les 6 essais sur ~2 h 30 — réessayer une adresse qui n'existe pas ne change rien. Un incident temporaire (serveur injoignable, boîte pleine, délai dépassé) garde les mêmes tentatives qu'avant.
- **Page Rapports d'un événement réorganisée** : l'export complet, qui liste les téléphones et emails des bénévoles, est rangé dans « Pour les organisateurs seulement » ; l'archive de l'événement (JSON) passe en fin de page, après les badges.
- **« Heures planifiées » (liste des membres) ne compte plus que les créneaux passés** (#557, suite de #571) : les créneaux à venir, qui n'ont pas encore eu lieu, en sont désormais exclus, et un créneau annulé ne compte plus non plus, même si l'inscription était restée active.

### Corrigé

- **Contraste des emails** : le bas de chaque email (mot de la fin, petites mentions, lien « benevol.app », désabonnement des nouveautés), la ligne « Tu ne peux pas participer cette fois ? » de l'invitation, les créneaux barrés et l'échéance d'une place proposée en liste d'attente étaient trop pâles (de 1,9:1 à 3,6:1) ; ils atteignent maintenant 4,5:1 au moins.
- **Adresses réservées** : les variantes des sous-domaines techniques de benevol.app (pluriel ou singulier, tirets, accents : « media », « w-w-w », « apis »…) sont aussi refusées comme adresse d'une organisation, à la création comme au renommage.
- **Adresse d'une organisation** : le slug d'une organisation pouvait prendre un sous-domaine technique de benevol.app (`www`, `api`, `admin`…), qui ne mène alors jamais à sa page ; ces adresses sont maintenant refusées, `medias` compris (réservé aux vidéos), et une organisation créée sous un tel nom reçoit un suffixe.
- **Fusion de deux fiches** : garder l'adresse email de la fiche absorbée faisait échouer la fusion (l'adresse était encore prise par cette fiche au moment de l'enregistrement) ; rien n'était modifié, mais l'écran annonçait à tort une connexion interrompue. La fusion libère maintenant l'adresse d'abord, et une erreur du serveur est présentée comme telle, en disant si rien n'a été modifié.
- **Variables des messages de l'événement** : `{prenom}` ou `{prénom}` (la syntaxe des modèles de messages) s'affichait tel quel sur la page personnelle et la page de confirmation ; le message de confirmation accepte maintenant les deux écritures, avec ou sans accent, simple ou double accolade. L'email de confirmation remplace aussi les variables (il les envoyait brutes) et applique la mise en forme annoncée (gras, listes, liens), qu'il affichait avec ses astérisques ; `{date}` et `{heure}` reçoivent la date et l'heure du premier créneau au lieu d'un vide.
- **L'adresse d'un bénévole pouvait apparaître dans le texte d'une erreur d'envoi** (#598) : la raison affichée pour un email en échec pouvait citer la réponse brute du serveur SMTP, qui cite parfois l'adresse, et était journalisée telle quelle. Les échecs d'envoi sont désormais décrits par une phrase normalisée, en français, qui ne contient jamais l'adresse ni la réponse brute du serveur — y compris pour les lignes déjà en base avant ce changement.
- **Invitations des membres et relances comptaient un email refusé comme envoyé** (#597) : quand le serveur d'envoi refusait un email (adresse mal écrite, serveur mal configuré), l'invitation ou la relance était quand même comptée dans les emails envoyés et rien ne le signalait. Un envoi refusé compte maintenant dans les échecs, aussi bien pour l'invitation d'un membre que pour une relance ; l'email de test répond par une erreur quand l'envoi échoue, et le résultat affiché aux organisateurs mentionne les échecs d'envoi.
- **Journal d'un événement et enregistrement automatique** Dans le même formulaire, les messages (instructions publiques, confirmation, rappel) et les champs d'un spectacle ont maintenant leur étiquette, et les boutons ✎ et ✕ d'un spectacle sont nommés. (#616) : dans le journal d'un événement, les dates et les compteurs sont maintenant lisibles (contraste insuffisant auparavant). Dans le formulaire de modification d'un événement, l'enregistrement automatique est indiqué en haut du formulaire, avec un contraste suffisant, et annoncé aux lecteurs d'écran (« Modifications enregistrées. » au chargement puis après chaque échec ; les enregistrements suivants ne font que mettre à jour l'heure affichée) ; un échec reste affiché dans un message qui ne disparaît plus tout seul, avec un bouton **Réessayer**.
- **Réordonner les pages d'un événement au clavier** (#605) : les flèches Monter et Descendre gardent le focus, annoncent la nouvelle position (« Page « FAQ » déplacée en position 2 sur 4. ») et, aux extrémités, restent atteignables et disent que la page est déjà en première ou en dernière position. On peut enchaîner les déplacements pendant l'enregistrement ; si l'enregistrement échoue, l'ordre enregistré est rétabli et un message le dit. L'adresse de chaque page est plus lisible.
- **Page Créneaux lisible et lue en mots** (#587, #606) : le bouton d'affichage « Timeline » s'appelle maintenant « Frise » (un mot français, lu correctement) ; dans la vue Liste, « Modifier », « Supprimer », « Complet », les places libres et le statut « Fermé » ont maintenant un contraste suffisant, et chaque « Modifier » et « Supprimer » est nommé avec son créneau pour les lecteurs d'écran (« Modifier le créneau Bar, samedi 4 juillet, de 10h à 12h »). Les heures et les places sont lues en mots (« de 10h à 12h », « 3 inscrits sur 5 ») dans la liste, sur les barres du planning et dans la petite fenêtre d'un créneau, la colonne s'appelle « Date et horaire » et l'âge « 18 ans minimum ». La confirmation de suppression dit « Bar, Soir » et « de 10h30 à 12h15 » : depuis le planning, elle arrondissait l'heure (10h30 devenait 10:00). L'aide sous le planning est en phrases lisibles, avec l'équivalent au clavier. Dans « Gérer les postes », la couleur choisie est marquée d'une coche et d'un bord, visibles aussi en contraste élevé, « Automatique » choisi d'un « ✓ », sans infobulle ; le bouton de couleur d'un poste offre une cible de 24 px avec un contour au focus ; un nom de poste long et une longue liste d'étiquettes « Accès : … » s'affichent en entier, sur plusieurs lignes, au lieu d'être coupés. Dans la petite fenêtre d'un créneau, les boutons occupés s'appellent « Décalage… » et « Duplication… » au lieu de « … », et le lien devient « Voir les inscriptions ». Dans les formulaires de créneau et de série, l'astérisque des champs obligatoires n'est plus lu « étoile » ; dans une série, un champ manquant dit lui-même son erreur et reçoit le focus, comme dans le formulaire d'un créneau, au lieu d'une alerte.
- **Inscriptions et responsables lus en mots** (#582) : les noms des boutons et des cases, et les textes de ces deux pages, ne contiennent plus de « · », de tiret entre deux heures, de « # » ni de « ·e », que les lecteurs d'écran lisaient « point », « tiret », « dièse » ou « point e ». Chaque case de sélection nomme le créneau en plus de la personne (« Sélectionner l'inscription de Chloé Roy, Bar, samedi 4 juillet, de 10h à 12h »), ce qui distingue deux lignes de la même personne ; « Accepter » et « Refuser » nomment aussi le jour et les heures, comme la fenêtre de confirmation qu'ils ouvrent. La colonne Créneau affiche « Bar, Soir » et « sam. 4 juil., de 10h à 12h », le rang en liste d'attente devient « position 3 », et le résumé sous le titre « 3 inscriptions actives, 2 en liste d'attente, 1 demande à traiter ». Le badge « Responsable » dit de quel poste, sans infobulle réservée à la souris. L'astérisque des champs obligatoires (« Prénom * », « Créneau * », « Poste * », « Email * »…) reste affiché mais n'est plus lu « étoile » : le champ est annoncé comme obligatoire. Pendant un ajout manuel, le bouton s'appelle « Ajout en cours… » au lieu de « … ». Sur la page des responsables, le bouton devient « + Ajouter un responsable », les bénévoles proposés s'affichent « Chloé Roy (Bar, Accueil) », et ni la fenêtre « Rendre responsable » ni la confirmation d'une demande acceptée ne disent plus « inscrit·e ». Dans cette fenêtre, le champ « Email » est annoncé comme obligatoire, et les indications sous les champs (plusieurs postes, email manquant, choix parmi les inscrits) sont lues avec le champ concerné.
- **Menu Super Admin** (#590) : sur tablette, toucher ailleurs sur la page referme maintenant le menu, qui restait ouvert. Il se referme aussi quand le focus clavier le quitte (Tab après le dernier lien), et Échap ramène toujours sur le bouton « Super Admin ». La page où vous êtes est indiquée aux lecteurs d'écran comme la page actuelle dans le menu, le bouton offre une cible d'au moins 24 px et affiche un contour au focus clavier. La flèche du menu Super Admin et celle du menu du compte ne tournent plus quand « Réduire les animations » est activé.
- **Fenêtres de l'administration** (#585) : la touche Tab ne sort plus de la fenêtre d'import des membres à l'étape d'aperçu pour aller sur la page derrière, et un focus resté hors d'une fenêtre y revient au premier Tab. Sur Safari (iPhone, iPad, Mac), qui ne donne pas le focus à un bouton touché ou cliqué, le focus revient à la fermeture d'une fenêtre sur le bouton qui l'a ouverte, et non plus au début du contenu de la page ; de même dans « Gérer les postes », sur « Renommer » après un renommage validé ou annulé. Pendant un enregistrement, le bouton « Fermer » d'une fenêtre reste atteignable et est annoncé comme indisponible.
- **Lien « Aller au contenu » sur les pages publiques et l'espace super admin** (#534) : la page d'un événement, les documents légaux (conditions d'utilisation, politique de confidentialité) et l'espace de l'opérateur commencent maintenant, comme l'administration et la documentation, par un lien « Aller au contenu », visible dès qu'il reçoit le focus, qui mène directement au contenu sans repasser par l'en-tête. Sur la page d'un événement, l'en-tête (titre, session) est annoncé comme l'en-tête de la page et non plus comme une partie du contenu principal, et le pied de page en est séparé. Les pages d'information d'un événement ont aussi une zone de contenu principal. L'aperçu réservé aux organisateurs garde le seul lien de l'administration.
- **Rappels push quand le site ne les propose pas** (#534) : le bouton « Recevoir des rappels push » s'affichait même quand le site n'était pas configuré pour envoyer des notifications, puis disparaissait au premier appui sans rien dire. Il n'apparaît plus dans ce cas ; s'il est pressé alors que le service n'est pas disponible, la page le dit (« Les rappels push ne sont pas disponibles pour le moment. »). Un échec de l'activation est annoncé (« Les rappels n'ont pas pu être activés. Réessaie dans un moment. ») au lieu de faire revenir le bouton en silence, et le focus reste sur le bouton, qui reste atteignable pendant l'activation. Un appareil déjà abonné n'affiche plus « Rappels push activés » quand le serveur a refusé de le rattacher à l'inscription.
- **Créneaux déjà pris sur le planning public** (#583, #534) : un créneau auquel on avait déjà une inscription s'affichait comme un créneau sélectionné, et un lecteur d'écran l'annonçait comme un créneau à désélectionner, désactivé, sans dire qu'il était déjà pris. Il garde maintenant la couleur du poste avec un ✓ cerclé et la mention « Ton créneau » sous la barre (« Demande envoyée », « En liste d'attente » ou « Place proposée » selon le cas), et son nom dit où on en est : « Bar 10h–12h : inscription confirmée », « … : demande envoyée, en attente de validation », « … : en liste d'attente » ou « … : place proposée, à accepter sur ta page personnelle ». Un créneau déjà pris et complet ne dit plus « Complet ». Le contour de focus d'une barre n'est plus masqué par la colonne des postes (créneau qui commence à la première heure) ni par la barre suivante (créneaux qui se touchent). En contraste élevé (couleurs forcées), chaque barre garde une bordure sur ses quatre côtés au lieu de se fondre dans le fond, et le créneau sélectionné se distingue des autres. Le planning de chaque journée est nommé par sa date (« Planning du samedi 4 juillet »), pour les lecteurs d'écran.
- **Annuler un créneau depuis la page de l'événement** (#584, #534) : la fenêtre de confirmation garde maintenant le focus (Tab ne la quitte plus pour la page derrière), s'ouvre sur « Non, garder » et se ferme avec Échap où que soit le focus. Son titre et son bouton disent ce qui est retiré : « Confirmer l'annulation ? », « Quitter la liste d'attente ? », « Refuser la place ? » ou « Retirer ta demande ? ». Le créneau n'est plus retiré de la liste avant la réponse du serveur : si l'annulation échoue (connexion coupée, trop de tentatives, créneau déjà annulé), la fenêtre reste ouverte, dit que rien n'a été annulé et le créneau reste. Après une annulation réussie, le résultat est annoncé une fois, en mots (« Créneau annulé : Bar, samedi 4 juillet, de 10h à 12h. »), et le focus va sur le créneau suivant de la liste, ou sur la barre du créneau dans le planning, au lieu de se perdre. Les ✕ de la liste des créneaux sont plus contrastés et offrent une cible d'au moins 24 px. La fenêtre de la convention des bénévoles garde elle aussi le focus et se ferme avec Échap. L'effet d'échelle des boutons « Continuer » et « Confirmer mon inscription » est désactivé quand le système demande de réduire les animations.
- **Tutoiement sur toute l'inscription publique** (#534) : la page de l'événement, le récapitulatif et les messages d'erreur de l'inscription mélangeaient « vous » et « tu » ; ils tutoient maintenant les bénévoles partout (« Tes informations », « Tes créneaux », « Tu as déjà 2 créneaux “Loge”, le maximum pour ce poste. », « Ton inscription n'a pas pu être enregistrée »…). Les messages n'utilisent plus « inscrit·e » ni « inscrit(e) », lus tels quels par les lecteurs d'écran : « Si tu as déjà des créneaux, ton lien personnel reste valable. », « Tu as déjà une inscription à un de ces créneaux. », et le nom affiché en haut de la page est annoncé « Session ouverte au nom de … ». Les flèches de « Fais défiler pour voir toutes les plages » ne sont plus lues. L'aperçu réservé aux organisateurs garde le vouvoiement.
- **Plus de blocage des bénévoles qui partagent une connexion** (#609) : la page personnelle, les annulations et les disponibilités n'étaient permises que 10 fois (lecture), 5 fois (annulation) et 10 fois (disponibilités) par heure pour toutes les personnes derrière une même connexion (club, famille, Wi-Fi du lieu) : retirer six créneaux d'un coup était refusé. Seuls les liens qui ne correspondent à aucune inscription comptent désormais par connexion (20 par heure, puis « Trop de tentatives. » pour toute la connexion) ; un lien valable a sa propre limite (60 affichages, 30 annulations et 30 enregistrements de disponibilités par heure).
- **Annuler un créneau depuis la page personnelle** (#534) : la demande de confirmation (annuler un créneau, quitter une liste d'attente, refuser une place, retirer une demande) reçoit maintenant le focus quand elle s'ouvre, sur « Non, garder », et se ferme avec Échap ; en la refermant, le focus revient sur le bouton du créneau. Pendant l'envoi, elle reste ouverte et le bouton de confirmation garde le focus. Après l'annulation, le focus va sur le créneau suivant (ou le précédent, ou le titre de la page quand il n'en reste plus) et le résultat est annoncé une fois, en mots (« Créneau annulé : Bar, samedi 4 juillet, de 10h à 12h. »). Un échec n'affiche plus « Ce lien ne fonctionne pas » à la place de toute la page : le créneau reste, et un message sous lui dit que rien n'a été annulé (connexion coupée, trop de tentatives, créneau déjà annulé). Les boutons d'annulation et de confirmation sont plus contrastés, et sur un écran de 320 px le bouton passe sous le texte du créneau au lieu de l'écraser. Quitter une liste d'attente ne dit plus « prévenu·e » : « Tu ne recevras plus de message si une place se libère ».
- **Se déconnecter sur téléphone** : dans le menu du compte, toucher « Se déconnecter » refermait le menu avant que l'action ne parte, et rien ne se passait (constaté sur iPhone ; les navigateurs qui ne donnent pas le focus à un bouton touché ou cliqué sont concernés). Le menu reste ouvert jusqu'au toucher et la déconnexion fonctionne ; il se ferme toujours quand on touche ailleurs ou quand le focus clavier le quitte.
- **Erreurs Sentry des analyseurs de liens** : quand Outlook (Safe Links, Defender) analyse le lien personnel d'un email, son navigateur intégré rejette une promesse (« Object Not Found Matching Id… ») qui remontait comme une erreur de la page personnelle. Elle est ignorée, comme celles des extensions de navigateur.
- **Focus clavier en contraste élevé** (#579, suite de #574) : avec un thème de contraste Windows (couleurs forcées), la plupart des champs, les listes déroulantes, l'interrupteur de la charte et les zones à défilement de l'import n'affichaient aucun repère au focus clavier, car leur anneau de focus est une ombre que ce mode supprime. Ils affichent maintenant un contour dans la couleur système : formulaire d'inscription public, champs de l'administration, recherche et filtres de la page Inscriptions, choix du créneau, import de membres. En couleurs forcées, l'interrupteur de la charte montre aussi son état (activé ou non), et la coche du créneau choisi prend la couleur système. L'interrupteur est aussi annoncé avec son nom (« Assurance RC fournie par l'organisation »). Seules les cibles focalisées par le code (`tabIndex={-1}`) gardent `outline-none` ; exception : une cible focalisée par le code qui affiche un anneau `focus-visible:ring-*` en affichage normal (paragraphes de résultat de l'import) prend aussi `focus-visible:outline-hidden`, pour garder un repère en couleurs forcées. L'affichage normal ne change pas.
- **Choisir un créneau sur un petit écran** (#574) : sur la page des inscriptions, la liste des créneaux (ajout manuel et filtre par créneau) pouvait dépasser à droite de l'écran, et à 320 px de large ou avec un fort zoom, le remplissage et les mentions « Déjà inscrit » et « ⚠ conflit » pouvaient être coupés. La liste reste dans l'écran, ses lignes passent à la ligne sans rien couper, et le créneau choisi s'affiche en entier dans le champ ; sur un écran d'ordinateur, l'affichage est le même, sauf près du bord droit, où la liste se décale vers la gauche.
- **Ajout manuel sans créneau** (#574) : le message « Sélectionnez un créneau. » s'affiche sous le champ « Créneau * », qui est indiqué comme obligatoire, puis non valide jusqu'au choix d'un créneau, et le focus y est placé ; un lecteur d'écran lit le message une seule fois, avec le champ. Un conflit d'horaire décrit aussi le champ, sans le rendre non valide.
- **Annonces de la page des inscriptions** (#574) : après un ajout ou un retrait, seul le résultat est annoncé, et non plus en même temps le nombre d'inscriptions affichées ; ce nombre est annoncé quand un filtre change (après une courte pause pour la recherche), et un changement de filtre remplace le dernier message. Les annonces d'un ajout manuel, de la désignation et du retrait d'un responsable de secteur ne contiennent plus de « · » ni de « ·e », lus à voix haute par les lecteurs d'écran (par exemple « Inscription de Chloé Roy ajoutée : Bar, sam. 4 juil., de 10h à 12h. »), et le créneau choisi est lu en mots.
- **Choix Timeline / Liste de la page Créneaux** : les deux boutons sont des boutons bascule, regroupés sous le nom « Affichage des créneaux » (`aria-pressed`) : un lecteur d'écran peut annoncer la vue choisie et son changement. Le contour de focus n'est plus coupé sur les bords du groupe, et en contraste élevé (couleurs forcées) la vue choisie se distingue de l'autre. L'affichage normal ne change pas. (#554)
- **Formulaire de créneau de la page Créneaux** : à l'ouverture (« + Ajouter un créneau » ou « Modifier »), le focus va dans le champ « Poste ». Un champ obligatoire vide est indiqué sous le champ lui-même (« Indiquez le poste. », « Indiquez l'heure de fin. »…), qui est marqué non valide, et le focus va sur le premier ; le message est lié au champ et n'est plus doublé par une alerte, et le rappel visible ne parle plus de « champs en rouge ». Un poste fait d'espaces et une capacité vide sont refusés. Une erreur du serveur est annoncée, le focus restant sur le bouton, qui reste atteignable pendant l'enregistrement (« Ajout en cours… »). Après « Annuler » ou un enregistrement, le focus revient sur le bouton qui a ouvert le formulaire, ou sur « + Ajouter un créneau » s'il n'est plus affiché, et le résultat est annoncé une fois, en mots (« Créneau ajouté : Bar, samedi 4 juillet, de 10h à 12h. »). Les bordures d'erreur sont plus contrastées. (#554)
- **Panneau « Gérer les postes » de la page Créneaux** : « Gérer les postes » ouvre et referme le panneau (un second clic le referme au lieu de remettre l'ordre en cours à zéro) et indique s'il est ouvert ; le rouvrir laisse le focus sur le bouton, même si un éditeur du panneau était resté ouvert. Le focus n'est plus perdu : après un renommage (« Valider » ou Entrée), « Annuler » ou Échap, il revient sur « Renommer » du poste ; après le choix d'une couleur, sur le bouton de couleur du poste ; après « Fermer » ou « Enregistrer l'ordre », sur « Gérer les postes » ; et sur le titre du panneau si la ligne du poste n'est plus affichée. Le renommage est annoncé en mots (« Poste « Bar » renommé en « Buvette ». »). Une erreur de renommage s'affiche sous le champ, qui est marqué non valide ; elle est annoncée une seule fois : comme alerte si le champ avait déjà le focus (Entrée), sinon le focus va sur le champ, qui la lit avec lui. La même règle vaut pour une limite par personne non valide envoyée avec Entrée, qui n'était pas annoncée. Le choix de couleur reste ouvert pendant l'enregistrement et en cas d'erreur, se ferme avec Échap, et « Automatique » indique s'il est choisi. « Valider », « Enregistrer l'ordre » et les couleurs restent focalisables pendant l'enregistrement et gardent leur nom (plus de « … »). Les boutons qui ouvrent un panneau (« Gérer les postes », « Créer une série », couleur, « Limite », « Accès ») ne pointent vers ce panneau que lorsqu'il est affiché. (#554)
- **Réordonner les postes au clavier** : dans « Gérer les postes », chaque poste a des flèches Monter et Descendre, en plus du glisser-déposer qui demandait une souris. Le focus reste sur le bouton pressé et chaque déplacement est annoncé (« Bar déplacé en position 2 sur 5. ») ; aux extrémités, le bouton reste atteignable et dit que le poste est déjà en première ou en dernière position. Les postes forment une liste ordonnée, annoncée comme telle, et les lignes se replient sur un petit écran. Après un renommage ou une modification d'un poste, le focus ne retombe plus parfois sur le titre du panneau quand la page est lente. (#554)

---

## [2.0.2] — 2026-10-01

### Sécurité

- **Organisation choisie par l'en-tête de la requête** (#541) : sur le domaine principal, sans `?org=`, un en-tête `x-org-slug` envoyé par le navigateur était transmis tel quel aux pages et routes publiques, qui s'en servent pour choisir l'organisation. Il est désormais toujours supprimé avant que le proxy n'ajoute la sienne. Seules des données publiques étaient concernées.
- **Lecture d'une invitation de membre** (#541) : l'adresse qui pré-remplit le formulaire d'inscription à partir d'une invitation (nom, email, téléphone du membre) n'avait aucune limite de requêtes. Elle est limitée à 30 lectures par heure et par adresse IP, vérifiée avant toute lecture, et refuse une invitation qui n'appartient pas à l'organisation du site, avec la même réponse que pour un lien inconnu.
- **Formules dans les exports CSV** (#567) : un nom, un commentaire, une réponse ou un numéro saisi dans le formulaire public pouvait commencer par `=`, `+`, `-` ou `@` et s'exécuter comme une formule à l'ouverture de l'export dans Excel ou LibreOffice. Dans les exports des membres, du journal d'activité et des présences, ces valeurs sont précédées d'une apostrophe et s'affichent comme du texte ; les autres valeurs sont inchangées.

### Corrigé

- **Heures planifiées des membres** (#571) : la colonne « Heures cumulées » de la page Membres s'appelle « Heures planifiées », car elle additionne la durée prévue des créneaux confirmés, créneaux à venir et absences comprises, et non le temps passé. Un créneau pendant un changement d'heure y était compté une heure de trop ou de moins ; il compte maintenant sa durée réelle dans le fuseau de l'organisation.
- **Choisir un créneau au clavier sur la page des inscriptions** (#555) : dans le formulaire d'ajout manuel et dans le filtre par créneau, la liste des créneaux ne s'utilisait qu'à la souris. Elle s'ouvre et se parcourt maintenant au clavier (flèches, Début, Fin, première lettre du poste), Entrée choisit et Échap ferme sans rien changer ; chaque créneau a un nom complet pour les lecteurs d'écran (date, heures, poste, remplissage, déjà inscrit, conflit d'horaire), vérifié avec VoiceOver et Safari sur macOS ; NVDA, VoiceOver sur iOS, le zoom à 200 % et les petits écrans restent à vérifier (#574), et le filtre est nommé « Filtrer par créneau ». Le créneau choisi est coché, le créneau parcouru est entouré, et les mentions « Complet » et « ⚠ conflit » sont plus contrastées. Sur la même page : le tableau a un titre ; la barre d'actions sur la sélection est nommée et ses boutons ne perdent plus le focus pendant une action ; après « Annuler » ou un ajout manuel, le focus revient sur « + Ajouter manuellement » et l'ajout est annoncé.
- **Désinscription depuis la page d'un événement** : quand on fermait la confirmation de désinscription d'un créneau déjà pris, le focus clavier se perdait au lieu de revenir sur le bouton du créneau. Il y revient.

---

## [2.0.1] — 2026-10-01

### Sécurité

- **Emails sans serveur SMTP configuré** : en production, un envoi sans `SMTP_HOST` était compté comme réussi alors que rien ne partait, et le destinataire comme le contenu de l'email (liens personnels compris) étaient écrits dans les journaux du conteneur. L'envoi échoue désormais avec une raison sans donnée personnelle : la file d'envoi le retente puis alerte, et les envois directs le signalent à l'écran. En développement, les emails restent affichés dans la console. Les journaux d'un échec d'envoi ne contiennent plus l'adresse du destinataire.
- **Comptes d'une organisation supprimée** : le nettoyage nocturne effaçait une organisation désactivée depuis 30 jours sans effacer ses administrateurs actifs, qui restaient en base sans organisation (email et mot de passe haché conservés sans limite) et pouvaient encore se connecter, sans rien pouvoir administrer. Ils sont maintenant effacés avec l'organisation, comme lors d'une suppression par le super admin ; les comptes laissés sans organisation par un nettoyage précédent sont effacés au nettoyage suivant, et un compte d'organisation sans organisation ne peut plus se connecter.

### Modifié

- **Page d'accueil de benevol.app.** Elle dit ce que l'outil change pour une association : la page d'inscription sur téléphone, les trois étapes de la mise en place, trois captures (où il manque du monde, les messages, les feuilles du jour J), ce sur quoi compter (gratuit, open source, hébergé en France, sans pistage, accessible) et une foire aux questions. Pour les moteurs de recherche et les partages : titre et description réécrits, image de partage, données structurées (site, application, code source, questions fréquentes) et une icône propre au site à la place de l'icône par défaut.

### Documentation

- **Documentation relue contre le code.** API (routes manquantes, niveau propriétaire, limites de requêtes), architecture (couches, flux d'inscription, file d'envoi, observabilité), rôles et permissions (qui peut quoi), configuration (secrets Kubernetes, vérifications au démarrage), déploiement (ordre réel de `deploy.yml`, manifestes, seuils de la page Santé), rotation des journaux sur k3s, dossier RGPD et guide de contribution. Les durées de conservation des comptes administrateurs, dans le guide organisateur et la politique de confidentialité, décrivent ce que fait le nettoyage. La déclaration d'accessibilité liste exactement ce que les tests analysent et les limites connues de la page personnelle et du planning public.

---

## [2.0.0] — 2026-09-30

### Mise à jour depuis 1.x

Version majeure : une installation 1.x ne se met pas à jour sans préparation. `TOKEN_ENCRYPTION_KEY` est obligatoire en production (le serveur refuse de démarrer sans elle), les migrations passent par le Job `k8s/job-migrate.yaml` avant la mise à jour de l'application, et deux manifestes s'ajoutent (`k8s/ingressroute-tokens.yaml`, `k8s/traefik-config.yaml`). Pas de retour à 1.x sans restaurer une sauvegarde. Étapes complètes : [Mise à jour depuis 1.x](docs/deploiement.md#mise-à-jour-depuis-1x).

### Ajouté

#### Mise en route

- **Premiers pas** : une nouvelle organisation voit, en haut de la liste des événements et du tableau de bord, les étapes de mise en place dans l'ordre (page publique et charte, fuseau horaire, premier événement, créneaux, publication, inscription de test), avec un lien vers chacune. Les étapes se cochent d'elles-mêmes ; la liste disparaît une fois la mise en place faite, ou peut être masquée.
- **Ce qui demande votre attention** : le tableau de bord commence par les situations à traiter sur vos événements publiés (créneaux bientôt pas complets, places de liste d'attente qui expirent, jalons en retard, invitations non utilisées, postes sans responsable, événement qui commence, événement terminé à archiver), de la plus urgente à la moins urgente, avec un lien vers chacune.
- **Création en trois étapes** : informations, postes et créneaux, puis une page de vérification qui liste ce qui est prêt et ce qui manque, propose l'aperçu bénévole et publie (ou laisse en brouillon). L'assistant se quitte à tout moment, chaque étape restant une page normale de l'administration.
- **Modèles d'événement** : à la création d'un événement, cinq modèles (festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage) créent un brouillon déjà rempli de ses postes et créneaux à partir d'un titre et d'une date. Tout se modifie ensuite comme d'habitude.
- **Duplication avec choix** : **Dupliquer** ouvre une page où l'on choisit le titre de la copie, son premier jour (toutes les dates sont décalées d'autant) et ce qui suit : créneaux, messages et réglages d'inscription, pages personnalisées, responsables de secteur (décochés par défaut, chacun reçoit un email avec son lien). Un récapitulatif dit ce qui va être créé. Les inscriptions ne sont jamais copiées.

#### Suivre un événement

- **Alerte de charge** : plus de 8 h de créneaux dans une journée, ou plus de 6 h d'affilée sans pause d'au moins 30 minutes, sont signalés sans rien bloquer. Le bénévole le voit dans le récapitulatif avant de confirmer (créneaux déjà pris compris), l'organisateur sur la ligne de l'inscription, avant un ajout manuel et dans « Ce qui demande votre attention ». Heures réelles dans le fuseau de l'organisation, changement d'heure compris ; un créneau de nuit compte pour le jour où il commence ; la liste d'attente ne compte pas.
- **Où en est l'événement ?** : en haut de la page d'un événement, une barre d'étapes (Brouillon → Prêt à publier → Publié → Terminé → Archivé) dit ce qui manque encore et ce que l'étape signifie concrètement : visible ou non pour les bénévoles, rappels envoyés ou non, suppression possible seulement une fois archivé.
- **Où manque-t-il du monde ?** : chaque événement a une page qui s'ouvre sur une vue d'ensemble (places pourvues, barre de remplissage, phrase de synthèse), puis liste les postes sans personne, les créneaux à compléter du plus dégarni au plus proche du complet avec leur taux de remplissage, les personnes en liste d'attente, les postes sans responsable de secteur et les créneaux complets, chaque ligne menant là où on agit ; un message confirme quand il n'y a rien à faire. Sur la page de l'événement, le bloc « Créneaux à pourvoir » est remplacé par une phrase (« Il manque encore 12 personnes sur 20 places ») et le lien vers cette page.
- **Aperçu comme un bénévole** : depuis la page d'un événement, **Prévisualiser comme un bénévole** montre la page publique telle que la verront les bénévoles, même pour un brouillon. Le formulaire peut être rempli : l'aperçu affiche alors le message de confirmation et l'email que recevrait le bénévole, sans rien enregistrer ni envoyer.
- **Présences** : dans les inscriptions d'un événement, **Marquer présents** note qui est venu (badge **Présent**, compteur, journal), **Annuler la présence** corrige, et **Exporter les présences (CSV)** télécharge la feuille de présence. Sans terminal ni badge : juste savoir qui est venu.

#### Créneaux

- **Inscriptions sur validation** : un créneau peut être « Sur validation » (conduite, caisse, sécurité…). Une inscription y devient une demande qui garde sa place ; le bénévole le voit clairement (page, récapitulatif, email « Demande reçue », page personnelle où il peut la retirer). Dans les inscriptions, **Accepter** ou **Refuser** avec un récapitulatif, un filtre **Demandes à traiter**, et les demandes en attente dans « Ce qui demande votre attention ». Accepter envoie la confirmation habituelle ; refuser libère la place pour la liste d'attente et envoie un email sans raison, sauf message facultatif. Chaque décision est journalisée. Les demandes ne reçoivent pas les rappels, sont hors des feuilles de présence et de « tous les inscrits », et comptent pour les doublons, les chevauchements et la limite par personne. Copié avec l'événement. Une demande garde sa place : elle n'est pas comptée dans les places restantes de la page de l'événement ni comme manquante dans « Où manque-t-il du monde ? », qui l'affichent à part, et elle n'apparaît pas dans les coordonnées de l'export PDF.
- **Postes réservés à certains membres** : dans **Gérer les postes**, « Accès » réserve un poste aux membres portant une étiquette (par exemple `sécurité`). Ils s'y inscrivent avec le lien personnel de leur invitation ; sans ce lien, la page publique marque le poste « Réservé » et l'API refuse l'inscription, en lisant les étiquettes du membre au moment de l'inscription. Les étiquettes ne sont jamais montrées aux bénévoles ; l'ajout manuel reste possible ; copié avec l'événement.
- **Limite de créneaux par personne sur un poste** : dans **Gérer les postes**, un poste peut limiter le nombre de ses créneaux qu'une même personne prend (confirmés et liste d'attente comptés). La page publique le dit avant l'envoi ; le serveur le vérifie sous verrou, même pour deux inscriptions simultanées. L'administration peut dépasser la limite en ajoutant quelqu'un à la main, après un avertissement. Copiée avec l'événement.
- **Série de créneaux** : dans les créneaux d'un événement, **Créer une série** crée d'un coup tous les créneaux qui se suivent sur une plage horaire (par exemple une buvette de 10 h à 22 h par créneaux de deux heures), avec un aperçu avant création. Chaque créneau reste ensuite modifiable séparément.
- **Modifications rapides depuis le planning** : la fenêtre d'un créneau permet de le dupliquer (copie juste après, mêmes réglages), de décaler ses horaires (les inscrits sont prévenus), de fermer ou rouvrir ses inscriptions et d'appliquer un nombre de places à tous les créneaux du poste, jamais en dessous des inscrits déjà confirmés.
- **Infos pratiques par créneau** : un créneau peut porter un lieu de rendez-vous, une personne de contact (nom, téléphone) et une consigne courte. Le lieu et la consigne sont visibles sur la page d'inscription ; la personne de contact et son téléphone ne sont envoyés qu'aux inscrits (email de confirmation, rappels, page personnelle).

#### Page publique

- **Questions aux bénévoles** : jusqu'à 5 questions par événement dans le formulaire d'inscription (texte court, oui/non, choix unique ou multiple, obligatoire ou non), vérifiées par le serveur. Les réponses apparaissent sous chaque inscription, dans la feuille de présence CSV et l'archive, et dans le récapitulatif avant l'envoi. Une question avec réponses garde son type et ses choix utilisés ; retirée, elle quitte le formulaire mais ses réponses restent jusqu'à la suppression de l'événement. Copiées avec les réglages lors d'une duplication. Une réponse existante n'est remplacée qu'avec l'invitation du bénévole ; sans elle, seules les réponses manquantes sont ajoutées.
- **Ouverture et fermeture des inscriptions** : un événement publié peut montrer son planning sans accepter d'inscription. Dans l'édition, la section **Inscriptions** ouvre ou ferme les inscriptions et permet de programmer une ouverture et une fermeture (heure de l'organisation). La page publique explique pourquoi on ne peut pas s'inscrire et jusqu'à quand c'est ouvert ; l'API refuse toute inscription hors de la fenêtre, et la liste d'attente ne propose plus de place une fois fermé. Les copies et les modèles démarrent fermés.
- **Événements non répertoriés** : dans l'édition d'un événement, décocher **Afficher cet événement sur la page publique de l'organisation** le retire de la page d'accueil, de la liste publique et du sitemap (et des moteurs de recherche) tout en le laissant accessible par son lien, avec ses inscriptions. Utile pour un planning réservé aux organisateurs. Ce n'est pas un accès protégé : toute personne qui a le lien peut l'ouvrir. L'administration affiche « Publié — non répertorié » ; les copies et les modèles créent toujours un événement répertorié.
- **Couleur de la page publique** : dans les réglages d'un événement, une couleur de la palette (celle des postes) colore l'en-tête de la page d'inscription, avec un aperçu ; le texte reste blanc sur fond foncé. Elle est copiée avec les réglages lors d'une duplication. Pas encore de logo.
- **Voir sur la carte** : un événement et, au besoin, chaque créneau peuvent porter des coordonnées GPS (collez un lien OpenStreetMap ou Google Maps, ou « latitude, longitude ») ; un créneau sans coordonnées prend celles de l'événement. Les bénévoles ont un lien **Voir sur la carte** vers OpenStreetMap sur la page d'inscription, dans le récapitulatif, les emails de confirmation et de rappel et leur page personnelle. Aucune requête vers un service de cartes n'est faite avant le clic. Pas encore de recherche d'adresse.

#### Bénévoles et emails

- **Modèles de messages** : une organisation enregistre jusqu'à 20 modèles (nom, objet, texte) ; « Partir d'un modèle » les reprend dans « Écrire aux bénévoles », modifiables avant l'envoi. Variables `{prénom}`, `{événement}`, `{poste}`, `{créneau}`, remplacées pour chaque destinataire (notification comprise) ; une variable inconnue ou hors de son public bloque l'envoi au lieu de partir telle quelle.
- **Ajouter à mon calendrier** : la page personnelle du bénévole propose un fichier `.ics` de ses créneaux confirmés (ou d'un seul), aux heures du fuseau de l'organisation, changement d'heure et créneaux de nuit compris, avec le lieu, les infos pratiques et le lien vers la page. Seulement avec le lien personnel ; la liste d'attente n'est pas incluse. Réimporter le fichier remplace les créneaux au lieu de les dupliquer.
- **Écrire aux invités sans créneau confirmé** : nouveau public de « Écrire aux bénévoles », les membres invités qui n'ont encore aucune inscription confirmée (liste d'attente comprise, le compteur la distingue) ; leur email contient leur lien d'invitation « Choisir mes créneaux ». Le tableau de bord compte ces personnes et renvoie vers ce message ; la page des invitations parle de « sans créneau confirmé » et y renvoie aussi.
- **Notification avec un message ciblé** : « Écrire aux bénévoles » peut envoyer aussi une notification sur le téléphone des destinataires qui les ont activées ; l'email part à tous dans tous les cas. Le formulaire, l'aperçu et la confirmation indiquent le nombre d'appareils ; la notification montre l'objet et la première ligne et ouvre la page personnelle. Son résultat est suivi à part des emails dans l'historique, et les appareils disparus sont retirés.
- **Historique des messages** : sous « Écrire aux bénévoles », chaque message envoyé pour l'événement avec sa date, son auteur, son objet et son texte, le public choisi, le nombre de destinataires et la remise (envoyés, en échec, en attente), toujours juste après la purge nocturne de la file d'envoi. **Renvoyer les emails en échec** ne renvoie que ceux-là, une fois. Conservé 12 mois ; les destinataires ne sont pas listés.
- **Écrire aux bénévoles** : depuis un événement, un email avec objet et message à tous les inscrits, aux bénévoles d'un poste ou d'un créneau, ou aux personnes en liste d'attente. Le nombre de destinataires s'affiche, l'aperçu montre l'email tel qu'il sera reçu, et l'envoi est confirmé puis noté dans le journal. Chaque personne le reçoit une fois, avec ses créneaux concernés.
- **Disponibilités des bénévoles** (facultatives) : un bénévole peut indiquer sur sa page personnelle quand il est en général disponible (matin, après-midi, soir) et une remarque ; l'admin le voit et peut le modifier dans la fiche du membre, la liste des membres, les inscriptions et l'ajout manuel. Aucune attribution automatique : chacun choisit toujours ses créneaux.
- **Lien personnel expliqué** : la page personnelle rappelle que le lien est privé, la date du dernier email qui le contenait, propose de le recevoir à nouveau par email et, si l'organisation a une adresse de contact, d'écrire à l'organisation. Un lien invalide mène à une page qui explique pourquoi et permet de demander un nouveau lien en indiquant son adresse email.
- **Réglages des emails** : dans Paramètres → Emails, chaque organisation choisit quels rappels automatiques partent (J-2, J-1, jour J), si les administrateurs sont prévenus à chaque inscription, et l'adresse à laquelle arrivent les réponses des bénévoles ; un bouton envoie un email de test à votre propre adresse.
- **Emails envoyés** : dans les paramètres, la liste des emails de l'organisation (confirmations, rappels, messages…) avec leur état : en attente, nouvel essai prévu, envoyé, échec définitif, la raison du dernier échec et un bouton **Renvoyer** pour ceux en échec.

#### Rapports et exports

- **Rapports** : le lien **Rapports** de la page d'un événement remplace « Exporter PDF » et regroupe l'export complet (en couleur, en premier), l'archive de l'événement et des documents à imprimer, lisibles en noir et blanc et économes en encre : planning par jour, planning par poste (avec le responsable) et planning individuel par bénévole, en frise avec les prénoms dans les créneaux et, pour le planning individuel, les lieux, contacts et consignes ; feuille de présence avec cases à cocher et lignes vides ; liste avec téléphones pour les organisateurs, où chaque jour n'est écrit qu'une fois, suivi des horaires de ses créneaux.
- **Badges à imprimer** : depuis Rapports, un badge par bénévole inscrit (prénom, nom, poste, créneaux, bandeau à la couleur du poste ou de l'événement), dix par feuille A4 à découper ; filtre par poste et réimpression du badge d'une seule personne, choisie dans la liste des inscrits. Sans photo ni code QR.
- **Exports et portabilité** : archive JSON complète d'un événement (depuis Rapports), export CSV de tous les membres et de tout le journal d'activité ; le guide administrateur et la politique de confidentialité indiquent les durées de conservation et la procédure de suppression d'une organisation.

#### Administration

- **Rôle Organisateur** : à côté des propriétaires (tous les admins existants), un organisateur gère les événements, créneaux, inscriptions, membres et messages, mais pas l'équipe d'administration, les réglages de l'organisation ni la suppression définitive d'un événement. Un propriétaire choisit le rôle à l'invitation (Organisateur par défaut) et peut le changer ; l'organisation garde toujours un propriétaire actif. Les droits sont vérifiés côté serveur sur chaque route, d'après une matrice testée.
- **Activité d'un membre** : depuis la liste des membres, **Activité** ouvre la chronologie factuelle d'un membre (invitations, inscriptions, liste d'attente, annulations, présences, responsabilités de secteur, modifications de la fiche), datée dans le fuseau de l'organisation et reliée à chaque événement, avec un résumé en une phrase. Aucun score ni appréciation.
- **Aperçu avant l'import de membres** : l'import CSV ou Excel analyse d'abord le fichier sans rien enregistrer : membres à créer, à mettre à jour ou ignorés, lignes en erreur avec leur numéro et la raison, tags ajoutés ou réutilisés. L'import confirmé applique exactement cet aperçu ; si le fichier ou les membres ont changé entre-temps, rien n'est écrit et l'aperçu à jour s'affiche. Les emails en double dans le fichier sont signalés, la comparaison ignore les majuscules. Limites : 2 Mo et 5000 lignes par fichier, et un nombre d'analyses et d'imports par heure. L'import est inscrit une fois dans le journal d'activité, sans données personnelles.
- **Recherche globale** : la loupe **Rechercher** de la barre du haut de l'administration ouvre un champ (un clic, ou **Ctrl + K**, **⌘ + K** sur Mac ; **Échap** le referme) qui retrouve un bénévole, ses inscriptions, un événement ou un créneau dans toute l'organisation, sans tenir compte des accents, avec un lien vers la page Membres ou les inscriptions déjà filtrées sur le résultat.
- **Fuseau horaire par organisation** : dans les paramètres, une organisation peut choisir le fuseau de ses événements (Europe/Zurich par défaut). Il sert aux rappels, à l'heure limite des places proposées en liste d'attente, au journal de l'événement et à l'export PDF.
- **Santé du service** (super admin) : une page qui rassemble l'état de la base, de la file d'emails, des tâches planifiées (rappels, nettoyage), des sauvegardes (dump, copie hors site, dernier test de restauration), des migrations appliquées, de la version déployée et de la configuration (SMTP, push, secrets). Les tâches enregistrent leur dernier passage ; les sauvegardes le signalent par un battement de cœur.
- **Page Fonctionnalités** : `www.benevol.app/fonctionnalites` présente ce que fait benevol.app, besoin par besoin ; la page d'accueil et la documentation y renvoient. La page d'accueil et chaque page de documentation ont leur propre titre, leur description et leur adresse canonique.
- **Sitemap du site principal** : `www.benevol.app/sitemap.xml` liste la page d'accueil, la page Fonctionnalités et les pages de documentation, avec la date de dernière modification de leur contenu, et `robots.txt` le référence.

### Modifié

#### Politique de confidentialité

- **Copie de sauvegarde hors site** : la politique de confidentialité nomme désormais Dropbox, qui reçoit chaque nuit une copie chiffrée de la base (stockage aux États-Unis, offre sans accord de traitement spécifique), en précisant que c'est provisoire. Elle ne dit plus que chaque prestataire est lié par un accord de traitement.

#### Formulaires et actions de l'administration

- **Formulaires de l'administration** (connexion, mot de passe oublié, nouveau mot de passe, activation d'un compte, invitation d'un administrateur, membres et import, responsables de secteur, créneaux, séries et postes, jalons, pages d'information, invitations et relances, rappel manuel, super-admin) : les erreurs s'affichent à côté du champ concerné et sont annoncées, la saisie est conservée, un double clic n'envoie rien deux fois, une panne de réseau est expliquée avec **Réessayer** au lieu d'un écran figé, et le remplissage automatique convient aux gestionnaires de mots de passe. Supprimer ou désactiver (membre, responsable de secteur, créneau, poste, jalon, page, organisation) demande une confirmation qui dit ce qui va se passer, par exemple combien de bénévoles inscrits seront prévenus ; supprimer une organisation demande de taper son identifiant dans la fenêtre.
- **Actions groupées sur les inscriptions** (retirer de leur créneau, rendre responsable, renvoyer le lien, relancer les invités) : une confirmation récapitule d'abord ce qui va se passer (personnes concernées, emails envoyés, places proposées à la liste d'attente). Un retrait laisse ensuite 10 secondes pour changer d'avis : rien n'est enregistré ni envoyé avant, **Annuler le retrait** remet les lignes en place et **Retirer maintenant** n'attend pas. La sélection part en une seule opération, et rien n'est fait si une des inscriptions n'est plus valide ; « Renvoyer le lien » n'envoie qu'un email par bénévole. Une action qui échoue garde la sélection, dit si quelque chose a pu être appliqué et propose **Réessayer** ; une fois l'action faite, **Voir dans le journal** ouvre le journal de l'événement à la bonne date.
- **Publication** : un événement ne peut plus être publié sans créneau, quel que soit le chemin (formulaire d'édition, bouton Publier, API) ; le message l'explique. La création se fait toujours en brouillon, le choix du statut n'apparaît plus à cette étape.

#### Inscription des bénévoles

- **Formulaire d'inscription** : une erreur garde tout ce qui a été saisi et dit de quoi il s'agit (champ à corriger, créneau plus disponible, connexion interrompue, erreur du serveur), avec **Réessayer** quand c'est utile et l'assurance qu'un second envoi ne crée pas de doublon.
- **Récapitulatif avant de confirmer** : sur la page d'inscription, le récapitulatif reprend les créneaux choisis dans l'ordre avec le jour et les heures (« fin le lendemain » quand un créneau passe minuit), ce qui les sépare (enchaînés, pause, chevauchement signalé avant l'envoi), inscription ferme ou liste d'attente, âge minimum, et la liste exacte des données transmises à l'organisation.
- **Liste d'attente expliquée** : la même explication en cinq points (inscription pas encore confirmée, ordre, email avec 24 heures pour prendre la place, comment accepter, ce qui se passe sans réponse) apparaît dans le récapitulatif avant confirmation, sur la page de succès, dans l'email et sur la page personnelle, qui montre aussi les inscriptions en liste d'attente avec leur position et, quand une place est proposée, le délai et le lien pour la prendre.

#### Navigation et accessibilité

- **Documentation** : les captures d'écran des guides sont refaites sur un événement de démonstration et complétées (tableau de bord, « Où manque-t-il du monde ? », demandes à valider, questions, messages, rapports, membres et activité, page du responsable, sélection des créneaux, page personnelle), avec des textes alternatifs à jour.
- **Pied de page** : le nom, le numéro de version et le lien vers le code source forment un seul lien (« benevol.app v… »), précédé du logo GitHub.
- **Déclaration d'accessibilité** : une page publique `/accessibilite` (lien en pied de page) dit le niveau visé (WCAG 2.2 AA), l'état (partiellement conforme, en auto-évaluation), ce qui est vérifié et comment, ce qui ne l'est pas encore, les limites connues et comment signaler un problème. Les parcours critiques sont désormais analysés automatiquement par axe-core dans les tests de bout en bout.
- **Barre du haut de l'administration sur mobile** : sur un petit écran, les liens sont regroupés sous un bouton **Menu** au lieu de déborder de l'écran ; le menu du compte reste accessible. La page en cours est aussi soulignée, en plus d'être en couleur.
- **Menu du compte** : dans la barre du haut, votre nom ouvre un menu avec **Mon compte** et **Se déconnecter**. Le changement de mot de passe quitte la page Paramètres pour une page **Mon compte** dédiée, avec des libellés et messages d'erreur en français.
- **Filtres sans accents** : les filtres des pages Membres et Inscriptions ignorent les accents : « zoe » trouve Zoé, « francois » trouve François.
- **Accessibilité** : un lien « Aller au contenu », visible dès qu'on le tabule, ouvre chaque page de l'administration, de la documentation et de la page Fonctionnalités et saute la barre du haut. Dans la documentation et les pages légales, les liens sont soulignés, et le thème sombre de la documentation ne déborde plus sur la page d'accueil.

#### Fiabilité et technique

- **Politique de conservation vérifiable** : les durées de conservation ont une source unique ; le nettoyage quotidien les lit, et un test vérifie que le guide administrateur, la politique de confidentialité, la nouvelle page technique `docs/retention.md` et la rotation des sauvegardes disent la même chose. Les journaux techniques (90 jours) sont signalés comme une procédure manuelle sur le serveur.
- **Emails plus fiables** : les emails liés à une action (inscription, notification aux administrateurs et aux responsables, liste d'attente, créneau modifié ou annulé, invitation d'un responsable de secteur, invitation et bienvenue d'un administrateur, mot de passe oublié) passent par une file d'envoi enregistrée en même temps que l'action. L'action n'attend plus l'envoi, un arrêt du serveur au mauvais moment ne peut plus laisser une action faite sans son email, et un email en échec est renvoyé automatiquement.
- **Limitation des tentatives** (connexion, inscription, liens de gestion, mot de passe oublié) : les compteurs sont stockés dans la base de données. Ils ne sont plus remis à zéro à chaque redéploiement et restent justes si l'application tourne sur plusieurs instances.

### Corrigé

#### Navigation et affichage

- **Barre de l'administration** : les libellés (« Tableau de bord »…) ne passent plus sur deux lignes sur une tablette ou en super admin ; la barre resserre ses espacements et le nom de l'organisation se tronque à la place.

#### Inscriptions et liste d'attente

- **Dates vérifiées par l'API** : une date de naissance invalide, inexistante ou future est refusée (elle permettait de contourner l'âge minimum d'un créneau) ; les dates d'événement, de programme et de créneau doivent être des jours réels au format AAAA-MM-JJ, et la fin d'un événement ne peut plus précéder son début, y compris lors d'une modification ; un créneau (seul ou en série) doit tomber pendant son événement, et la date de départ d'une duplication ou d'un modèle doit être un jour réel.
- **Liste d'attente** : si la proposition d'une place libérée échoue au moment d'une annulation (panne ponctuelle), la tâche horaire la rattrape : pour chaque créneau à venir ayant une place libre et des personnes en attente, la place est proposée à la suivante. Auparavant elle pouvait rester libre durablement.
- **Inscription refusée** : une inscription publique refusée (créneau complet entre-temps, chevauchement, doublon) ne laisse plus de fiche membre créée pour une nouvelle adresse email.

#### Événements et créneaux

- **Heures après minuit** : des horaires enregistrés au-delà de 23 h 59 (par exemple 24:00, 25:30 ou 26:00 pour la nuit) s'affichaient tels quels (« 24h–26h »). Ils se lisent maintenant comme une heure d'horloge (« 0h–2h ») partout : sélecteur de créneau de l'administration, recherche, emails, exports et badges.
- **Dernier créneau annulé** : annuler le dernier créneau actif d'un événement publié (ou supprimer son dernier poste) le repasse en brouillon au lieu de laisser une page publique vide ; l'administration le signale et le journal le note.
- **Duplication d'un événement** : les créneaux copiés gardent leur âge minimum, leur liste d'attente et la couleur choisie pour le poste.
- **Création d'événement** : l'API ne peut plus créer un événement directement archivé ; tout statut envoyé à la création est ignoré.

#### Emails, invitations et horaires

- **Fichier calendrier (.ics)** : un point-virgule dans le lieu, la consigne ou le contact d'un créneau est désormais échappé comme le veut le format, au lieu d'être laissé tel quel.
- **Heures des rappels et des emails** : les heures des créneaux étaient traitées comme des heures UTC, ce qui décalait de 1 h (hiver) ou 2 h (été) les rappels « jour J » et l'heure d'expiration affichée dans l'email d'offre de liste d'attente ; même décalage dans les heures du journal de l'événement et de l'export PDF. Elles sont désormais calculées dans le fuseau des événements (`APP_TIME_ZONE`, Europe/Zurich par défaut) ; une valeur invalide empêche l'application de démarrer, avec un message explicite.
- **Lien d'invitation d'une organisation** : cliquer sur **Envoyer l'invitation par email** renouvelle le lien (l'ancien cesse de fonctionner) ; l'écran affiche désormais le nouveau lien au lieu de l'ancien, et la fiche d'une organisation permet de **Renvoyer l'invitation** à un administrateur en attente en montrant le lien généré.

#### Données et exploitation

- **Modifier l'email d'un membre** : une adresse déjà utilisée par un autre membre de l'organisation provoquait une erreur serveur ; le formulaire affiche maintenant le message à côté du champ Email.
- **Adresse avec une double barre oblique** : une adresse comme `benevol.app//events` faisait planter la page dans le navigateur. Elle redirige désormais vers l'adresse propre (`/events`), paramètres conservés.
- **Adresses email** : les majuscules et espaces ne sont plus pris en compte ; `Alice@Exemple.ch` et `alice@exemple.ch` désignent le même bénévole ou le même admin (connexion comprise), au lieu de créer deux fiches, et la base de données refuse deux fiches (bénévoles d'une même organisation, admins, responsables d'un même secteur) dont l'adresse ne diffère que par la casse ou des espaces. Les adresses existantes sont converties en minuscules, sauf les rares doublons qui ne diffèrent que par la casse, laissés tels quels pour un traitement manuel.
- **Statuts en base** : les contraintes sur les valeurs de statut s'appliquent aussi aux lignes existantes (vérifiées au préalable en production), et non plus seulement aux nouvelles.
- **Erreurs serveur** : les réponses d'erreur de la modification d'un événement et de l'import de membres ne contiennent plus de détails techniques.
- **Limites de tentatives partagées par tous** : derrière le Traefik de k3s, toutes les requêtes arrivaient avec l'adresse interne du nœud ; chaque limite était donc un seul compteur pour tous les visiteurs, et un lien d'invitation pouvait répondre « Trop de tentatives » à quelqu'un qui l'ouvrait pour la première fois. Nouveau manifeste `k8s/traefik-config.yaml` (`externalTrafficPolicy: Local`), documenté dans le guide de déploiement.

### Sécurité

#### Journaux et rapports d'erreurs

- **Liens personnels jamais journalisés** : les requêtes qui portent un lien personnel (page personnelle, liste d'attente, responsable, invitation) ne sont plus écrites dans les journaux d'accès du serveur, et les pages n'envoient plus leur adresse complète dans l'en-tête `Referer`. Le lien d'un responsable de secteur est aussi masqué dans les rapports d'erreurs, comme les autres liens personnels.

#### Comptes administrateurs

- **Inviter un organisateur** : l'invitation d'un administrateur avec le rôle Organisateur échouait (erreur serveur) ; elle fonctionne.
- **Sessions admin après un changement de mot de passe** : changer ou réinitialiser son mot de passe déconnecte toutes les autres sessions ouvertes auparavant (autres navigateurs, appareils, ou session volée). La session depuis laquelle le mot de passe est changé reste ouverte.
- **Changement de mot de passe** : la vérification du mot de passe actuel (page « Mon compte », profil du super admin) est limitée à 5 échecs par compte et 20 par adresse IP sur 15 minutes. Une session volée ne peut plus essayer des mots de passe à l'infini.
- **Longueur maximale des mots de passe admin** : un nouveau mot de passe est limité à 72 octets en UTF-8, la limite réellement prise en compte par le chiffrement (bcrypt). Une lettre accentuée occupe 2 octets, un emoji jusqu'à 4. Les mots de passe plus longs déjà définis continuent de fonctionner à la connexion.

#### Liens des bénévoles

- **Lien de gestion après inscription** : il n'est plus affiché sur la page de succès pour une adresse email nouvelle, seulement envoyé par email : n'importe qui pouvait inscrire une autre personne avec une adresse encore inconnue de l'organisation et obtenir son lien. Il reste affiché pour une inscription depuis un lien d'invitation membre.
- **Liens personnels des bénévoles, responsables de secteur et invitations** : ne sont plus lisibles dans une copie de la base. La base ne garde qu'une empreinte (pour reconnaître un lien) et une copie chiffrée avec la clé `TOKEN_ENCRYPTION_KEY` (pour renvoyer le lien par email) ; les liens existants sont chiffrés automatiquement par la tâche de nettoyage quotidienne et restent valables. **La clé est obligatoire en production** : sans elle, le serveur refuse de démarrer (voir [Mise à jour depuis 1.x](docs/deploiement.md#mise-à-jour-depuis-1x)).
- **Désinscription des notifications push** : elle exige le lien personnel du bénévole, comme l'inscription, ne retire que son abonnement et est limitée en fréquence ; une adresse d'abonnement seule ne suffit plus.

---

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
