"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react"
import { captureClientException } from "@/lib/sentry-client-loader"
import { isNetworkFailure, shouldAutoReload } from "@/lib/global-error-recovery"

// The root layout (globals.css, fonts) is not loaded here: every style is inline, following the
// colours and type of DESIGN.md. The page is French, neutral enough for organisers and volunteers,
// and offers no technical detail (#1442).
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

function reloadPage() {
  window.location.reload()
}

type GlobalErrorProps = {
  error: Error & { digest?: string }
  /** Test hook; the page reloads for real by default. */
  reload?: () => void
}

export default function GlobalError({ error, reload = reloadPage }: GlobalErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  const network = isNetworkFailure(error)

  useEffect(() => {
    // The page replaces the whole document: nothing else announces it, so focus starts on the
    // heading once the page stays on screen (not just before an automatic reload, which would
    // announce a failure the visitor never sees). A code-focused target takes no visible outline
    // (DESIGN.md, §4).
    if (isNetworkFailure(error)) {
      // A connection interrupted at network level (often just after a deploy). Not our code's
      // error: never send it to Sentry. Reload once, guarded by a session timestamp; a second
      // failure inside the window leaves this page in place instead of looping.
      let storage: Storage | null = null
      try {
        storage = window.sessionStorage
      } catch {
        // Storage itself can be refused (private mode, blocked cookies): stay on the page.
      }
      if (storage && shouldAutoReload(storage, Date.now())) {
        reload()
        return
      }
      headingRef.current?.focus()
      return
    }

    headingRef.current?.focus()
    captureClientException(error)
  }, [error, reload])

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
          background: "#f9fafb",
          color: "#111827",
          fontFamily: FONT_FAMILY,
          fontSize: "0.875rem",
          lineHeight: 1.6,
        }}
      >
        {/* No root layout here: React moves these into <head> (metadata is not supported in
            global-error). Without the viewport, phones would render the page zoomed out. */}
        <title>La page n'a pas pu se charger</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <main
          style={{
            width: "100%",
            maxWidth: "32rem",
            padding: "1.5rem",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.4, outline: "none" }}>
            La page n'a pas pu se charger
          </h1>
          <p style={{ margin: "0.75rem 0 0", color: "#4b5563" }}>
            {network
              ? "La connexion a été interrompue, souvent pendant une mise à jour du service : recharger la page suffit."
              : "Une erreur inattendue est survenue. Recharger la page peut suffire ; si le problème persiste, le retour à l'accueil permet de repartir."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              className="global-error-reload"
              onClick={reload}
              style={{
                minWidth: "44px",
                minHeight: "44px",
                padding: "calc(0.5rem - 1px) calc(1rem - 1px)",
                // Transparent, not none: forced-colors mode paints it, so the button stays visible.
                border: "1px solid transparent",
                borderRadius: "12px",
                color: "#ffffff",
                fontFamily: FONT_FAMILY,
                fontSize: "0.875rem",
                fontWeight: 500,
                lineHeight: 1.4,
                cursor: "pointer",
              }}
            >
              Recharger la page
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, not the router: the router may be what failed */}
            <a
              className="global-error-home"
              href="/"
              style={{
                display: "inline-flex",
                minHeight: "44px",
                alignItems: "center",
                color: "#2563eb",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Retour à l'accueil
            </a>
          </div>
        </main>
        <style>{`
          .global-error-reload { background: #2563eb; }
          .global-error-reload:hover { background: #1d4ed8; }
          .global-error-reload:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
          .global-error-home:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        `}</style>
      </body>
    </html>
  )
}
