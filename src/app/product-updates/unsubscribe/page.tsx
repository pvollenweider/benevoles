import type { Metadata } from "next"
import Link from "next/link"
import { verifyUnsubscribeToken } from "@/lib/product-updates"
import { SITE_NAME } from "@/lib/seo-metadata"

export const metadata: Metadata = {
  title: "Se désabonner des nouveautés",
  robots: { index: false, follow: false },
}

/**
 * The confirmation page the unsubscribe link now opens (#200): reading it changes nothing. The
 * « Me désabonner » button sends the POST that writes the preference, so a mail scanner or a link
 * preview cannot unsubscribe an administrator by opening the link.
 */
export default async function UnsubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string; token?: string }>
}) {
  const { admin, token } = await searchParams
  const adminId = typeof admin === "string" ? admin : ""
  const linkToken = typeof token === "string" ? token : ""
  const valid = adminId !== "" && linkToken !== "" && verifyUnsubscribeToken(adminId, linkToken)

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 text-center">
        {valid ? (
          <>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Se désabonner des nouveautés</h1>
            <p className="text-sm text-gray-500">
              Confirmez pour ne plus recevoir les communications admin de {SITE_NAME}. Votre compte reste actif.
            </p>
            <form method="post" action="/api/public/product-updates/unsubscribe" className="mt-6">
              <input type="hidden" name="admin" value={adminId} />
              <input type="hidden" name="token" value={linkToken} />
              <button
                type="submit"
                className="w-full rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Me désabonner
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-700 mb-2">Lien invalide</h1>
            <p className="text-sm text-gray-500">Ce lien de désabonnement n&apos;est plus valable.</p>
          </>
        )}
        <Link href="/" className="text-blue-600 text-sm mt-6 inline-block rounded underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Retour à l&apos;accueil</Link>
      </div>
    </main>
  )
}
