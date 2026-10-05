// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fitLogo, orgLogoAlt, type OrgLogo } from "@/lib/org-logo"

/**
 * The organization's logo (#300) in a page: on its own white tile, so it reads the same on the
 * neutral header and on an accent band, at a fixed maximum box with its proportions kept (width
 * and height reserve the space, no layout shift). `nameShownBeside`: the organization's name is
 * written right next to it, so the image is decorative (alt=""); otherwise its alt is the name.
 */
export default function OrgLogoImage({ logo, organizationName, nameShownBeside, maxWidth, maxHeight, tile = true, className = "" }: {
  logo: OrgLogo
  organizationName: string
  nameShownBeside: boolean
  maxWidth: number
  maxHeight: number
  /** The white tile behind the logo; not needed on a white page (certificate). */
  tile?: boolean
  className?: string
}) {
  const size = fitLogo(logo.width, logo.height, maxWidth, maxHeight)
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin image, already resized and re-encoded server-side
    <img
      src={logo.src}
      alt={orgLogoAlt(organizationName, nameShownBeside)}
      width={size.width}
      height={size.height}
      className={`box-content shrink-0 object-contain ${tile ? "rounded-md bg-white p-1" : ""} ${className}`}
    />
  )
}
