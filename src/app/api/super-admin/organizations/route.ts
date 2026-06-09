import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { z } from "zod"

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(100),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      _count: {
        select: {
          events: true,
          admins: true,
          volunteers: true,
        },
      },
    },
  })

  return NextResponse.json(orgs)
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const body = await req.json()
  const parsed = createOrgSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { name, adminEmail, adminName } = parsed.data

  // Build a unique slug
  const baseSlug = slugify(name)
  let slug = baseSlug
  let suffix = 1
  while (await db.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }

  // Check admin email is not already taken
  const existingAdmin = await db.adminUser.findUnique({ where: { email: adminEmail } })
  if (existingAdmin) {
    return NextResponse.json({ error: "Cet email admin est déjà utilisé." }, { status: 409 })
  }

  const setupToken = generateToken()
  const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const placeholderHash = await bcrypt.hash(generateToken(), 4)

  const org = await db.organization.create({
    data: {
      name,
      slug,
      active: true,
      admins: {
        create: {
          email: adminEmail,
          name: adminName,
          passwordHash: placeholderHash,
          role: "admin",
          isActive: false,
          setupToken,
          setupTokenExpiresAt,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${setupToken}`

  return NextResponse.json({ org, inviteUrl }, { status: 201 })
}
