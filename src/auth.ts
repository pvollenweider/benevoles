// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import { getClientIp } from "@/lib/rate-limit"
import { beginLoginAttempt, refreshAdminToken } from "@/lib/admin-session"
import { verifyAdminLogin } from "@/lib/admin-login"
import { normalizeEmail } from "@/lib/email-address"
import { MAX_LOGIN_PASSWORD_LENGTH } from "@/lib/password"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Node-only extension of the edge-safe jwt callback: revalidates the admin against the DB on
    // every auth() call — see refreshAdminToken().
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params)
      return token ? refreshAdminToken(token) : null
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) return null
        // Oversized input refused before bcrypt (#359); not the 72-byte policy, which only applies
        // when a password is set, so longer passwords set before it still work.
        if (String(credentials.password).length > MAX_LOGIN_PASSWORD_LENGTH) return null
        const user = await verifyAdminLogin(
          { email: normalizeEmail(credentials.email as string), password: credentials.password as string, ip: getClientIp(request) },
          {
            beginAttempt: beginLoginAttempt,
            findUser: (email) => prisma.adminUser.findUnique({ where: { email }, include: { organization: { select: { active: true } } } }),
            compare: (password, hash) => bcrypt.compare(password, hash),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          },
        )
        if (!user) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
})
