import { describe, it, expect } from "vitest"
import {
  cleanPageRoleNames,
  pagePostesLine,
  pagesForPostes,
  pagesToReadBeforeShift,
  posteChoiceLabel,
  READ_BEFORE_LABEL,
  removeRoleFromPage,
  renameRoleInPage,
} from "../event-page-postes"

const page = (slug: string, roleNames: string[], displayOrder = 0, title = slug) => ({ slug, title, displayOrder, roleNames })

describe("pagesToReadBeforeShift (#1324)", () => {
  const pages = [
    page("caisse", ["Caisse"], 1, "Tenir la caisse"),
    page("parking", ["Parking"], 0, "Plan du parking"),
    page("accueil", ["Accueil"], 2),
    page("general", [], 3, "Informations générales"),
  ]

  it("shows a page for a confirmed place on its poste", () => {
    expect(pagesToReadBeforeShift(pages, [{ status: "active", roleName: "Caisse" }]).map((p) => p.slug)).toEqual(["caisse"])
  })

  it("counts confirmed places only: waiting list, request and cancelled place show nothing", () => {
    for (const status of ["waiting", "offered", "requested", "cancelled"]) {
      expect(pagesToReadBeforeShift(pages, [{ status, roleName: "Caisse" }]), status).toEqual([])
    }
  })

  it("shows a page once for several shifts of the same poste", () => {
    const places = [
      { status: "active", roleName: "Caisse" },
      { status: "active", roleName: "Caisse" },
      { status: "active", roleName: "Caisse" },
    ]
    expect(pagesToReadBeforeShift(pages, places).map((p) => p.slug)).toEqual(["caisse"])
  })

  it("shows every page of one poste, in the event's page order", () => {
    const several = [page("b", ["Bar"], 2), page("a", ["Bar"], 1, "A")]
    expect(pagesToReadBeforeShift(several, [{ status: "active", roleName: "Bar" }]).map((p) => p.slug)).toEqual(["a", "b"])
  })

  it("never shows a page of another poste or a page attached to no poste", () => {
    const shown = pagesToReadBeforeShift(pages, [{ status: "active", roleName: "Bar" }])
    expect(shown).toEqual([])
  })

  it("ignores a stored name no confirmed place carries any more (a deleted poste)", () => {
    expect(pagesToReadBeforeShift(pages, [{ status: "active", roleName: "Caisse supprimée" }])).toEqual([])
    // The same page still shows for a poste that is still there.
    expect(pagesToReadBeforeShift(pages, [{ status: "active", roleName: "Accueil" }]).map((p) => p.slug)).toEqual(["accueil"])
  })

  it("shows all the pages of several confirmed postes, once each", () => {
    const places = [
      { status: "active", roleName: "Caisse" },
      { status: "active", roleName: "Parking" },
      { status: "waiting", roleName: "Accueil" },
    ]
    expect(pagesToReadBeforeShift(pages, places).map((p) => p.slug)).toEqual(["parking", "caisse"])
  })
})

describe("pagesForPostes (leader page, #1324)", () => {
  const pages = [page("caisse", ["Caisse"], 1), page("accueil", ["Accueil"], 0), page("general", [], 2)]

  it("shows the pages of the postes the leader covers, once each", () => {
    expect(pagesForPostes(pages, ["Caisse", "Accueil"]).map((p) => p.slug)).toEqual(["accueil", "caisse"])
  })

  it("never shows a page attached to no poste", () => {
    expect(pagesForPostes(pages, ["Caisse"])).toEqual([pages[0]])
    expect(pagesForPostes(pages, ["Inconnu"])).toEqual([])
    expect(pagesForPostes(pages, [])).toEqual([])
  })
})

describe("admin attachment helpers (#1324)", () => {
  it("keeps only live poste names on save, trimmed and distinct; empty is valid", () => {
    expect(cleanPageRoleNames([" Bar ", "Bar", "Supprimé", ""], ["Bar", "Accueil"])).toEqual(["Bar"])
    expect(cleanPageRoleNames([], ["Bar"])).toEqual([])
  })

  it("describes the page list in words", () => {
    expect(pagePostesLine([])).toBeNull()
    expect(pagePostesLine(["Bar"])).toBe("Pour le poste Bar")
    expect(pagePostesLine(["Bar", "Accueil", "Caisse"])).toBe("Pour 3 postes : Bar, Accueil, Caisse")
    expect(READ_BEFORE_LABEL).toBe("À lire avant ton créneau")
  })

  it("marks a stored name no live poste carries", () => {
    expect(posteChoiceLabel("Bar", ["Bar"])).toBe("Bar")
    expect(posteChoiceLabel("Bar", ["Accueil"])).toBe("Bar (poste supprimé)")
  })

  it("follows a rename and a deletion", () => {
    expect(renameRoleInPage(["Bar", "Accueil"], "Bar", "Buvette")).toEqual(["Buvette", "Accueil"])
    expect(removeRoleFromPage(["Bar", "Accueil"], "Bar")).toEqual(["Accueil"])
  })
})
