import type { Metadata } from "next"
import { pageAvailable, publicPage, publicPageMetadata } from "@/lib/doc-pages"
import { publicPageJsonLd } from "@/lib/structured-data"
import { apexBaseUrl } from "@/lib/urls"
import JsonLd from "@/components/public/JsonLd"
import Link from "next/link"
import { IP_MAX_DAYS } from "@/lib/signup-blocklist"
import { RETENTION, RETENTION_DAYS } from "@/lib/retention"
import { INACTIVITY_MONTHS } from "@/lib/org-inactivity"
import { FINAL_NOTICE_DAYS, MIN_DEACTIVATION_DAYS, REMINDER_GAP_DAYS } from "@/lib/org-inactivity-steps"
import { REACTIVATION_LINK_HOURS } from "@/lib/org-reactivation"
import { PAST_EVENT_NOTICE_DAYS, PAST_EVENT_RETENTION_YEARS } from "@/lib/past-event-retention"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export function generateMetadata(): Metadata {
  return publicPageMetadata("/legal/privacy", apexBaseUrl())
}

export default function PrivacyPage() {
  // The hosted service's own page (#760): absent on another instance, which has /legal/exploitant.
  if (!pageAvailable(publicPage("/legal/privacy"))) notFound()
  return (
    <>
      <JsonLd data={publicPageJsonLd("/legal/privacy", apexBaseUrl())} />
      <h1>Politique de confidentialité</h1>
      <p className="text-gray-500 text-sm">Dernière mise à jour : 23 octobre 2026</p>

      <p>
        La présente politique décrit comment <strong>benevol.app</strong>, éditée par{" "}
        <strong>Philippe Vollenweider</strong>, particulier (« nous »), collecte, utilise et protège
        les données personnelles dans le cadre de son Service de gestion de bénévoles.
      </p>

      <h2>1. Qui traite quoi ?</h2>
      <p>benevol.app est à la fois responsable du traitement et sous-traitant, selon les données :</p>
      <ul>
        <li>
          <strong>Données des administrateurs d&apos;Organisations</strong> (nom, e-mail, mot de
          passe) : benevol.app est <strong>responsable du traitement</strong>.
        </li>
        <li>
          <strong>Données des bénévoles</strong> (nom, e-mail, disponibilités, présences) :
          l&apos;Organisation est <strong>responsable du traitement</strong> ; benevol.app est{" "}
          <strong>sous-traitant</strong> agissant sur instruction de l&apos;Organisation.
        </li>
        <li>
          <strong>Journaux du serveur</strong> (toute personne qui visite le
          site) : benevol.app est <strong>responsable du traitement</strong>.
        </li>
      </ul>

      <h2>2. Données que nous traitons en qualité de responsable</h2>

      <h3 id="donnees-administrateurs">2.1 Administrateurs</h3>
      {/* A wide table scrolls in its own focusable region, named by its heading, so the page
          reflows at 320 px (1.4.10); the hint says so where the table is wider than the screen. */}
      <p className="sm:hidden">Faites défiler le tableau horizontalement.</p>
      <div role="region" aria-labelledby="donnees-administrateurs" tabIndex={0} className="overflow-x-auto rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table>
          <thead>
            <tr>
              <th>Donnée</th>
              <th>Finalité</th>
              <th>Base légale</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nom, adresse e-mail</td>
              <td>Création et gestion du compte</td>
              <td>Exécution du contrat</td>
              <td>Durée du compte ; effacé avec l&apos;Organisation désactivée par l&apos;opérateur du service, au nettoyage quotidien qui suit {RETENTION_DAYS.deactivatedOrganization} jours sans modification de l&apos;Organisation (pas en cas de suspension ni de désactivation faute d&apos;activité)</td>
            </tr>
            <tr>
              <td>Mot de passe (hashé bcrypt)</td>
              <td>Authentification</td>
              <td>Exécution du contrat</td>
              <td>Durée du compte</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Les connexions à votre compte figurent aussi dans les{" "}
        <a href="#journaux-serveur">journaux du serveur</a> (section 2.3).
      </p>

      <h3 id="donnees-demandes-espace">2.2 Demandes d&apos;espace et prévention des abus</h3>
      <p className="sm:hidden">Faites défiler le tableau horizontalement.</p>
      <div role="region" aria-labelledby="donnees-demandes-espace" tabIndex={0} className="overflow-x-auto rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table>
          <thead>
            <tr>
              <th>Donnée</th>
              <th>Finalité</th>
              <th>Base légale</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Demande d&apos;espace : nom de l&apos;association, sa description et son besoin, votre nom et votre adresse e-mail</td>
              <td>Vérifier l&apos;adresse, créer l&apos;espace et son compte, examiner la demande avant d&apos;activer l&apos;espace</td>
              <td>Mesures précontractuelles prises à votre demande</td>
              <td>{RETENTION_DAYS.signupRequest} jours après la demande, confirmée ou non ; la description reste ensuite sur la fiche de l&apos;espace, visible de l&apos;opérateur seulement, et suit l&apos;Organisation</td>
            </tr>
            <tr>
              <td>Liste de blocage : adresse e-mail ou nom de domaine bloqué, ou empreinte d&apos;une adresse IP (jamais l&apos;adresse en clair), avec la raison et l&apos;échéance</td>
              <td>Empêcher les demandes abusives (envoi de spam, usurpation)</td>
              <td>Intérêt légitime</td>
              <td>Jusqu&apos;au retrait de l&apos;entrée ou à son échéance ; une adresse IP est toujours bloquée pour une durée limitée ({IP_MAX_DAYS} jours au plus)</td>
            </tr>
            <tr>
              <td>Adresse IP de la demande</td>
              <td>Limiter le nombre de demandes par adresse</td>
              <td>Intérêt légitime</td>
              <td>Une heure (la durée de la limite), puis effacée par le nettoyage quotidien</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Une demande bloquée ou trop rapide reçoit la même réponse que les autres, et rien n&apos;est
        enregistré. L&apos;e-mail de confirmation ne reprend aucun texte saisi dans le formulaire.
      </p>

      <h3 id="journaux-serveur">2.3 Visiteurs du site : journaux du serveur</h3>
      <p>
        Pour toute visite du site, que vous ayez un compte ou non, benevol.app est responsable du
        traitement des journaux de son serveur.
      </p>
      <ul>
        <li>
          <strong>Données</strong> : date et heure, adresse IP, page demandée, navigateur et système
          d&apos;exploitation indiqués par votre appareil. Les liens personnels d&apos;inscription et d&apos;invitation n&apos;y sont jamais écrits.
        </li>
        <li>
          <strong>Finalité</strong> : sécurité, détection des abus et correction des erreurs.
        </li>
        <li>
          <strong>Base légale</strong> : intérêt légitime.
        </li>
        <li>
          <strong>Durée</strong> : {RETENTION_DAYS.accessLogs} jours. L&apos;adresse IP complète et le
          navigateur sont gardés {RETENTION_DAYS.accessLogFullIp} jours ; ensuite l&apos;adresse est
          raccourcie (sans son dernier nombre pour une adresse IPv4, réduite à ses trois premiers
          groupes pour une adresse IPv6) et le navigateur est retiré.
        </li>
        <li>
          <strong>Analyse</strong> : nous pouvons analyser ces journaux pour connaître la fréquentation
          du site, ses erreurs et ses performances, dans les mêmes durées, sur la même base légale,
          sans cookie et sans profil individuel.
        </li>
      </ul>

      <h3 id="cookies">2.4 Cookies et stockage local</h3>
      <p>
        Nous utilisons un cookie de session (NextAuth) strictement nécessaire à
        l&apos;authentification. Aucun cookie de pistage, analytique ou publicitaire n&apos;est
        déposé.
      </p>
      <p>
        L&apos;interface publique (formulaires bénévoles) utilise le <code>localStorage</code> du
        navigateur pour mémoriser temporairement une session locale (sans compte), ainsi que le prénom,
        le nom, l&apos;email et le téléphone de la dernière inscription, pour ne pas les ressaisir sur un
        autre événement. Ces données restent sur l&apos;appareil de l&apos;utilisateur ; elles
        s&apos;effacent avec « Ce n&apos;est pas moi, effacer » ou « Quitter la session ».
      </p>

      <h2>3. Données que nous traitons en qualité de sous-traitant</h2>
      <p>
        Les données que les Organisations collectent sur leurs bénévoles (nom, e-mail,
        disponibilités, présences, notes éventuelles) sont traitées exclusivement pour le compte de
        l&apos;Organisation concernée.
      </p>
      {/* Shift roster between volunteers (#1068). */}
      <p id="noms-entre-benevoles">
        <strong>Noms visibles entre bénévoles d&apos;un événement.</strong> Sur instruction de
        l&apos;Organisation, qui le règle événement par événement (activé par défaut pour ses
        nouveaux événements, désactivable à tout moment, avec une valeur par défaut qu&apos;elle choisit
        dans ses paramètres), deux catégories de personnes peuvent voir sur la page de
        l&apos;événement, créneau par créneau, le prénom et l&apos;initiale du nom (par exemple
        « Aline M. ») des bénévoles confirmés de l&apos;événement, jusqu&apos;à la fin de
        l&apos;événement : les bénévoles qui y ont une place confirmée, par leur lien personnel, et
        les membres que l&apos;Organisation a invités par email à s&apos;y inscrire, par le lien de leur
        invitation, avant de s&apos;inscrire. Personne d&apos;autre : ni un visiteur sans lien, ni un
        lien par groupe, ni l&apos;intégration de la page à un autre site, ni les moteurs de recherche.
        Seuls les noms des personnes qui l&apos;ont accepté sont affichés : une case facultative du
        formulaire d&apos;inscription, à confirmer depuis la page personnelle quand rien ne prouve que
        l&apos;adresse est la leur. Aucun nom n&apos;est affiché sans ce choix, ni celui d&apos;une
        personne de moins de 18 ans dont la date de naissance est connue. Une personne qui l&apos;a
        accepté avant que les membres invités puissent le voir n&apos;est montrée qu&apos;aux bénévoles
        confirmés, tant qu&apos;elle n&apos;a pas accepté le nouveau texte depuis sa page personnelle.
        Pour chaque créneau, ces personnes voient également le nombre des autres bénévoles dont la
        place est confirmée et dont le nom reste masqué, y compris les personnes mineures ou dont le
        dossier a été effacé : un nombre seul, qui ne dit ni qui ni pourquoi. Chacun peut masquer son
        nom à tout moment depuis sa page personnelle, sans effet sur son inscription. Le choix de
        chaque bénévole est conservé avec l&apos;événement, avec la version du texte accepté (voir la{" "}
        <a href="#conservation">conservation des données</a>). L&apos;Organisation informe ses
        bénévoles de ce traitement, peut le désactiver pour un événement, et en reste responsable.
      </p>
      <p>
        En tant que sous-traitant, nous nous engageons à :
      </p>
      <ul>
        <li>ne traiter ces données que sur instruction documentée de l&apos;Organisation ;</li>
        <li>ne pas les vendre, louer ou partager avec des tiers non autorisés ;</li>
        <li>
          assurer une séparation stricte des données entre Organisations (isolation
          multi-locataire) ;
        </li>
        <li>
          notifier l&apos;Organisation sans délai injustifié en cas de violation de données la
          concernant ;
        </li>
        <li>
          supprimer ou restituer les données sur demande de l&apos;Organisation à l&apos;issue du
          contrat.
        </li>
      </ul>
      <p>
        <strong>Les Organisations restent seules responsables</strong> de l&apos;information des
        bénévoles sur le traitement de leurs données, de la base légale applicable et du respect du
        RGPD ou de toute réglementation nationale applicable.
      </p>
      <p>
        Ces engagements sont détaillés dans l&apos;
        <Link href="/legal/sous-traitance">accord de sous-traitance (art. 28 RGPD et art. 9 nLPD)</Link>, qui
        s&apos;applique à toute Organisation utilisant le Service.
      </p>

      <h2>4. Transferts et sous-traitants</h2>
      <p>
        Les données sont hébergées sur des serveurs situés en{" "}
        <strong>Union européenne (France)</strong>, à l&apos;exception de la copie de sauvegarde hors
        site décrite ci-dessous. Nous faisons appel aux sous-traitants techniques suivants :
      </p>
      <ul>
        <li>
          <strong>Hébergeur &amp; base de données</strong> : Kimsufi / OVH (France) — hébergement
          de l&apos;application et de la base de données PostgreSQL auto-hébergée
        </li>
        <li>
          <strong>Service e-mail transactionnel</strong> : Gandi (France) — envoi des notifications
        </li>
        <li>
          <strong>Suivi des erreurs techniques</strong> : Sentry (région Union européenne, Allemagne) —
          reçoit les rapports d&apos;erreur de l&apos;application (message d&apos;erreur, page concernée sans
          ses jetons d&apos;accès, type de navigateur) et, pour une partie des sessions, un enregistrement de
          la navigation dont les textes et les médias sont masqués. Aucun cookie ni en-tête de requête
          n&apos;est transmis.
        </li>
        <li>
          <strong>Copie de sauvegarde hors site</strong> : Infomaniak (offre Swiss Backup, stockage en
          Suisse) reçoit chaque nuit une copie de la base de données. Cette copie est chiffrée sur notre
          serveur avant l&apos;envoi. Infomaniak n&apos;a pas la clé. Jusqu&apos;au 5 octobre 2026, cette
          copie allait chez Dropbox (stockage aux États-Unis), chiffrée de la même façon. Dropbox ne
          reçoit plus aucune copie, et les anciennes copies y sont en cours de suppression.
        </li>
      </ul>
      <p>
        L&apos;hébergeur, le service e-mail et le suivi des erreurs sont liés par un accord de traitement
        de données conforme aux exigences du RGPD. L&apos;accord de traitement d&apos;Infomaniak pour
        Swiss Backup est en cours de vérification. Jusqu&apos;à leur suppression, les anciennes
        copies sur Dropbox relèvent d&apos;un compte personnel, sans accord de traitement spécifique ;
        les transferts vers les États-Unis reposent sur les garanties que Dropbox déclare
        appliquer (clauses contractuelles types, Data Privacy Framework).
      </p>
      <p>
        La <Link href="/legal/sous-traitants">liste des sous-traitants</Link> précise, pour chacun, les
        données concernées, la localisation et les garanties en place. Tout ajout ou remplacement est
        annoncé à l&apos;avance aux Organisations, comme le prévoit l&apos;accord de sous-traitance.
      </p>

      <h2>5. Sécurité</h2>
      <p>Nous mettons en œuvre les mesures techniques et organisationnelles suivantes :</p>
      <ul>
        <li>Chiffrement des communications (HTTPS/TLS) ;</li>
        <li>Mots de passe hashés (bcrypt, facteur de coût 12) ;</li>
        <li>Isolation des données entre Organisations (multi-tenancy strict) ;</li>
        <li>Tokens de réinitialisation de mot de passe à usage unique, expirés après 1 heure ;</li>
        <li>Accès à la base de données restreint aux composants applicatifs ;</li>
        <li>Sauvegardes régulières chiffrées.</li>
      </ul>
      <p>
        Le Service est fourni gratuitement et en l&apos;état. Malgré nos efforts, aucune mesure de
        sécurité n&apos;est infaillible.
      </p>

      {/* Linked from the sign-up consent (#706): rights, then retention just below. */}
      <h2 id="droits">6. Droits des personnes concernées</h2>
      <p>
        Conformément à la loi fédérale suisse sur la protection des données (nLPD) et, le cas
        échéant, au RGPD, vous disposez des droits suivants :
      </p>
      <ul>
        <li>Droit d&apos;accès, de rectification et d&apos;effacement de vos données ;</li>
        <li>Droit à la portabilité ;</li>
        <li>Droit d&apos;opposition et de limitation du traitement ;</li>
        <li>
          Droit d&apos;introduire une réclamation auprès du Préposé fédéral à la protection des
          données et à la transparence (PFPDT), ou de l&apos;autorité de contrôle compétente dans
          votre pays.
        </li>
      </ul>
      <p>
        <strong>Pour les administrateurs</strong> : exercez vos droits à{" "}
        <a href="mailto:contact@benevol.app">contact@benevol.app</a>.
      </p>
      <p>
        <strong>Pour les bénévoles</strong> : vos données étant contrôlées par l&apos;Organisation
        qui vous a invité(e), adressez votre demande directement à cette Organisation. Nous
        transmettrons toute demande reçue par erreur à l&apos;Organisation concernée dans un délai
        de 72 heures.
      </p>

      <h2 id="conservation">7. Conservation des données</h2>
      <p>
        Les données des bénévoles sont conservées tant que l&apos;Organisation maintient son compte
        sur la plateforme. Quand l&apos;opérateur du service désactive le compte de l&apos;Organisation,
        elles sont supprimées par le nettoyage quotidien, une fois écoulés {RETENTION_DAYS.deactivatedOrganization} jours
        depuis la dernière modification de l&apos;Organisation désactivée. Une Organisation suspendue pour abus,
        ou désactivée faute d&apos;activité, n&apos;est pas supprimée automatiquement (voir ci-dessous).
      </p>
      <p>
        Pour un événement terminé depuis plus de {PAST_EVENT_RETENTION_YEARS} ans, les données des bénévoles peuvent être
        anonymisées : leur nom, leur adresse email et leur téléphone sont retirés des inscriptions, et
        leurs commentaires et réponses aux questions sont effacés. Cette règle s&apos;applique lorsque
        l&apos;opérateur du service l&apos;active. L&apos;Organisation est alors prévenue {PAST_EVENT_NOTICE_DAYS} jours
        avant la première anonymisation. Le détail figure dans la liste ci-dessous, à la ligne
        « Événement terminé depuis plus de {PAST_EVENT_RETENTION_YEARS} ans ».
      </p>
      <p>
        Un espace qui n&apos;est plus utilisé depuis {INACTIVITY_MONTHS} mois et qui n&apos;a aucun événement
        prévu peut être désactivé. Cette règle s&apos;applique lorsque l&apos;opérateur du service
        l&apos;active. Avant toute désactivation, trois messages sont envoyés aux administrateurs de
        l&apos;Organisation ; pour garder l&apos;espace, il suffit d&apos;ouvrir le lien d&apos;un de ces messages,
        puis d&apos;appuyer sur « Conserver mon organisation » sur la page qui s&apos;affiche. Chaque
        message doit avoir été accepté par notre serveur d&apos;envoi pour au moins un administrateur (ce qui
        ne garantit pas qu&apos;il ait été lu), et le suivant part au plus tôt {REMINDER_GAP_DAYS} jours de calendrier
        plus tard. Sans réponse, l&apos;espace est désactivé au plus tôt {FINAL_NOTICE_DAYS} jours après l&apos;envoi du
        dernier rappel, et jamais moins de {MIN_DEACTIVATION_DAYS} jours après l&apos;envoi du premier message ; chaque
        message indique jusqu&apos;à quel jour répondre. Tant qu&apos;un message n&apos;a été accepté pour aucun
        administrateur, l&apos;espace ne peut pas être désactivé. Une fois l&apos;espace désactivé, ses données sont
        gardées, et ses administrateurs peuvent le réactiver eux-mêmes : depuis la page de connexion, ils
        demandent un lien par email, utilisable une seule fois dans les {REACTIVATION_LINK_HOURS} heures, qui ouvre une page où
        confirmer la réactivation.
      </p>
      <p>
        Le compte d&apos;un administrateur retiré de l&apos;équipe est supprimé immédiatement. Les comptes des
        administrateurs d&apos;une Organisation sont supprimés avec elle. Une invitation d&apos;administrateur non acceptée est supprimée{" "}
        {RETENTION_DAYS.deactivatedAdmin} jours après son dernier envoi.
      </p>
      <p>Plus précisément :</p>
      <ul>
        {/* Generated from the retention policy (#486): the same table as the organisers' guide. */}
        {RETENTION.filter((e) => e.public).map((e) => (
          <li key={e.data}>{e.data.charAt(0).toLocaleLowerCase("fr") + e.data.slice(1)} : {e.duration} ;</li>
        ))}
      </ul>
      <p>
        Une Organisation peut à tout moment exporter ses données (archive JSON d&apos;un événement, membres
        et journal d&apos;activité en CSV) depuis son espace d&apos;administration, sans demande préalable.
      </p>

      <h2>8. Modifications</h2>
      <p>
        Nous pouvons mettre à jour cette politique à tout moment. La date de dernière mise à jour
        est indiquée en haut du document. Pour les modifications substantielles, nous notifierons
        les administrateurs par e-mail.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question relative à cette politique ou à l&apos;exercice de vos droits :{" "}
        <a href="mailto:contact@benevol.app">contact@benevol.app</a>
      </p>
    </>
  )
}
