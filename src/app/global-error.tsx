"use client"

import NextError from "next/error"
import { useEffect } from "react"
import { captureClientException } from "@/lib/sentry-client-loader"

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    captureClientException(error)
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
