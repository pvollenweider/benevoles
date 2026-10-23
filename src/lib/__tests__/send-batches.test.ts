import { describe, it, expect } from "vitest"
import { batchCountsToFreeze, batchDelivery, batchDeliveryLabel, heldSentence, heldWaitSec, isMessageKind, recipientsText, sendBatchKindLabel, waitText, type BatchRow } from "../send-batches"

// #1101: one record per batch of emails, its delivery in words.
const t = (iso: string) => new Date(`2026-10-22T${iso}Z`)
const row = (o: Partial<BatchRow>): BatchRow => ({ status: "sent", lastHeldAt: null, firstHeldAt: null, sentAt: t("21:00:00"), ...o })
const none = { sentCount: 0, heldSentCount: 0, failedCount: 0, cancelledCount: 0, maxHeldWaitSec: 0 }

describe("send batches", () => {
  it("names every kind, and says which ones are messages", () => {
    expect(sendBatchKindLabel("member_invite")).toBe("Invitations")
    expect(sendBatchKindLabel("invite_reminder")).toBe("Relance des invités sans réponse")
    expect(sendBatchKindLabel("manual_reminder")).toBe("Rappel aux inscrits")
    expect(sendBatchKindLabel("scheduled_message")).toBe("Message programmé")
    expect(sendBatchKindLabel("open_shifts")).toBe("Créneaux à compléter")
    expect(sendBatchKindLabel("unknown")).toBe("Envoi groupé")
    expect(isMessageKind("targeted_message") && isMessageKind("scheduled_message") && isMessageKind("open_shifts")).toBe(true)
    expect(isMessageKind("member_invite") || isMessageKind("manual_reminder")).toBe(false)
  })

  it("measures the wait a limit caused, from the first hold to the departure", () => {
    expect(heldWaitSec(row({ firstHeldAt: t("21:00:00"), lastHeldAt: t("21:00:30"), sentAt: t("21:01:05") }))).toBe(65)
    // Held before firstHeldAt existed: the last hold is the best known start.
    expect(heldWaitSec(row({ lastHeldAt: t("21:00:00"), sentAt: t("21:00:40") }))).toBe(40)
    expect(heldWaitSec(row({}))).toBe(0)
    expect(heldWaitSec(row({ status: "pending", firstHeldAt: t("21:00:00"), sentAt: null }))).toBe(0)
  })

  it("adds the frozen counters to the rows still queued", () => {
    const d = batchDelivery(120, { sentCount: 100, heldSentCount: 1, failedCount: 1, cancelledCount: 0, maxHeldWaitSec: 30 }, [
      row({ firstHeldAt: t("21:00:00"), lastHeldAt: t("21:00:00"), sentAt: t("21:01:00") }),
      row({}),
      row({ status: "pending", lastHeldAt: t("21:00:00") }),
      row({ status: "sending", sentAt: null }),
      row({ status: "failed", sentAt: null }),
      row({ status: "cancelled", sentAt: null }),
    ])
    expect(d).toEqual({ recipients: 120, sent: 102, heldSent: 2, pending: 2, heldNow: 1, failed: 2, cancelled: 1, maxHeldWaitSec: 60 })
    expect(batchDeliveryLabel(d)).toBe("102 envoyés, 2 en attente, 2 en échec, 1 annulé")
    expect(batchDeliveryLabel(batchDelivery(0, none, []))).toBe("Aucun email parti")
    // Its count not written (best effort): the emails give it.
    expect(batchDelivery(0, { ...none, sentCount: 3 }, [row({ status: "pending", sentAt: null })]).recipients).toBe(4)
    expect(recipientsText(1)).toBe("1 destinataire")
    expect(recipientsText(120)).toBe("120 destinataires")
  })

  it("folds what the cleanup deletes, per batch, pending rows and other emails left out", () => {
    const frozen = batchCountsToFreeze([
      { ...row({ firstHeldAt: t("21:00:00"), lastHeldAt: t("21:00:00"), sentAt: t("21:02:00") }), sendBatchId: "b1" },
      { ...row({}), sendBatchId: "b1" },
      { ...row({ status: "failed", sentAt: null }), sendBatchId: "b1" },
      { ...row({ status: "cancelled", sentAt: null }), sendBatchId: "b2" },
      { ...row({ status: "pending", sentAt: null }), sendBatchId: "b3" },
      { ...row({}), sendBatchId: null },
    ])
    expect([...frozen.entries()]).toEqual([
      ["b1", { sentCount: 2, heldSentCount: 1, failedCount: 1, cancelledCount: 0, maxHeldWaitSec: 120 }],
      ["b2", { sentCount: 0, heldSentCount: 0, failedCount: 0, cancelledCount: 1, maxHeldWaitSec: 0 }],
    ])
  })

  it("says in a plain sentence when a limit delayed part of the batch", () => {
    const base = batchDelivery(120, none, [])
    expect(heldSentence(base)).toBeNull()
    expect(heldSentence({ ...base, heldSent: 1, maxHeldWaitSec: 61 })).toBe("1 email a attendu une minute avant de partir, à cause du plafond d'envoi.")
    expect(heldSentence({ ...base, heldSent: 30, maxHeldWaitSec: 185 })).toBe("30 emails ont attendu jusqu'à 3 minutes avant de partir, à cause du plafond d'envoi.")
    expect(heldSentence({ ...base, heldNow: 2 })).toBe("2 emails attendent leur tour à cause du plafond d'envoi : ils partiront dès que le plafond le permet.")
    expect(heldSentence({ ...base, heldSent: 1, maxHeldWaitSec: 20, heldNow: 1 })).toBe("1 email a attendu moins d'une minute avant de partir, à cause du plafond d'envoi. 1 email attend son tour à cause du plafond d'envoi : il partira dès que le plafond le permet.")
  })

  it("words a wait from seconds to days", () => {
    expect(waitText(10)).toBe("moins d'une minute")
    expect(waitText(60)).toBe("une minute")
    expect(waitText(600)).toBe("10 minutes")
    expect(waitText(3600)).toBe("une heure")
    expect(waitText(5 * 3600)).toBe("5 heures")
    expect(waitText(86400)).toBe("un jour")
    expect(waitText(3 * 86400)).toBe("3 jours")
  })
})
