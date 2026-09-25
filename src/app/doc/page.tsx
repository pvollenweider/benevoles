import Link from "next/link"

export const metadata = { title: "Documentation — benevol.app" }

export default function DocIndexPage() {
  return (
    <>
      <h1>Documentation</h1>
      <p>Deux guides, selon ce que vous cherchez à faire sur benevol.app :</p>
      <ul>
        <li>
          <Link href="/doc/admin">Guide administrateur</Link> — créer un événement, configurer les
          créneaux, inviter des membres, suivre les inscriptions, et les fonctionnalités plus
          récentes (pages personnalisées, responsables de secteur, jalons, journaux d&apos;activité).
        </li>
        <li>
          <Link href="/doc/benevole">Guide bénévole</Link> — s&apos;inscrire à un créneau, recevoir sa
          confirmation, gérer son inscription.
        </li>
      </ul>
    </>
  )
}
