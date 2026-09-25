import Link from "next/link"

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>
}) {
  const { ok } = await searchParams
  const success = ok === "1"

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div
        role={success ? "status" : "alert"}
        className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center"
      >
        {success ? (
          <>
            <span aria-hidden="true" className="text-4xl block mb-4">✓</span>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Désabonnement confirmé</h1>
            <p className="text-sm text-gray-500">
              Vous ne recevrez plus d&apos;emails de nouveautés produit benevol.app. Votre compte reste actif.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-700 mb-2">Lien invalide</h1>
            <p className="text-sm text-gray-500">Ce lien de désabonnement n&apos;est plus valide.</p>
          </>
        )}
        <Link href="/" className="text-blue-600 text-sm mt-6 inline-block underline underline-offset-2">Retour à l&apos;accueil</Link>
      </div>
    </main>
  )
}
