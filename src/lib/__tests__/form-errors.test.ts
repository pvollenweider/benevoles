import { describe, it, expect } from "vitest"
import { describeBulkFailure, describeSignupFailure, mergeFailureMessage, partialOutcome } from "../form-errors"

// Error recovery on important forms (#375).
describe("describeSignupFailure", () => {
  it("tells validation, conflict, throttling, network and server failures apart", () => {
    expect(describeSignupFailure({ status: 400, body: { error: "Email invalide." } })).toMatchObject({ kind: "validation", message: "Email invalide.", retryable: false, maybeRecorded: false })
    expect(describeSignupFailure({ status: 409, body: { error: 'Le créneau "Bar" est complet.' } })).toMatchObject({ kind: "conflict", message: 'Le créneau "Bar" est complet.', retryable: false })
    expect(describeSignupFailure({ status: 429, body: { error: "Trop de tentatives." } })).toMatchObject({ kind: "rate_limit", retryable: false, maybeRecorded: false })
    expect(describeSignupFailure({ network: true })).toMatchObject({ kind: "network", retryable: true, maybeRecorded: true })
    expect(describeSignupFailure({ status: 502, body: null })).toMatchObject({ kind: "server", retryable: true, maybeRecorded: true })
  })

  it("says that retrying is safe when the request may have gone through", () => {
    expect(describeSignupFailure({ network: true }).hint).toContain("sans risque")
    expect(describeSignupFailure({ status: 500 }).hint).toContain("lien par email")
    expect(describeSignupFailure({ status: 400 }).hint).toContain("conservées")
  })

  it("keeps the server's sentence, falls back when it has none", () => {
    expect(describeSignupFailure({ status: 400, body: { error: "  " } }).message).toBe("Certaines informations sont invalides.")
    expect(describeSignupFailure({ status: 418, body: { error: "Théière." } }).message).toBe("Théière.")
  })
})

describe("describeBulkFailure / partialOutcome", () => {
  it("names the action and says whether anything was applied", () => {
    expect(describeBulkFailure({ network: true }, "Retrait")).toMatchObject({ kind: "network", title: "Connexion interrompue", maybeRecorded: true })
    expect(describeBulkFailure({ status: 409, body: { error: "Déjà responsable." } }, "Désignation")).toMatchObject({ kind: "conflict", title: "Désignation : refusé", hint: "Rien n'a été appliqué." })
    expect(describeBulkFailure({ status: 500 }, "Retrait").retryable).toBe(true)
    expect(partialOutcome(3, 0)).toBeNull()
    expect(partialOutcome(3, 1)).toBe("3 inscriptions traitées, 1 inscription en échec : rechargez la liste et réessayez sur celles qui restent.")
  })
})

describe("mergeFailureMessage", () => {
  it("says nothing was changed when the server rolled the merge back", () => {
    expect(mergeFailureMessage(500, { error: "La fusion n'a pas pu être faite. Rien n'a été modifié.", notApplied: true })).toBe("La fusion n'a pas pu être faite. Rien n'a été modifié.")
  })

  it("reads a non-JSON error page as a server error, not a cut connection (regression)", () => {
    const message = mergeFailureMessage(502, null)
    expect(message).toContain("erreur du serveur")
    expect(message).not.toContain("Connexion interrompue")
  })

  it("keeps the server's refusal for a 409", () => {
    expect(mergeFailureMessage(409, { error: "Une des deux fiches a déjà été fusionnée." })).toBe("Une des deux fiches a déjà été fusionnée.")
  })
})
