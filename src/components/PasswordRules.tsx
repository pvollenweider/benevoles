"use client"

import { PASSWORD_RULES } from "@/lib/password"

export default function PasswordRules({ password }: { password: string }) {
  if (!password) return null
  return (
    <ul className="space-y-1 mt-2">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-red-500"}`}>
            <span>{ok ? "✓" : "✗"}</span>
            <span>{rule.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
