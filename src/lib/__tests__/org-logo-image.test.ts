import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { createHash } from "node:crypto"
import { processLogo } from "../org-logo-image"
import { LOGO_ERRORS, LOGO_MAX_SIDE, LOGO_TARGET_BYTES } from "../org-logo"

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g: 60, b: 160, alpha: 1 } } })

/** Random pixels: the worst case for compression (a photo saved as PNG). */
function noise(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3)
  let seed = 42
  for (let i = 0; i < raw.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; raw[i] = seed & 0xff }
  return sharp(raw, { raw: { width, height, channels: 3 } })
}

describe("processLogo (#300)", () => {
  it("reduces a large PNG to 512 px on its longest side and keeps it a PNG", async () => {
    const input = await solid(2000, 1000).png().toBuffer()
    const result = await processLogo(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.logo).toMatchObject({ mimeType: "image/png", width: LOGO_MAX_SIDE, height: 256 })
    const meta = await sharp(result.logo.data).metadata()
    expect(meta.format).toBe("png")
    expect([meta.width, meta.height]).toEqual([512, 256])
    expect(result.logo.hash).toBe(createHash("sha256").update(result.logo.data).digest("hex"))
  })

  it("never enlarges a small logo", async () => {
    const result = await processLogo(await solid(200, 80).png().toBuffer())
    expect(result.ok && [result.logo.width, result.logo.height]).toEqual([200, 80])
  })

  it("re-encodes a JPEG, upright, without its metadata (EXIF, GPS)", async () => {
    // 600 × 300 stored, orientation 6: shown 300 × 600 once turned.
    const input = await solid(600, 300).flatten({ background: "#ffffff" }).jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret", Artist: "Someone" } } })
      .toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    const result = await processLogo(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.logo).toMatchObject({ mimeType: "image/jpeg", width: 256, height: 512 })
    const meta = await sharp(result.logo.data).metadata()
    expect(meta.format).toBe("jpeg")
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
    expect(result.logo.data.includes(Buffer.from("secret"))).toBe(false)
  })

  it("keeps the stored image at about 200 KB at most, even for a noisy PNG or JPEG", async () => {
    const png = await processLogo(await noise(1200, 1200).png().toBuffer())
    expect(png.ok && png.logo.data.length).toBeLessThanOrEqual(LOGO_TARGET_BYTES)
    expect(png.ok && png.logo.mimeType).toBe("image/png")
    const jpeg = await processLogo(await noise(900, 900).jpeg({ quality: 100 }).toBuffer())
    expect(jpeg.ok && jpeg.logo.data.length).toBeLessThanOrEqual(LOGO_TARGET_BYTES)
  }, 30_000)

  it("refuses SVG, even named .png (the bytes decide)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>')
    expect(await processLogo(svg)).toEqual({ ok: false, error: LOGO_ERRORS.svg })
  })

  it("refuses WebP and GIF, which sharp could decode", async () => {
    expect(await processLogo(await solid(100, 100).webp().toBuffer())).toEqual({ ok: false, error: LOGO_ERRORS.format })
    expect(await processLogo(await solid(100, 100).gif().toBuffer())).toEqual({ ok: false, error: LOGO_ERRORS.format })
  })

  it("refuses a file over 2 MB before decoding it", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big)
    expect(await processLogo(big)).toEqual({ ok: false, error: LOGO_ERRORS.tooLarge })
  })

  it("refuses a truncated or corrupt image", async () => {
    const png = await solid(300, 300).png().toBuffer()
    expect(await processLogo(png.subarray(0, 60))).toEqual({ ok: false, error: LOGO_ERRORS.unreadable })
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not really a png")])
    expect(await processLogo(fake)).toEqual({ ok: false, error: LOGO_ERRORS.unreadable })
  })

  it("refuses a decompression bomb (too many pixels) and a tiny image", async () => {
    // A small file that would decode to 36 million pixels.
    const bomb = await sharp({ create: { width: 6000, height: 6000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer()
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024)
    expect(await processLogo(bomb)).toEqual({ ok: false, error: LOGO_ERRORS.tooManyPixels })
    expect(await processLogo(await solid(20, 200).png().toBuffer())).toEqual({ ok: false, error: LOGO_ERRORS.tooSmall })
  }, 30_000)
})
