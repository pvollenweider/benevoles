import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    role?: string
    organizationId?: string | null
  }

  interface Session {
    user: {
      role?: string
      organizationId?: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    organizationId?: string | null
  }
}
