import { describe, it, expect } from "vitest"
import { readStored, removeStored, writeStored } from "../device-storage"

// The public page's session on the device (#948): a third-party frame may get no storage at all.

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
  }
}

const refusing = {
  getItem: () => { throw new DOMException("The operation is insecure.", "SecurityError") },
  setItem: () => { throw new DOMException("The operation is insecure.", "SecurityError") },
  removeItem: () => { throw new DOMException("The operation is insecure.", "SecurityError") },
}

describe("device storage", () => {
  it("reads, writes and removes when storage works", () => {
    const store = memoryStore()
    expect(readStored("k", store)).toBeNull()
    writeStored("k", "v", store)
    expect(readStored("k", store)).toBe("v")
    removeStored("k", store)
    expect(readStored("k", store)).toBeNull()
  })

  it("never throws when storage is refused (blocked site data, third-party frame)", () => {
    expect(() => writeStored("k", "v", refusing)).not.toThrow()
    expect(readStored("k", refusing)).toBeNull()
    expect(() => removeStored("k", refusing)).not.toThrow()
  })

  it("does nothing without storage", () => {
    expect(readStored("k", null)).toBeNull()
    expect(() => writeStored("k", "v", null)).not.toThrow()
    expect(() => removeStored("k", null)).not.toThrow()
  })
})
