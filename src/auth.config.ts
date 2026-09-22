import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAdminPath = nextUrl.pathname.startsWith("/admin")
      const isLoginPage = nextUrl.pathname === "/admin/login"

      if (isAdminPath && !isLoginPage && !isLoggedIn) return false
      return true
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as { role?: string; organizationId?: string | null }
        token.role = u.role
        token.organizationId = u.organizationId ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        const u = session.user as {
          id?: string
          role?: string
          organizationId?: string | null
        }
        // NextAuth's own default session callback would set this from token.sub, but a custom
        // callback replaces rather than extends it — so it has to be copied explicitly, or
        // session.user.id stays undefined. Caught by event-log's adminActor(): every logged
        // action recorded an empty actorId until this was added.
        u.id = token.sub
        u.role = token.role as string | undefined
        u.organizationId = (token.organizationId as string | null | undefined) ?? null
      }
      return session
    },
  },
  providers: [],
}
