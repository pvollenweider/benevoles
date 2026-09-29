import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import { getClientIp } from "@/lib/rate-limit"
import { loginAllowed, recordLoginFailure, refreshAdminToken } from "@/lib/admin-session"
import { normalizeEmail } from "@/lib/email-address"

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
        const ip = getClientIp(request)
        const email = normalizeEmail(credentials.email as string)
        if (!loginAllowed(ip, email)) return null

        const user = await prisma.adminUser.findUnique({
          where: { email },
          include: { organization: { select: { active: true } } },
        })

        if (!user || !user.isActive) {
          recordLoginFailure(ip, email)
          return null
        }
        // super_admin has no organization (cross-tenant); org admins are
        // locked out once their organization is disabled.
        if (user.organization && !user.organization.active) return null

        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash)
        if (!valid) {
          recordLoginFailure(ip, email)
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        }
      },
    }),
  ],
})
