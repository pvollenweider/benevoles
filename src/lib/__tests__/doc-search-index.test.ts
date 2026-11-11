import { describe, it, expect } from "vitest"
import MiniSearch from "minisearch"
import {
  DOC_INDEX_OPTIONS,
  DOC_SEARCH_OPTIONS,
  docQueryTerms,
  docSearchDocuments,
  docSearchQuery,
  docSearchScores,
  processTerm,
  searchTerms,
  stemForSearch,
  tokenize,
  type DocSearchDocument,
} from "../doc-search-index"
import { loadDocUnits } from "../doc-units"

// The MiniSearch index of the documentation (#1319): tokenisation, term processing, synonyms,
// options round-trip, and the real guides' queries.

describe("tokenize", () => {
  it("keeps letters, digits and internal hyphens, and separates everything else", () => {
    expect(tokenize("J-1, J-2, A4, CSV, QR, 12h")).toEqual(["j-1", "j-2", "a4", "csv", "qr", "12h"])
    expect(tokenize("Créneaux et JOUR-J, l'événement")).toEqual(["creneaux", "et", "jour-j", "l", "evenement"])
    expect(tokenize("  ")).toEqual([])
  })

  it("splits the words of a slug on its hyphens, unlike the other fields", () => {
    expect(tokenize("s-inscrire", "slug")).toEqual(["s", "inscrire"])
    expect(tokenize("s-inscrire")).toEqual(["s-inscrire"])
  })
})

describe("processTerm", () => {
  it("drops the French stop words, one-letter tokens and pure numbers", () => {
    for (const word of ["le", "la", "comment", "un", "est", "pour", "a", "j", "12", "2026"]) {
      expect(processTerm(word), word).toBeNull()
    }
    for (const word of ["j-1", "j-2", "a4", "12h", "csv", "qr"]) {
      expect(processTerm(word), word).not.toBeNull()
    }
  })

  it("drops the demo names of the guides", () => {
    for (const name of ["aline", "zoe", "luc", "paul", "martin", "dubois", "rochat", "lea", "julien", "camille", "emma", "noah", "marc", "anne", "favre", "johansson", "elodie", "alice"]) {
      expect(processTerm(name), name).toBeNull()
    }
  })

  it("returns the light French stem, bringing the required families together", () => {
    const stems = (words: string[]) => new Set(words.map((word) => processTerm(word)))
    expect(stems(["confirme", "confirmee", "confirmer"])).toEqual(new Set(["confirm"]))
    expect(stems(["inscription", "inscrire", "inscrit"])).toEqual(new Set(["inscri"]))
    expect(stems(["rappel", "rappels"])).toEqual(new Set(["rappel"]))
    expect(stems(["supprimer", "suppression", "supprime"])).toEqual(new Set(["supprim"]))
    expect(stemForSearch("effacement")).toBe("effac")
  })
})

describe("searchTerms and docQueryTerms", () => {
  it("keeps the meaningful words of a query, without stop words, numbers or demo names", () => {
    expect(searchTerms("comment supprimer un membre")).toEqual(["supprimer", "membre"])
    expect(searchTerms("l'événement de la semaine")).toEqual(["evenement", "semaine"])
    expect(searchTerms("le la les")).toEqual([])
    expect(searchTerms("Camille 2026 rappel")).toEqual(["rappel"])
    expect(docQueryTerms("comment supprimer un membre")).toEqual(["supprim", "membr"])
  })
})

describe("docSearchQuery", () => {
  it("makes one OR group per term and its synonyms, all groups required", () => {
    expect(docSearchQuery("membre")).toEqual({ combineWith: "OR", queries: ["membre", "benevole"] })
    expect(docSearchQuery("creneau")).toEqual({ combineWith: "OR", queries: ["creneau", "horaire", "plage"] })
    expect(docSearchQuery("supprimer")).toEqual({ combineWith: "OR", queries: ["supprimer", "effacer"] })
    expect(docSearchQuery("desinscrire")).toEqual({ combineWith: "OR", queries: ["desinscrire", "annuler"] })
    expect(docSearchQuery("agenda")).toEqual({ combineWith: "OR", queries: ["agenda", "calendrier"] })
    expect(docSearchQuery("mdp")).toEqual({
      combineWith: "OR",
      queries: ["mdp", { combineWith: "AND", queries: ["mot", "passe"] }],
    })
  })

  it("combines several terms with AND, and shows everything for a blank or stop-word-only query", () => {
    expect(docSearchQuery("supprimer membre")).toEqual({
      combineWith: "AND",
      queries: [
        { combineWith: "OR", queries: ["supprimer", "effacer"] },
        { combineWith: "OR", queries: ["membre", "benevole"] },
      ],
    })
    expect(docSearchQuery("")).toBeNull()
    expect(docSearchQuery("le la les")).toBeNull()
  })
})

