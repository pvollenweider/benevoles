import Link from "next/link"

export const metadata = { title: "Conditions générales d'utilisation — benevol.app" }

export default function TermsPage() {
  return (
    <>
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="text-gray-500 text-sm">Dernière mise à jour : 30 avril 2026</p>

      <h2>1. Objet</h2>
      <p>
        Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès et
        l&apos;utilisation de la plateforme <strong>benevol.app</strong> (le « Service »), éditée
        par <strong>[À PRÉCISER — entité juridique]</strong> (« nous »).
      </p>
      <p>
        En accédant au Service, l&apos;utilisateur accepte les présentes CGU sans réserve.
      </p>

      <h2>2. Description du Service</h2>
      <p>
        benevol.app est une plateforme de gestion des bénévoles destinée aux associations et
        organisateurs d&apos;événements (les « Organisations »). Elle permet de créer des
        formulaires d&apos;inscription pour bénévoles, de gérer les présences et d&apos;envoyer
        des communications automatisées.
      </p>
      <p>
        Le Service est fourni <strong>gratuitement</strong> et sans garantie, dans l&apos;état où
        il se trouve (« as is »). Nous faisons de notre mieux pour assurer la disponibilité et la
        fiabilité du Service, mais nous n&apos;offrons aucune garantie de continuité, d&apos;absence
        d&apos;erreur ou d&apos;adéquation à un usage particulier.
      </p>

      <h2>3. Accès et comptes</h2>
      <p>
        L&apos;accès à l&apos;interface d&apos;administration est réservé aux personnes invitées
        par un administrateur d&apos;Organisation. Tout compte est nominatif et non cessible.
      </p>
      <p>
        L&apos;utilisateur est responsable de la confidentialité de ses identifiants et de toute
        activité effectuée depuis son compte.
      </p>
      <p>
        Les bénévoles n&apos;ont pas de compte sur la plateforme : leur participation est
        enregistrée via un formulaire public et ils ne se connectent pas au Service.
      </p>

      <h2>4. Utilisation acceptable</h2>
      <p>
        L&apos;utilisateur s&apos;engage à utiliser le Service conformément à la loi et aux
        présentes CGU. Sont notamment interdits :
      </p>
      <ul>
        <li>
          tout usage à des fins illégales, frauduleuses ou portant atteinte aux droits de tiers ;
        </li>
        <li>la collecte de données personnelles à des fins non liées à la gestion de bénévoles ;</li>
        <li>toute tentative de contournement des mesures de sécurité du Service ;</li>
        <li>
          l&apos;envoi de communications non sollicitées (spam) via les outils de messagerie du
          Service.
        </li>
      </ul>

      <h2>5. Données personnelles</h2>
      <p>
        Dans le cadre du Service, deux types de traitement coexistent :
      </p>
      <ul>
        <li>
          <strong>Données des administrateurs</strong> (nom, adresse e-mail, mot de passe hashé) :
          traitées par benevol.app en qualité de responsable du traitement, conformément à notre{" "}
          <Link href="/legal/privacy">Politique de confidentialité</Link>.
        </li>
        <li>
          <strong>Données des bénévoles</strong> (nom, e-mail, disponibilités, etc.) : collectées
          par l&apos;Organisation via le Service. L&apos;Organisation agit en qualité de responsable
          du traitement ; benevol.app agit en qualité de sous-traitant. L&apos;Organisation est
          seule responsable de la base légale du traitement, de l&apos;information des bénévoles et
          du respect du RGPD ou de la législation applicable.
        </li>
      </ul>
      <p>
        benevol.app s&apos;engage à traiter les données des bénévoles exclusivement pour les
        besoins du Service, à ne pas les vendre ni les communiquer à des tiers non autorisés, et à
        les supprimer sur demande de l&apos;Organisation.
      </p>

      <h2>6. Responsabilité et limitation de garantie</h2>
      <p>
        Le Service est fourni gratuitement et <strong>en l&apos;état, sans garantie d&apos;aucune
        sorte</strong>, expresse ou implicite. Dans toute la mesure permise par la loi applicable,
        nous déclinons toute responsabilité pour :
      </p>
      <ul>
        <li>
          toute interruption, erreur, perte de données ou indisponibilité du Service ;
        </li>
        <li>
          tout dommage direct ou indirect résultant de l&apos;utilisation ou de l&apos;impossibilité
          d&apos;utiliser le Service ;
        </li>
        <li>
          tout contenu, données ou communication transmis via le Service par les Organisations ou
          les bénévoles.
        </li>
      </ul>

      <h2>7. Suspension et résiliation</h2>
      <p>
        Nous nous réservons le droit de suspendre ou supprimer l&apos;accès au Service, à tout
        moment et sans préavis, en cas de violation des présentes CGU, d&apos;utilisation abusive
        ou pour toute autre raison légitime.
      </p>
      <p>
        Une Organisation peut demander la suppression de son compte et de l&apos;ensemble de ses
        données en nous contactant à <a href="mailto:contact@benevol.app">contact@benevol.app</a>.
      </p>

      <h2>8. Modifications</h2>
      <p>
        Nous pouvons modifier les présentes CGU à tout moment. Les modifications entrent en vigueur
        dès leur publication. L&apos;utilisation continue du Service après publication vaut
        acceptation des nouvelles conditions.
      </p>

      <h2>9. Droit applicable et juridiction</h2>
      <p>
        Les présentes CGU sont régies par le droit [suisse / français — À PRÉCISER]. Tout litige
        sera soumis à la juridiction exclusive des tribunaux de [ville — À PRÉCISER].
      </p>

      <h2>10. Contact</h2>
      <p>
        Pour toute question relative aux présentes CGU :{" "}
        <a href="mailto:contact@benevol.app">contact@benevol.app</a>
      </p>
    </>
  )
}
