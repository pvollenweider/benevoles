"use client"

import { useEffect, useState } from "react"

/**
 * One-shot confirmation after a redirect (e.g. `?deleted=1`). The live region
 * is rendered empty and filled after mount so screen readers announce it, then
 * the query parameter is removed so a reload does not repeat the message.
 */
export default function FlashMessage({ message }: { message: string }) {
  const [text, setText] = useState("")

  useEffect(() => {
    // Fill the live region shortly after mount so the change is announced.
    const timer = window.setTimeout(() => setText(message), 100)
    window.history.replaceState(null, "", window.location.pathname)
    return () => window.clearTimeout(timer)
  }, [message])

  return (
    <div role="status" className={text ? "rounded-xl bg-green-50 border border-green-700 px-4 py-3 text-sm font-medium text-green-900" : "sr-only"}>
      {text}
    </div>
  )
}
