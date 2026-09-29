# Fonctionnalités

Liste exhaustive des fonctionnalités de l'application.

---

## Côté public (bénévoles)

### Page d'accueil

- Liste des événements publiés avec titre, dates et lieu
- Accès direct à la page d'inscription de chaque événement

### Page d'inscription (`/{orgSlug}/{eventSlug}`)

#### Timeline Gantt

- Planning visuel par jour sous forme de **timeline Gantt scrollable**
  - Le graphique de chaque jour occupe toute la largeur de sa carte (mise en page fluide) ; en dessous d'environ 36 px par heure, il défile horizontalement. Le texte d'une barre n'est affiché que s'il tient ; l'axe des heures repart à zéro après minuit (`00h`, `01h`…)
  - Scroll tactile fonctionnel sur mobile
  - Une ligne par rôle ; libellé spécifique affiché sous la barre quand il diffère du rôle
  - Bandes colorées en fond représentant le programme des spectacles
  - **Nombre de places** affiché dans chaque barre ouverte (ex. « 3/5 »), comme sur la timeline admin — masqué une fois le créneau complet
- **Sélection multi-créneaux** par clic sur les barres
- **Détection de conflits en temps réel** : les créneaux qui se chevauchent avec une sélection ou une inscription existante sont grisés automatiquement
- Affichage du statut de chaque créneau : ouvert, complet, fermé
- **Âge minimum** (#192) : affiché en petit sous le créneau concerné (ex. « 18+ »), informatif — le créneau reste sélectionnable (l'âge du visiteur n'est pas connu avant le formulaire) ; l'inscription est réellement bloquée à la soumission si la condition n'est pas remplie
- Récapitulatif des créneaux sélectionnés sous le planning
- Bouton d'action fixe en bas d'écran

#### Pré-remplissage via invitation

- Si l'URL contient un `?token=` (lien d'invitation membre), le formulaire est pré-rempli avec les informations du membre (prénom, nom, email, téléphone)

#### Session persistante

- Reconnexion automatique via `localStorage` si le bénévole revient dans le même navigateur
  - Nom affiché en haut de page, bouton « Quitter la session »
  - Créneaux existants chargés en vert, conflits mis en évidence automatiquement

### Formulaire d'inscription

- Champs : prénom, nom, email, téléphone (optionnel, ou obligatoire si l'événement a l'option « Téléphone obligatoire à l'inscription » ; vérifié côté client et côté serveur ; le numéro saisi est enregistré avec l'inscription et affiché en priorité sur celui de la fiche du bénévole), commentaire (optionnel)
- **Date de naissance** : demandée uniquement si un créneau sélectionné a un âge minimum (#192) ; jamais demandée sinon. Vérifiée côté client (message immédiat) et côté serveur (source de vérité) ; la condition d'âge est aussi rappelée dans la carte « Créneaux sélectionnés »
- Pré-remplissage automatique si une session ou un token membre est reconnu
- **Charte du bénévole** : lien « Lire la charte » ouvre un modal avec le texte complet ; case à cocher obligatoire avant soumission
- Case de consentement RGPD obligatoire
- Validation côté client et côté serveur (Zod)

### Confirmation et gestion (`/my/[token]`)

- Page de succès ; le lien personnel de gestion n'y est affiché que si l'inscription vient d'un lien d'invitation membre (preuve que la personne reçoit bien les emails de cette adresse) ; sinon il est envoyé uniquement par email, et les informations déjà enregistrées pour ce bénévole (nom, téléphone, date de naissance) ne sont pas modifiées par le formulaire. Une tentative d'inscription en double renvoie le lien par email au lieu de l'afficher
- Envoi automatique d'un email de confirmation avec récapitulatif des créneaux inscrits
- **Message de confirmation personnalisable** par l'admin, rédigé en Markdown (titres, gras, italique, listes, citations, code, tableaux, texte barré, liens automatiques), affiché sur la page de succès, sur `/my/[token]` et dans l'email
- Page de gestion : liste de toutes les inscriptions actives du bénévole pour l'événement
- Annulation individuelle d'un créneau depuis la page de gestion
- **Liste d'attente** : si un créneau est complet et que la liste d'attente est activée, le bénévole peut s'y inscrire (barre rayée cliquable avec sous-label « Complet · file d'attente ») ; quand une place se libère, la première personne en attente reçoit un email avec un lien de confirmation valable 24 h ; l'explication en cinq points (`src/lib/waitlist-copy.ts`, #374) figure dans le récapitulatif avant confirmation, la page de succès, l'email de liste d'attente et la page personnelle, qui liste aussi les inscriptions en attente (position) et proposées (délai, lien « Prendre la place »)
- **Notifications push** : un bouton d'abonnement est proposé sur la page de succès et sur la page de gestion ; les rappels J-2, J-1 et Jour J sont alors aussi envoyés en push. Aucun push n'est envoyé si les clés VAPID ne sont pas configurées côté serveur ; les abonnements expirés sont supprimés automatiquement
- Arrivée depuis un lien email : le token est stocké en `localStorage` — le bénévole est automatiquement reconnu s'il navigue vers la page de l'événement
- Lien « Retour à l'accueil » pointe directement sur la page de l'événement

