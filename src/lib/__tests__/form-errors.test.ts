import { describe, it, expect } from "vitest"
import { describeBulkFailure, describeSignupFailure, mergeFailureMessage, partialOutcome, SIGNUP_RETRY_HINT } from "../form-errors"
import { BUSY_SIGNUP_MESSAGE, busySignupRefusal, STALE_LINK_MESSAGE, staleLinkRefusal } from "../signup-eligibility"

// Error recovery on important forms (#375).
describe("describeSignupFailure", () => {
  it("tells validation, conflict, throttling, network and server failures apart", () => {
    expect(describeSignupFailure({ status: 400, body: { error: "Email invalide." } })).toMatchObject({ kind: "validation", message: "Email invalide.", retryable: false, maybeRecorded: false })
    expect(describeSignupFailure({ status: 409, body: { error: 'Le créneau "Bar" est complet.' } })).toMatchObject({ kind: "conflict", message: 'Le créneau "Bar" est complet.', retryable: false })
    expect(describeSignupFailure({ status: 429, body: { error: "Trop de tentatives." } })).toMatchObject({ kind: "rate_limit", retryable: false, maybeRecorded: false })
    expect(describeSignupFailure({ network: true })).toMatchObject({ kind: "network", retryable: true, maybeRecorded: true })
    expect(describeSignupFailure({ status: 502, body: null })).toMatchObject({ kind: "server", retryable: true, maybeRecorded: true })
  })

  // #1047: a duplicate is told apart from a full shift by the server's flag, not by its wording.
  it("explains a duplicate with the server's sentence and still offers the planning", () => {
    const dup = describeSignupFailure({ status: 409, body: { error: "Cette adresse a déjà une inscription.", duplicate: true } })
    expect(dup).toMatchObject({ kind: "duplicate", title: "Inscription déjà enregistrée", message: "Cette adresse a déjà une inscription.", retryable: false, maybeRecorded: false })
    expect(dup.hint).toContain("planning")
    expect(describeSignupFailure({ status: 409, body: { duplicate: true } }).message).toContain("tes emails")
    expect(describeSignupFailure({ status: 409, body: { error: "Complet.", duplicate: "yes" } }).kind).toBe("conflict")
  })

  // #1138 follow-up: the link the page was opened with was replaced; the planning is no way on.
  it("explains a replaced link by the server's flag and points to the newest link, not the planning", () => {
    const refusal = staleLinkRefusal()
    const stale = describeSignupFailure({ status: refusal.status, body: refusal.body })
    expect(stale).toMatchObject({ kind: "stale_link", title: "Ce lien n'est plus valable", message: STALE_LINK_MESSAGE, retryable: false, maybeRecorded: false })
    expect(stale.hint).toContain("dernier lien reçu par email")
    expect(stale.hint).not.toContain("planning")
    expect(describeSignupFailure({ status: 409, body: { staleLink: true } }).message).toContain("remplacé")
    expect(describeSignupFailure({ status: 409, body: { error: "Complet.", staleLink: "yes" } }).kind).toBe("conflict")
    // The refusal never carries a link.
    expect(JSON.stringify(refusal.body)).not.toMatch(/token/i)
  })

  it("says that retrying is safe when the request may have gone through", () => {
    // Without proof of the address the answer can't say whether it went through (AUTHZ-01): the
    // emails do, and retrying never duplicates.
    expect(describeSignupFailure({ network: true }).hint).toBe(SIGNUP_RETRY_HINT)
    expect(describeSignupFailure({ network: true }).maybeRecorded).toBe(true)
    expect(describeSignupFailure({ status: 500 }).hint).toBe(SIGNUP_RETRY_HINT)
    expect(SIGNUP_RETRY_HINT).toContain("pas de doublon")
    expect(SIGNUP_RETRY_HINT).toContain("courriers indésirables")
    expect(describeSignupFailure({ status: 400 }).hint).toContain("conservées")
  })

  it("contention: nothing recorded, try again in a few seconds (AUTHZ-04)", () => {
    const busy = describeSignupFailure({ status: 409, body: busySignupRefusal().body })
    expect(busy).toMatchObject({ kind: "busy", title: "Beaucoup d'inscriptions en même temps", retryable: true, maybeRecorded: false })
    expect(busy.message).toBe(BUSY_SIGNUP_MESSAGE)
    expect(busy.hint).toBe("Confirme à nouveau dans quelques secondes\u00a0; tes informations restent remplies.")
    // Never mistaken for the rate limit.
    expect(describeSignupFailure({ status: 429 }).kind).toBe("rate_limit")
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