describe("the index options", () => {
  it("round-trips through JSON: building then loadJSON gives the same results", () => {
    const documents = docSearchDocuments(loadDocUnits())
    const built = new MiniSearch<DocSearchDocument>(DOC_INDEX_OPTIONS)
    built.addAll(documents)
    const loaded = MiniSearch.loadJSON<DocSearchDocument>(JSON.stringify(built), DOC_INDEX_OPTIONS)
    for (const query of ["rappel", "comment supprimer un membre", "mdp", "creneu"]) {
      const expression = docSearchQuery(query)
      // The order of a result's matched terms is an implementation detail; ids and scores are not.
      const results = (search: typeof built) =>
        search.search(expression!, DOC_SEARCH_OPTIONS).map((result) => ({ id: result.id, score: result.score }))
      expect(results(loaded), query).toEqual(results(built))
    }
  })
})

describe("the real guides", () => {
  const units = loadDocUnits()
  const index = new MiniSearch<DocSearchDocument>(DOC_INDEX_OPTIONS)
  index.addAll(docSearchDocuments(units))
  // The filter's ranking: docSearchScores (groups added, bonus for holding them all), best first.
  const hits = (query: string) =>
    [...(docSearchScores(index, query) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([slug]) => slug)

  it.each([
    ["comment supprimer un membre", "effacer-ou-supprimer-un-membre"],
    ["importer csv", "gerer-les-membres"],
    ["doublon", "doublons-et-fusion"],
    ["fusionner doublons", "doublons-et-fusion"],
    ["rappel", "rappels"],
    ["mdp", "se-connecter"],
    ["mot de passe perdu", "se-connecter"],
    ["liste d'attente", "liste-d-attente"],
    ["badge", "rapports-badges-et-resume"],
    ["dupliquer evenement", "dupliquer-un-evenement"],
    ["archiver", "archiver-ou-supprimer-un-evenement"],
    ["jour j", "presences-le-jour-j"],
    ["age minimum", "age-minimum"],
    ["qr code", "partager-le-lien"],
    ["smtp", "parametres-et-suivi-des-emails"],
    ["secteur responsable", "responsables-de-secteur"],
    ["exporter donnees", "exporter-et-conserver-ses-donnees"],
  ])("« %s » ranks %s first", (query, expected) => {
    expect(hits(query)[0]).toBe(expected)
  })

  it.each([
    ["attestation de benevolat", "gerer-les-membres"],
    ["calendrier agenda", "ma-page-personnelle"],
  ])("« %s » has %s in the top 3", (query, expected) => {
    expect(hits(query).slice(0, 3)).toContain(expected)
  })

  it("a long unit doesn't top a precise query: « fusionner doublons » keeps the doublons unit ahead of every other", () => {
    expect(hits("fusionner doublons").slice(0, 3)).toEqual(["doublons-et-fusion", "effacer-ou-supprimer-un-membre", "gerer-les-membres"])
  })

  it("keeps the results near the best one: a common word doesn't list nearly every unit", () => {
    const shown = hits("comment supprimer un membre").length
    expect(shown).toBeGreaterThanOrEqual(5)
    expect(shown).toBeLessThan(15)
  })

  it("a word found nowhere doesn't empty the list: « badge xyzzy » still finds the badges unit", () => {
    expect(hits("badge xyzzy")[0]).toBe("rapports-badges-et-resume")
  })

  it("« creneu » (typo) finds configurer-les-creneaux among the top 3", () => {
    expect(hits("creneu").slice(0, 3)).toContain("configurer-les-creneaux")
  })

  it("« inscri » finds s-inscrire", () => {
    expect(hits("inscri")).toContain("s-inscrire")
  })

  it("« desinscrire » finds a unit about cancelling a registration", () => {
    expect(hits("desinscrire")).toContain("ma-page-personnelle")
  })

  it("« xyzzy » finds none", () => {
    expect(hits("xyzzy")).toEqual([])
  })
})