### Pages personnalisées de l'événement (`/{orgSlug}/{eventSlug}/{pageSlug}`)

- Pages statiques additionnelles créées par l'admin pour un événement, en complément des instructions publiques (ex. FAQ, accès et lieu, règlement, infos pratiques, matériel à apporter)
- Liste des pages affichée sous forme de liens sur la page de l'événement, juste après les instructions publiques
- Contenu rédigé en Markdown par l'admin (gras, listes, titres, liens, tableaux) et rendu en HTML sécurisé
- Pas de contenu personnalisé par bénévole : chaque page est la même pour tout le monde

### Espace responsable de secteur (`/leader/[token]`)

- Lien personnel envoyé par email à un·e bénévole désigné·e responsable d'un poste (ex. « Bar »)
- Lecture seule : liste des bénévoles inscrits sur ce poste (nom, email, téléphone, commentaire), groupée par créneau
- Pas de compte à créer ni de mot de passe : le lien reste valable pour toute la durée de l'événement
- Email automatique à chaque nouvelle inscription sur le poste, avec lien vers la liste à jour

### Pages légales

- Politique de confidentialité (`/legal/privacy`) et conditions d'utilisation (`/legal/terms`)

### Documentation publique (`/doc`, `/doc/admin`, `/doc/benevole`)

