export const metadata = { title: "Politique de confidentialité — benevol.app" }

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="text-gray-500 text-sm">Dernière mise à jour : 30 avril 2026</p>

      <p>
        La présente politique décrit comment <strong>benevol.app</strong>, éditée par{" "}
        <strong>[À PRÉCISER — entité juridique]</strong> (« nous »), collecte, utilise et protège
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
      </ul>

      <h2>2. Données que nous traitons en qualité de responsable</h2>

      <h3>2.1 Administrateurs</h3>
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
            <td>Durée du compte + 30 jours</td>
          </tr>
          <tr>
            <td>Mot de passe (hashé bcrypt)</td>
            <td>Authentification</td>
            <td>Exécution du contrat</td>
            <td>Durée du compte</td>
          </tr>
          <tr>
            <td>Logs de connexion</td>
            <td>Sécurité et débogage</td>
            <td>Intérêt légitime</td>
            <td>90 jours</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2 Cookies et stockage local</h3>
      <p>
        Nous utilisons un cookie de session (NextAuth) strictement nécessaire à
        l&apos;authentification. Aucun cookie de pistage, analytique ou publicitaire n&apos;est
        déposé.
      </p>
      <p>
        L&apos;interface publique (formulaires bénévoles) utilise le <code>localStorage</code> du
        navigateur pour mémoriser temporairement une session locale (sans compte). Ces données
        restent sur l&apos;appareil de l&apos;utilisateur et ne sont pas transmises à nos serveurs.
      </p>

      <h2>3. Données que nous traitons en qualité de sous-traitant</h2>
      <p>
        Les données que les Organisations collectent sur leurs bénévoles (nom, e-mail,
        disponibilités, présences, notes éventuelles) sont traitées exclusivement pour le compte de
        l&apos;Organisation concernée.
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

      <h2>4. Transferts et sous-traitants</h2>
      <p>
        Les données sont hébergées sur des serveurs situés en{" "}
        <strong>[À PRÉCISER — ex. Union européenne / Suisse]</strong>. Nous faisons appel aux
        sous-traitants techniques suivants :
      </p>
      <ul>
        <li>
          <strong>Hébergeur</strong> : [À PRÉCISER — ex. Vercel / Hetzner / OVH] — hébergement de
          l&apos;application
        </li>
        <li>
          <strong>Base de données</strong> : [À PRÉCISER — ex. Supabase / Neon] — stockage des
          données
        </li>
        <li>
          <strong>Service e-mail transactionnel</strong> : [À PRÉCISER — ex. Resend / Sendgrid] —
          envoi des notifications
        </li>
      </ul>
      <p>
        Chaque sous-traitant est lié par un accord de traitement de données conforme aux exigences
        du RGPD.
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

      <h2>6. Droits des personnes concernées</h2>
      <p>
        Conformément au RGPD (ou à la loi fédérale suisse sur la protection des données, selon la
        juridiction applicable), vous disposez des droits suivants :
      </p>
      <ul>
        <li>Droit d&apos;accès, de rectification et d&apos;effacement de vos données ;</li>
        <li>Droit à la portabilité ;</li>
        <li>Droit d&apos;opposition et de limitation du traitement ;</li>
        <li>Droit d&apos;introduire une réclamation auprès de l&apos;autorité de contrôle compétente.</li>
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

      <h2>7. Conservation des données</h2>
      <p>
        Les données des bénévoles sont conservées tant que l&apos;Organisation maintient son compte
        sur la plateforme. Elles sont supprimées dans un délai de 30 jours suivant la clôture du
        compte de l&apos;Organisation.
      </p>
      <p>
        Les données des administrateurs sont supprimées dans un délai de 30 jours suivant la
        désactivation ou la suppression du compte.
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
