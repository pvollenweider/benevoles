// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import { getClientIp } from "@/lib/rate-limit"
import { loginAllowed, recordLoginFailure, refreshAdminToken } from "@/lib/admin-session"
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
        const ip = getClientIp(request)
        const email = normalizeEmail(credentials.email as string)
        if (!(await loginAllowed(ip, email))) return null

        const user = await prisma.adminUser.findUnique({
          where: { email },
          include: { organization: { select: { active: true } } },
        })

        if (!user || !user.isActive) {
          await recordLoginFailure(ip, email)
          return null
        }
        // super_admin has no organization (cross-tenant); org admins are
        // locked out once their organization is disabled.
        if (user.organization && !user.organization.active) return null

        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash)
        if (!valid) {
          await recordLoginFailure(ip, email)
          return null
        }

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