- Guides administrateur et bénévole publiés comme pages du site (captures d'écran, FAQ), au lieu de fichiers Markdown lisibles seulement sur GitHub — sources uniques avec `GUIDE_ADMIN.md`/`GUIDE_BENEVOLE.md`
- Adaptées au mobile (pas de débordement horizontal, zones de clic agrandies)
- Thème clair/sombre indépendant des préférences système, mémorisé d'une visite à l'autre
- Liées depuis le pied de page public et depuis la barre de navigation admin (« Aide »)
- Lien « Soutenir le projet » dans le pied de page du site benevol.app et de la documentation uniquement (jamais sur les pages d'une organisation, de ses bénévoles ou de l'admin)

---

## Côté administrateur (`/admin`)

### Authentification

- Connexion par email + mot de passe (hashé bcrypt, NextAuth v5) ; tentatives échouées limitées (10 par compte, 30 par adresse IP, sur 15 minutes) ; même limite pour la vérification du mot de passe actuel lors d'un changement (5 échecs par compte, 20 par adresse IP)
- Session revérifiée en base à chaque requête : un admin désactivé ou supprimé, ou dont l'organisation est désactivée, perd l'accès immédiatement ; un changement ou une réinitialisation de mot de passe ferme toutes les sessions ouvertes auparavant (sauf celle où le changement est fait) ; un changement de rôle s'applique sans reconnexion
- Menu du compte sous le nom de l'utilisateur, en haut à droite : **Mon compte** (`/admin/account`, changement du mot de passe ; profil du super admin pour un super admin) et **Se déconnecter**
- Mot de passe oublié : email de réinitialisation (`/admin/forgot-password`, `/admin/reset-password`)
- Onboarding par lien sécurisé : le super admin crée un compte admin et envoie un lien d'invitation avec token révocable (validité 7 jours) ; le mot de passe est créé à la première connexion. Liens d'invitation et de réinitialisation conservés en base sous forme d'empreinte (SHA-256) uniquement ; renvoyer une invitation génère un nouveau lien

### Isolation multi-tenant

- Chaque admin ne voit et ne peut modifier que les données de son organisation
- Scoping automatique via un client Prisma étendu (`getOrgClient`) qui limite à l'organisation toutes les opérations (lectures, modifications, suppressions, créations) sur tous les modèles qui lui appartiennent ; l'import du client brut est interdit par ESLint dans le code admin, sauf exception justifiée
- Middleware Next.js protège les routes `/admin/*` (authentification) et `/super-admin/*` (rôle `super_admin`)

### Tableau de bord (`/admin/dashboard`)

- **Premiers pas** (aussi en haut de `/admin/events`) : checklist de mise en place d'une nouvelle organisation, dans l'ordre (page publique et charte, fuseau horaire, premier événement, créneaux, publication, inscription de test), cochée automatiquement d'après les données ; disparaît une fois les étapes obligatoires faites, ou masquée pour toute l'organisation
- **Ce qui demande votre attention** : situations à traiter sur les événements publiés, de la plus urgente à la moins urgente, avec un lien vers chacune (créneaux des 7 prochains jours pas complets, places de liste d'attente qui expirent dans les 12 h, jalons en retard, invitations non utilisées après 3 jours, postes sans responsable, événement qui commence dans la semaine, événement terminé à archiver)
- Compteurs : événements (publiés, à venir), bénévoles inscrits (et bénévoles uniques), taux de remplissage global
- Répartition des membres : total, avec email, sans email (ne peuvent pas recevoir d'invitations)

### Recherche globale (`/admin/search`)

- Champ **Rechercher** dans la barre du haut (dans le menu sur mobile), raccourci **Ctrl + K** (**⌘ + K** sur Mac)
- Résultats groupés : bénévoles (nom, email, téléphone), leurs inscriptions en cours (confirmées, liste d'attente, place proposée), événements (titre, lieu, slug), créneaux (poste, intitulé, titre de l'événement) ; 20 résultats par groupe
- Tous les mots doivent correspondre, sans tenir compte des majuscules ; les accents comptent
- Liens vers la page Membres ou les inscriptions de l'événement déjà filtrées (`?q=`, `?shift=`)

### Gestion des événements

- Création et édition d'événements
- **Assistant en trois étapes** : indicateur d'étapes sur la création (informations, puis créneaux avec `?wizard=1` et un bouton Continuer, puis `/admin/events/[id]/review`) ; la vérification liste les points requis (dates, au moins un créneau) et facultatifs (lieu, message de confirmation, instructions, responsables) avec un lien pour chacun, l'aperçu bénévole, et Publier (bloqué sans créneau) ou Rester en brouillon ; « Quitter l'assistant » à chaque étape, chaque étape étant une page ordinaire
- **Modèles d'événement** (`/admin/events/new`) : festival sur plusieurs jours, buvette, manifestation sportive, fête de village, montage / exploitation / démontage ; un titre et une date suffisent, le brouillon est créé avec ses postes et créneaux (datés à partir du premier jour, ordonnés comme dans le modèle), aperçu de ce qui sera créé ; modèles définis dans le code (`src/lib/event-templates.ts`), pas par organisation
- **Aperçu comme un bénévole** (`/admin/events/[id]/preview`), brouillons compris : même page publique (planning, places, pages, charte, champs du formulaire), bandeau « Aperçu » ; le formulaire affiche le message de confirmation et l'email qu'on recevrait (rendu avec le vrai modèle, lien factice) sans rien enregistrer ni envoyer
- **Duplication avec choix** (`/admin/events/[id]/duplicate`, #378) : titre, premier jour (toutes les dates décalées du même offset, spectacles compris), cases créneaux / messages et réglages / pages / responsables de secteur (décochée : chaque responsable repris reçoit un email avec un nouveau lien), récapitulatif avant création ; `POST /api/admin/events/[id]/duplicate` accepte `{ title?, startDate?, copy? }` (corps vide = défauts) ; créneaux non annulés seulement, rouverts, tous réglages copiés (#356) ; jamais les inscriptions ni les jalons ; brouillon répertorié ; logique pure dans `src/lib/event-duplicate.ts`
- **Archivage** en un clic (bouton « Archiver » ou statut « Archivé » du formulaire d'édition)
- **Suppression définitive**, réservée aux événements archivés : avertissement fort, nombre de créneaux / inscriptions / invitations effacés, lien vers l'export PDF pour sauvegarder l'état, confirmation en saisissant le titre (accents et casse ignorés). Les créneaux, inscriptions et invitations sont effacés avec l'événement ; les membres du pool et l'organisation sont conservés. Les bénévoles ne sont pas prévenus : pour cela, annuler d'abord les créneaux
- Champs : titre, slug, dates, lieu, description, instructions publiques, message de confirmation
- **Publication / dépublication** en un clic (`draft` → `published`) ; **règle serveur** : pas de publication sans créneau actif (409 sur `PATCH`), un événement est toujours créé en brouillon (`POST` ignore tout statut) ; l'annulation du dernier créneau actif d'un événement publié le repasse en brouillon dans la même transaction (`event.unpublished` au journal)
- **Barre d'étapes** (#371) en haut de la page d'un événement : Brouillon → Prêt à publier (brouillon avec créneau) → Publié → Terminé (dernier jour passé) → Archivé, avec « À faire » (liens) et « Concrètement » (visibilité, rappels, suppression) ; logique pure dans `src/lib/event-lifecycle.ts`
- **Événements non répertoriés** (`Event.isListed`, #414) : publié mais absent de la page publique de l'organisation, de `/api/public/events` et du sitemap, `robots: noindex, nofollow` sur sa page et ses pages additionnelles ; accès direct, inscription et liens personnels inchangés ; case « Afficher cet événement sur la page publique de l'organisation » dans l'édition, badge « non répertorié » dans l'admin ; duplication et modèles créent toujours un brouillon répertorié ; changement journalisé (« visibilité : répertorié → non répertorié ») ; pas un contrôle d'accès
- Vue de synthèse : créneaux, places totales, inscrits, places restantes ; phrase « Il manque encore N personnes sur M places » et lien vers la vue de complétion
- **Où manque-t-il du monde ?** (`/admin/events/[id]/staffing`) : postes sans personne, créneaux à compléter (du plus dégarni au plus proche du complet, créneaux fermés exclus), personnes en liste d'attente, postes sans responsable de secteur, créneaux complets ; chaque ligne mène aux inscriptions filtrées sur le créneau, aux créneaux ou aux responsables
- Lien direct vers la vue publique (affiché uniquement si l'événement est publié)
- QR code de la page publique (formats PNG et SVG téléchargeables)

### Pages personnalisées (`/admin/events/[id]/pages`)

- Liste ordonnée de pages statiques par événement, en plus du champ unique « instructions publiques » (ex. Règlement, FAQ, Accès et lieu, Ce qu'il faut apporter)
- Création et édition : titre + contenu en Markdown (zone de texte simple) — pas d'éditeur riche, pas de variables à injecter, le contenu est identique pour tous les bénévoles
- Slug généré automatiquement depuis le titre, dédoublonné (`faq`, `faq-2`…)
- **Réordonnancement** : boutons monter/descendre (accessibles au clavier), persisté via `displayOrder`
- Suppression avec confirmation
- Chaque création, modification et suppression est tracée dans le journal d'événement ; le contenu de la page n'est jamais stocké dans le journal (seuls le titre et le slug le sont, le contenu est noté « (modifié) »)

### Responsables de secteur (`/admin/events/[id]/sector-leaders`)

- Désigner un ou plusieurs bénévoles responsables d'un poste (`roleName`, ex. « Bar »), avec autocomplétion sur les postes déjà utilisés dans l'événement
- Choix rapide « Depuis les inscrits » : sélectionner un bénévole déjà inscrit à l'événement pré-remplit nom, email et poste
- Depuis la page des inscriptions, bouton « Rendre responsable » par ligne : si le bénévole a plusieurs inscriptions sous des postes différents, le poste de la ligne cliquée est proposé par défaut, modifiable
- L'ajout envoie automatiquement un email au responsable avec son lien personnel (lecture seule, sans compte)
- Un responsable peut être retiré à tout moment (confirmation demandée)
- Chaque ajout et retrait est tracé dans le journal d'événement (poste concerné seulement, jamais le nom ni l'email en clair dans le journal)
- Le tag « responsable » est ajouté/retiré automatiquement sur la fiche du bénévole (`/admin/members`) ; retiré uniquement s'il n'est plus responsable d'aucun poste dans l'organisation

### Jalons (section sur la page de l'événement)

- Checklist simple de dates clés pour l'événement (ex. « Fermer les inscriptions », « Envoyer les rappels ») : titre, échéance, fait / pas fait
- Purement informatif, aucune automatisation (une échéance ne déclenche rien elle-même)
- Un jalon dépassé et non coché est mis en évidence
- Visible par les admins de l'organisation uniquement, pas par les responsables de secteur (#186)
- Chaque ajout, modification et suppression est tracé dans le journal d'événement

### Journal de l'événement (`/admin/events/[id]/log`)

- Historique complet de ce qui s'est passé sur l'événement : créneaux, inscriptions, pages personnalisées, responsables de secteur, paramètres de l'événement, invitations
- Trois modes : **Explorer** (liste filtrable), **Rejouer** (reconstitue l'état d'une entité à un instant donné), **Récit** (raconte en une phrase une chaîne d'événements liés, ex. une annulation qui déclenche une offre de liste d'attente)
- Une génération de référence (« baseline ») reconstitue un point de départ pour les créneaux et inscriptions antérieurs à cette fonctionnalité, visuellement distincte d'une action réelle
- Aucune donnée personnelle des bénévoles ni contenu de page n'est jamais journalisé

### Programme des spectacles

- Ajout, édition et suppression de plages de spectacles par jour
- Sauvegarde automatique avec délai (debounce)
- Affichage en fond coloré sur la timeline publique et dans les exports

### Gestion des créneaux (`/admin/events/[id]/shifts`)

- Ajout de créneaux : rôle, libellé, date, horaires, capacité, statut, ordre d'affichage
- **Infos pratiques par créneau** : lieu de rendez-vous et consigne courte (page publique, email de confirmation, rappels, page personnelle) ; personne de contact (nom, téléphone) réservée aux inscrits (email de confirmation, rappels, page personnelle), absente de l'API publique ; copiées à la duplication
  - Saisie des horaires tolérante : `9` → `09:00`, `14:3` → `14:30`. Les heures valides vont de `00:00` à `23:59` ; une valeur hors plage (`26:00`, `-2:30`) est refusée avec un message au lieu d'être modifiée en silence. Un créneau qui passe minuit s'écrit avec une fin plus petite que le début (`22:00` à `02:00`, affiché « 22h–02h +1 »)
  - Fin automatiquement fixée à start + 1h si non renseignée
- **Série de créneaux** : un poste, une date, une plage horaire, une durée de créneau (et une pause facultative) créent d'un coup tous les créneaux qui se suivent, avec un aperçu avant création ; dernier créneau plus court si la plage ne se divise pas exactement, créneaux après minuit datés du lendemain, 48 créneaux au plus ; tous créés dans une même transaction
- Autocomplétion des rôles existants
- Modification, suppression et changement de statut : ouvert → fermé → complet → annulé
- **Liste d'attente par créneau** : case à cocher `Activer la liste d'attente` sur chaque créneau ; quand le créneau est complet, les bénévoles peuvent s'inscrire en liste d'attente ; une place libérée (annulation publique ou admin) déclenche automatiquement une offre à la première personne en attente (email + lien de confirmation, expiration 24 h)
- **Gérer les postes** : panneau dédié pour, poste par poste :
  - **Réordonner** par glisser-déposer, persisté via `displayOrder` et reflété dans toutes les timelines
  - **Renommer** d'un coup tous les créneaux d'un poste (refuse un nom déjà pris par un autre poste)
  - **Supprimer** un poste (annule tous ses créneaux — même confirmation et notification des bénévoles qu'une annulation individuelle)
  - **Couleur** : 16 couleurs prédéfinies ou automatique (hash du nom), appliquée à la timeline admin et à la page publique
- **Vue timeline** (par jour) et **vue liste** (tableau plat) commutables
- Popover au clic sur un créneau : libellé, places (pour ce créneau ou **appliquées à tout le poste**, jamais sous le nombre d'inscrits d'un créneau), **horaires à décaler** (les inscrits sont prévenus), inscriptions ouvertes / fermées, **dupliquer** (copie juste après, même durée, tous réglages copiés, sans inscriptions), lien vers les inscriptions filtrées, suppression
- **Âge minimum** (optionnel, #192) : condition simple pour restreindre un créneau (ex. 18 ans pour un poste avec permis de conduire) ; affichée aux bénévoles, vérifiée à l'inscription

### Suivi des inscriptions (`/admin/events/[id]/registrations`)

- Vue tabulaire : bénévole, créneau, horaires, commentaire, source, date
- Pas d'action par ligne : toute action passe par la sélection (cases à cocher, case d'en-tête pour tout sélectionner) puis un bouton dans la barre d'outils qui apparaît, appliqué à toute la sélection — même une ligne masquée entre-temps par un filtre
- **Rendre responsable** de leur poste : modale (choix du poste, nom/email ajustables) avec une seule ligne sélectionnée ; assignation directe au poste de chaque créneau avec plusieurs lignes
- **Renvoyer le lien** : réémet par email le lien personnel de gestion (`/my/[token]`) de chaque bénévole sélectionné — donne accès à toutes ses inscriptions actives pour l'événement, pas seulement au créneau de la ligne
- **Retirer de leur créneau** : annule chaque inscription sélectionnée
- Badge « Responsable » affiché sur une ligne quand ce bénévole est déjà responsable du poste de son créneau
- **Présences** (#399) : actions groupées **Marquer présents** / **Annuler la présence** sur les inscriptions confirmées (`checkedInAt`), badge **Présent**, compteur « N présents sur M », journal (`registration.checked_in` / `check_in_undone`) ; **export CSV des présences** (`/api/admin/events/[id]/export/attendance`, BOM + point-virgule, heure du pointage dans le fuseau de l'organisation)
- **Filtres cumulables** : recherche texte, filtre par poste, filtre par créneau
- Accès direct depuis un créneau (timeline admin) : pré-filtrage automatique
- **Ajout manuel** avec détection de conflits

### Gestion des membres (`/admin/members`)

Pool de bénévoles connus de l'organisation (source de vérité partagée avec les inscriptions) :

- Création, édition et désactivation de membres
- Champs : prénom, nom, email, téléphone, tags libres, notes internes, **disponibilités facultatives** (`availabilityPeriods` matin / après-midi / soir, `availabilityNote` ≤ 140) modifiables par l'admin et par le bénévole depuis `/my/[token]` (`PATCH …/availability`) ; affichées dans la liste des membres, les inscriptions et l'ajout manuel ; aucune correspondance automatique
- **Colonnes Prénom et Nom séparées** ; tri par colonne au clic sur l'en-tête (croissant → décroissant → reset) ; changement annoncé aux lecteurs d'écran via live region
- **Heures cumulées** : somme de la durée des créneaux actifs de chaque membre, tous événements de l'organisation confondus ; colonne triable. Figure admin uniquement — absente de l'export PDF (qui est, lui, potentiellement partagé avec les bénévoles).
- Recherche par texte et filtre par tag
- Import CSV ou Excel (`.xlsx`) via le bouton « Importer CSV/Excel » : colonnes reconnues par leur intitulé (français ou anglais), bilan créés / mis à jour / ignorés, lignes en erreur listées

### Invitations membres (`/admin/events/[id]/invitations`)

- **Envoi batch** : sélectionner des membres par nom ou tag, envoyer des invitations en une fois
- Chaque invitation génère un **token unique** lié au membre et à l'événement ; l'URL pré-remplit le formulaire
- Le même token est réutilisé si le membre est ré-invité (pas de doublons)
- Vue d'état : invité le, ✅ inscrit (avec détail des créneaux) / ⏳ pas encore répondu
- Compteurs : total invités · inscrits · sans réponse
- **Relance ciblée** : bouton pour renvoyer un email à tous les non-inscrits, avec message optionnel personnalisable

### Communications (`/admin/events/[id]`)

#### Écrire aux bénévoles (`/admin/events/[id]/message`)

- Destinataires : tous les inscrits, un poste, un créneau, ou la liste d'attente (statuts `waiting` et `offered`)
- Objet (≤ 120) et message texte (≤ 2000) ; compteur de destinataires en direct, aperçu de l'email (rendu réel, lien factice), confirmation avec le nombre de personnes
- Un email par personne (`targeted_message`), avec ses créneaux concernés, via la file d'envoi ; envoi noté dans le journal (`message.sent`) ; limite de 30 envois par heure et par organisation
- Accès direct depuis les inscriptions, avec le poste ou le créneau filtré prérempli

#### Rappel manuel

- Champ « Message de rappel » dans l'édition de l'événement (sauvegarde auto)
- Bouton **Envoyer le rappel** sur la page de l'événement
  - Modale de confirmation avec nombre de destinataires
  - Chaque bénévole reçoit un seul email regroupant tous ses créneaux
  - Date du dernier envoi affichée

#### Rappels automatiques

Déclenchés par le cron `/api/cron/reminders` (toutes les heures) :

| Rappel | Fenêtre |
|--------|---------|
| J-2 | 47–49 h avant le début du créneau |
| J-1 | 23–25 h avant |
| Jour J | 2–4 h avant |

Idempotents : un rappel donné ne peut être envoyé qu'une seule fois par inscription (`reminderJ2Sent`, `reminderJ1Sent`, `reminderDdSent`).

#### Notifications de modification

- Annulation d'un créneau → inscriptions annulées en cascade + email à chaque bénévole impacté
- Modification des horaires d'un créneau → email aux bénévoles inscrits (opt-out disponible)

### Exports

#### Rapports (`/admin/events/[id]/print`)

- L'export complet en premier, puis cinq feuilles HTML noir et blanc (`/api/admin/events/[id]/export/sheets/[view]`) : `day` (frise par jour avec les prénoms dans les créneaux + détail, paysage), `role` (une page par poste : frise, détail, responsable, paysage), `individual` (une page par bénévole : sa frise du jour, ses créneaux avec infos pratiques), `attendance` (feuille de présence : case par bénévole, cochée si `checkedInAt`, lignes vides = places libres + 2), `phones` (liste alphabétique avec téléphones, mention organisateurs)
- La frise réutilise `buildDayParts` de l'export complet, restylée en monochrome ; rendu pur dans `src/lib/print-sheets.ts` ; téléphone de l'inscription avant celui du profil ; jamais les heures cumulées

#### PDF (impression navigateur)

- **3 sections uniformes** : Planning (Gantt par jour), Récap par poste, Liste des bénévoles
- Aucun saut de page forcé entre les sections — rendu continu optimisé impression
- Colonne « File d'attente » conditionnelle dans le récap (affichée uniquement si au moins un créneau a des personnes en attente)
- Bouton « Imprimer / Enregistrer en PDF »

### Paramètres de l'organisation (`/admin/settings/admins`)

- **Slug de l'organisation** : modification avec validation (`[a-z0-9-]`), avertissement si des événements publiés existent (liens potentiellement cassés), redirection automatique vers le nouveau sous-domaine après changement
- **Historique des slugs** : les anciens slugs sont archivés et redirigent vers le slug courant ; suppression individuelle possible
- **Titre de la page publique** : titre modifiable affiché en haut de la page publique de l'organisation et dans l'onglet du navigateur (2 à 100 caractères, « Bénévoles » par défaut, bouton pour rétablir) ; le nom de l'organisation reste affiché au-dessus
- **Fuseau horaire** : fuseau des événements de l'organisation (liste des fuseaux IANA, « Par défaut » = fuseau de la plateforme, Europe/Zurich) ; utilisé pour les rappels, l'heure limite des offres de liste d'attente, le journal et l'export PDF
- **Charte du bénévole** (« Convention des Bénévoles » dans l'écran) : texte par défaut éditable en texte libre ; bouton « Réinitialiser la convention par défaut » ; affiché aux bénévoles lors de l'inscription
- **Assurance RC de l'organisation** : commutateur qui choisit la variante du texte par défaut (bénévoles couverts par la RC de l'organisation, ou couverture accidents personnelle à leur charge) ; changer le commutateur remplace le texte de la zone de saisie
- **Équipe admin** : liste des administrateurs avec statut (actif / en attente)
- **Invitation** : saisir nom + email → lien d'activation envoyé par email (token 7 jours)
- **Retrait** d'un admin (sauf soi-même et dernier admin actif)

### Journal d'activité (`/admin/settings/activity`)

- Liste chronologique filtrable des changements sur les membres et les comptes admin (#194) : création, modification, désactivation d'un membre ; invitation, retrait d'un compte admin
- Indépendant du journal par événement (`EventLog`) : les membres et comptes admin sont au niveau de l'organisation, pas d'un événement
- Le contenu d'un membre (nom, email, téléphone, notes) n'apparaît jamais dans le journal, seuls les noms de champs modifiés

---

## Super Admin (`/super-admin`)

Accessible uniquement aux comptes avec rôle `super_admin` (protégé au niveau du proxy).

### Gestion des organisations

- Liste de toutes les organisations avec compteurs (événements, admins, membres)
- Création d'une organisation : nom, slug auto-généré, email + nom du premier admin
  - Génère un **lien d'invitation** à durée limitée (7 jours) pour le premier admin
  - Aucun mot de passe temporaire — le compte est activé lors de la première connexion
- Activation / désactivation d'une organisation
- **Édition inline** : nom et slug modifiables directement depuis la fiche organisation
- **URLs par slug** : `/super-admin/organizations/<slug>` au lieu de l'identifiant interne
- **Basculement d'organisation** : bouton « Gérer → » bascule le contexte admin vers l'organisation choisie (cookie `sa-org-id`) sans déconnexion

### Nouveautés produit (`/super-admin/product-updates`)

- Communication manuelle des nouveautés de benevol.app aux administrateurs de toutes les organisations (#200), sans plateforme de newsletter externe
- Rédaction en Markdown complet (titres, gras, italique, listes, citations, code, tableaux, texte barré, listes de tâches, liens automatiques), aperçu en direct
- **Envoyer un test** : envoyé par défaut à soi-même, ou à une adresse personnalisée renseignée pour l'occasion ; jamais compté dans l'historique
- **Envoi** : à tous les administrateurs actifs et abonnés (`receiveProductUpdates`), confirmation demandée avant envoi ; envoi synchrone (pas de file d'attente — volume trop faible pour le justifier), échec d'un destinataire n'empêche pas les autres
- **Désabonnement** : lien signé dans chaque email, sans connexion requise ; le compte reste actif, seules les communications de nouveautés s'arrêtent
- **Historique** : liste des envois passés avec nombre de destinataires atteints

---

## Notifications email

Toutes les notifications passent par `sendNotification()` — aucun appel direct à Nodemailer dans les routes.

| Kind | Déclencheur |
|------|-------------|
| `registration_confirmation` | Inscription bénévole |
| `member_invite` | Invitation d'un membre à un événement |
| `manual_reminder` | Rappel manuel lancé par l'admin |
| `reminder_j2` | Rappel automatique J-2 (cron) |
| `reminder_j1` | Rappel automatique J-1 (cron) |
| `reminder_dd` | Rappel automatique Jour J (cron) |
| `shift_modified` | Modification des horaires d'un créneau |
| `shift_cancelled` | Annulation d'un créneau |
| `registration_cancelled` | Annulation d'une inscription publique |
| `admin_notification` | Alerte admin à chaque nouvelle inscription (optionnel) |
| `waitlist_confirmation` | Inscription en liste d'attente |
| `waitlist_offered` | Place disponible — offre avec lien de confirmation (24 h) |
| `admin_invite` | Invitation d'un nouvel admin à l'équipe |
| `admin_welcome` | Bienvenue après activation du compte admin |
| `password_reset` | Réinitialisation du mot de passe admin |

Tous les templates bénévoles utilisent un ton chaleureux et personnel (tutoiement, `Hello [Prénom] !`, signature chaleureuse).

Fallback console si SMTP non configuré (développement).

---

## Infrastructure

- Next.js 16 App Router (SSR + client), Turbopack par défaut
- API REST séparée public / admin / super-admin / cron
- PostgreSQL 16 + Prisma 7 ORM (driver natif pg, historique de migrations dans `prisma/migrations/`)
- Architecture multi-tenant : isolation par `organizationId` avec client Prisma étendu
- **Routage par sous-domaine** : `[orgSlug].benevol.app` → le proxy (`src/proxy.ts`) injecte `x-org-slug` ; fallback `?org=<slug>` pour le développement localhost
- Tests d'isolation cross-tenant (Vitest) — vérifient que chaque route admin utilise le client Prisma scopé
- Déploiement Docker Compose ou image standalone
- Déploiement Kubernetes avec migrations automatiques, appliquées une fois par déploiement avant la mise à jour de l'application (voir `docs/deploiement.md`)
- Cron jobs Kubernetes : rappels (toutes les heures), purge RGPD (`/api/cron/cleanup` : organisations et comptes admin désactivés depuis plus de 30 jours, bénévoles orphelins, jetons expirés), sauvegarde `pg_dump` chiffrée (rétention 30 jours localement, copie hors site vers Dropbox via `rclone` chaque nuit, rétention 90 jours)
- **`robots.txt` et `sitemap.xml`** multi-tenant : chaque organisation n'expose que ses propres événements publiés et leurs pages personnalisées ; routes à jeton et `/admin`/`/api/` interdites à l'indexation
- Certificat wildcard via cert-manager et le webhook DNS Gandi (`gandi-webhook/`)
- Suivi des erreurs avec Sentry (serveur, edge et navigateur)
- CI/CD GitHub Actions : build, push image GHCR, déploiement automatique sur push `main`
