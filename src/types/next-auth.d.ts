import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    role?: string
    organizationId?: string | null
    sessionVersion?: number
  }

  interface Session {
    user: {
      id?: string
      role?: string
      organizationId?: string | null
    } & DefaultSession["user"]
    /** Second factor of the super admin (src/lib/second-factor-session.ts). */
    secondFactor?: {
      /** The code is still to be given: role and organization are withheld until then. */
      pending: boolean
      /** Random id of this sign-in, which the second factor's proof is bound to. */
      loginNonce: string | null
      /** When the password was checked (ms since epoch). */
      authAt: number | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    organizationId?: string | null
    sessionVersion?: number
    /** Random id of this session, set at sign-in (src/lib/session-lifetime.ts). */
    sid?: string
    /** Sign-in time, in seconds since the epoch: the absolute lifetime counts from it. */
    authTime?: number
    /** Second factor (src/lib/second-factor-session.ts): sign-in nonce and time (ms), code checked at (ms). */
    loginNonce?: string
    authAt?: number
    secondFactorAt?: number
  }
}
