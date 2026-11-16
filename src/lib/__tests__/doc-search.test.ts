import { describe, it, expect } from "vitest"
import {
  DOC_HELP_UNIT_SLUG,
  docFilterNextSteps,
  docFilterStatus,
  docUnitQuestionAnchors,
  docUnitQuestions,
  docUnitSections,
  docUnitWords,
  isOneTypoApart,
  matchesDocQuery,
  matchingDocQuestionLinks,
  matchingDocQuestions,
  matchingDocSectionLinks,
  matchingDocSections,
  normalizeForSearch,
  searchTermMatchesWord,
  searchTerms,
  stemForSearch,
} from "../doc-search"
import { readDocUnits } from "../doc-units"
import { renderDocUnit } from "../public-content"
import { DOC_FAQ_HEADING_ID } from "../doc-faq"

// The filter over the documentation's index (/doc, /doc/admin, /doc/benevole): the fallback used
// before the MiniSearch index arrives, and the links, status and next steps of the interface.

const entry = {
  title: "Ma page personnelle",
  summary: "Ta page personnelle : ton prochain créneau, changer de créneau ou annuler.",
  questions: ["Je veux changer de créneau", "Je n’ai plus le lien"],
}

describe("normalizeForSearch", () => {
  it("drops case, accents and repeated spaces, and straightens apostrophes", () => {
    expect(normalizeForSearch("  Créneau   ÉTÉ  ")).toBe("creneau ete")
    expect(normalizeForSearch("l’événement")).toBe("l'evenement")
  })
})

describe("searchTerms", () => {
  it("splits a query into normalised words, none for a blank query", () => {
    expect(searchTerms("  Changer   Créneau ")).toEqual(["changer", "creneau"])
    expect(searchTerms("   ")).toEqual([])
  })

  it("drops the French stop words, and shows everything when only stop words remain", () => {
    expect(searchTerms("comment supprimer un membre")).toEqual(["supprimer", "membre"])
    expect(searchTerms("l'événement de la semaine")).toEqual(["evenement", "semaine"])
    expect(searchTerms("le la les")).toEqual([])
    expect(searchTerms("qu'est-ce que")).toEqual([])
  })
})

describe("stemForSearch", () => {
  it("brings plurals and common endings together, keeping at least four letters", () => {
    expect(stemForSearch("rappels")).toBe("rappel")
    expect(stemForSearch("supprimer")).toBe("supprim")
    expect(stemForSearch("supprimé")).toBe("supprim")
    expect(stemForSearch("suppression")).toBe("supprim")
    expect(stemForSearch("effacement")).toBe("effac")
    expect(stemForSearch("page")).toBe("page")
    expect(stemForSearch("abc")).toBe("abc")
  })

  it("maps the required verb and noun families together", () => {
    const stems = (words: string[]) => new Set(words.map((word) => stemForSearch(word)))
    expect(stems(["confirme", "confirmee", "confirmer"])).toEqual(new Set(["confirm"]))
    expect(stems(["inscription", "inscrire", "inscrit"])).toEqual(new Set(["inscri"]))
    expect(stems(["rappel", "rappels"])).toEqual(new Set(["rappel"]))
    expect(stems(["supprimer", "suppression", "supprime"])).toEqual(new Set(["supprim"]))
  })
})

describe("searchTermMatchesWord", () => {
  it("matches a word, its plural, a prefix, one typo and a synonym on the title, headings and summary", () => {
    expect(searchTermMatchesWord("rappel", "rappel")).toBe(true)
    expect(searchTermMatchesWord("rappel", "rappels")).toBe(true)
    expect(searchTermMatchesWord("inscri", "inscription")).toBe(true)
    expect(searchTermMatchesWord("inscripton", "inscription")).toBe(true)
    expect(searchTermMatchesWord("membre", "benevole")).toBe(true)
    expect(searchTermMatchesWord("csv", "csx")).toBe(false)
    expect(isOneTypoApart("inscripton", "inscription")).toBe(true)
    expect(isOneTypoApart("inscription", "inscripton")).toBe(true)
    expect(isOneTypoApart("rappel", "rapel")).toBe(true)
    expect(isOneTypoApart("rappel", "raplpe")).toBe(false)
  })
})

describe("matchesDocQuery", () => {
  it("matches everything on an empty or blank query", () => {
    expect(matchesDocQuery(entry, "")).toBe(true)
    expect(matchesDocQuery(entry, "   ")).toBe(true)
  })

  it("ignores accents and case, both ways", () => {
    expect(matchesDocQuery(entry, "CRENEAU")).toBe(true)
    expect(matchesDocQuery({ ...entry, summary: "creneau" }, "créneau")).toBe(true)
  })

  it("needs every word, anywhere in the title, the summary or a heading", () => {
    expect(matchesDocQuery(entry, "page annuler")).toBe(true)
    expect(matchesDocQuery(entry, "page rembourser")).toBe(false)
    expect(matchesDocQuery(entry, "lien")).toBe(true)
    expect(matchesDocQuery({ ...entry, sections: [{ text: "Le jour J", id: "le-jour-j" }] }, "jour")).toBe(true)
  })

  it("matches the start of a word as the reader types it", () => {
    expect(matchesDocQuery(entry, "chang cren")).toBe(true)
  })

  it("drops the stop words of a mixed query, and shows everything when only them remain", () => {
    expect(matchesDocQuery(entry, "le lien")).toBe(true)
    expect(matchesDocQuery(entry, "le téléphone")).toBe(false)
    // « le » alone no longer matches literally: it is a blank-like query (#1319).
    expect(matchesDocQuery(entry, "le")).toBe(true)
  })

  it("keeps synonyms and one typo on the title, the headings and the summary", () => {
    expect(matchesDocQuery({ ...entry, sections: [] }, "membre")).toBe(false)
    expect(matchesDocQuery({ ...entry, title: "Les bénévoles", sections: [] }, "membre")).toBe(true)
    expect(matchesDocQuery({ ...entry, summary: "Une question des bénévoles.", sections: [] }, "membre")).toBe(true)
    expect(matchesDocQuery({ ...entry, sections: [{ text: "Côté bénévole", id: "cote-benevole" }] }, "membre")).toBe(true)
    expect(matchesDocQuery({ ...entry, title: "Inscription", sections: [] }, "inscripton")).toBe(true)
    expect(matchesDocQuery({ ...entry, summary: "Une inscription.", sections: [] }, "inscripton")).toBe(true)
    expect(matchesDocQuery({ ...entry, sections: [{ text: "Inscription", id: "inscription" }] }, "inscripton")).toBe(true)
  })
})

describe("docUnitQuestions", () => {
  it("returns the « ### » headings as plain text, outside fenced code", () => {
    const md = [
      "## Questions fréquentes",
      "",
      "### Je veux **changer** de [créneau](choisir.md#x)",
      "Texte.",
      "```",
      "### pas un titre",
      "```",
      "#### Trop profond",
      "### Où sont mes `données` ? ###",
    ].join("\n")
    expect(docUnitQuestions(md)).toEqual(["Je veux changer de créneau", "Où sont mes données ?"])
  })

  it("finds the volunteers' questions in the real units", () => {
    const unit = readDocUnits().find((u) => u.slug === "rappels")!
    expect(docUnitQuestions(unit.body)).toContain("Je ne veux pas oublier mon créneau le jour J")
  })
})

describe("docUnitQuestionAnchors", () => {
  it("gives each question the id of its heading, counting every heading as the page does", () => {
    const md = ["## Questions", "### Questions", "### Où sont mes **données** ?", "```", "### pas un titre", "```", "### Où sont mes données ?"].join("\n")
    expect(docUnitQuestionAnchors(md)).toEqual([
      { text: "Questions", id: "questions-2" },
      { text: "Où sont mes données ?", id: "ou-sont-mes-donnees" },
      { text: "Où sont mes données ?", id: "ou-sont-mes-donnees-2" },
    ])
  })

  // The filter links a question to its heading: the id must be the one the unit's page renders.
  it("matches the ids of the « ### » headings each real unit renders", () => {
    for (const unit of readDocUnits()) {
      const rendered = [...renderDocUnit(unit).matchAll(/<h3 id="([^"]+)"/g)].map((m) => m[1])
      expect(docUnitQuestionAnchors(unit.body).map((q) => q.id), unit.slug).toEqual(rendered)
    }
  })
})

describe("docUnitSections", () => {
  it("returns the « ## » and « ### » headings as plain text, with their ids, outside fenced code", () => {
    const md = [
      "# Titre de la page",
      "## Les **créneaux**",
      "### Où sont mes [données](donnees.md) ?",
      "## Une ![capture](capture.png) section",
      "```",
      "## pas un titre",
      "```",
      "#### Trop profond",
      '## <a id="ancien-ancre"></a>Une section avec un ancien ancre',
    ].join("\n")
    expect(docUnitSections(md)).toEqual([
      { text: "Les créneaux", id: "les-creneaux" },
      { text: "Où sont mes données ?", id: "ou-sont-mes-donnees" },
      { text: "Une capture section", id: "une-capture-section" },
      { text: "Une section avec un ancien ancre", id: "une-section-avec-un-ancien-ancre" },
    ])
  })

  // The filter links a section to its heading: every id must be the one the unit's page renders.
  it("matches the ids of every « ## » and « ### » heading each real unit renders", () => {
    for (const unit of readDocUnits()) {
      const rendered = [...renderDocUnit(unit).matchAll(/<h([23]) id="([^"]+)"/g)].map((m) => m[2])
      expect(docUnitSections(unit.body).map((section) => section.id), unit.slug).toEqual(rendered)
    }
  })
})

describe("docUnitWords", () => {
  it("keeps the link text, drops images and their alt text, code fences and HTML tags", () => {
    const md = [
      "## Une **section**",
      "Voir [le guide](https://exemple.test) et ![une capture](capture.png).",
      "```",
      "mot cache",
      "```",
      "<div>Balise</div>",
    ].join("\n")
    const words = docUnitWords(md)
    expect(words).toEqual(["balise", "guide", "section"])
    for (const dropped of ["capture", "mot", "cache", "div", "img"]) expect(words).not.toContain(dropped)
  })

  it("deduplicates, sorts and normalises the real units' body words", () => {
    const unit = readDocUnits().find((u) => u.slug === "rappels")!
    const words = docUnitWords(unit.body)
    expect(words).toContain("rappel")
    expect(words).toContain("creneau")
    expect(new Set(words).size).toBe(words.length)
    expect([...words].sort()).toEqual(words)
  })
})

describe("matchingDocQuestions", () => {
  const unit = {
    title: "Rappels et changements de créneau",
    summary: "Les rappels envoyés avant chaque journée de créneaux.",
    questions: ["Recevoir les rappels sur ton téléphone", "Je ne veux pas oublier mon créneau le jour J", "Je veux oublier le téléphone"],
  }

  it("shows no question when the title or the summary already matches", () => {
    expect(matchingDocQuestions(unit, "rappels")).toEqual([])
    expect(matchingDocQuestions(unit, "journée")).toEqual([])
  })

  it("shows the questions that hold every word when the unit is found by them", () => {
    expect(matchingDocQuestions(unit, "jour J oublier")).toEqual(["Je ne veux pas oublier mon créneau le jour J"])
    expect(matchingDocQuestions(unit, "telephone recevoir")).toEqual(["Recevoir les rappels sur ton téléphone"])
  })

  it("ignores accents and case", () => {
    expect(matchingDocQuestions(unit, "TÉLÉPHONE")).toEqual(["Recevoir les rappels sur ton téléphone", "Je veux oublier le téléphone"])
    expect(matchingDocQuestions(unit, "Oublier")).toEqual(["Je ne veux pas oublier mon créneau le jour J", "Je veux oublier le téléphone"])
  })

  it("shows two questions at most, in page order, and none for a blank query or a word no question holds", () => {
    const many = { ...unit, questions: ["Question une", "Question deux", "Question trois"] }
    expect(matchingDocQuestions(many, "question")).toEqual(["Question une", "Question deux"])
    expect(matchingDocQuestions(many, "question", 1)).toEqual(["Question une"])
    expect(matchingDocQuestions(many, "  ")).toEqual([])
    expect(matchingDocQuestions(many, "xyz")).toEqual([])
  })
})

describe("matchingDocQuestionLinks", () => {
  const entry = {
    title: "Rappels",
    summary: "Avant chaque journée.",
    questions: ["Question une", "Question deux", "Question trois"],
    questionIds: ["question-une", "question-deux", "question-trois"],
  }

  it("pairs each matching question with its heading id, two at most", () => {
    expect(matchingDocQuestionLinks(entry, "question")).toEqual([
      { text: "Question une", id: "question-une" },
      { text: "Question deux", id: "question-deux" },
    ])
    expect(matchingDocQuestionLinks(entry, "rappels")).toEqual([])
  })

  it("leaves out a question without an id (never a link to « #undefined »), and fills the cap with the next one", () => {
    expect(matchingDocQuestionLinks({ ...entry, questionIds: ["", "question-deux"] }, "question")).toEqual([{ text: "Question deux", id: "question-deux" }])
    expect(matchingDocQuestionLinks({ ...entry, questionIds: ["question-une"] }, "question")).toEqual([{ text: "Question une", id: "question-une" }])
  })
})

describe("matchingDocSections", () => {
  const entry = {
    title: "Une fiche",
    summary: "Un résumé.",
    questions: [],
    sections: [
      { text: "Les rappels automatiques", id: "les-rappels-automatiques" },
      { text: "Recevoir les rappels sur ton téléphone", id: "recevoir-les-rappels" },
      { text: "Notifications de modification", id: "notifications-de-modification" },
    ],
  }

  it("lists the « ## » and « ### » headings that hold every word, two at most, in page order", () => {
    expect(matchingDocSections(entry, "rappels")).toEqual([
      { text: "Les rappels automatiques", id: "les-rappels-automatiques" },
      { text: "Recevoir les rappels sur ton téléphone", id: "recevoir-les-rappels" },
    ])
    expect(matchingDocSections(entry, "rappels", 1)).toEqual([{ text: "Les rappels automatiques", id: "les-rappels-automatiques" }])
    expect(matchingDocSections(entry, "telephone")).toEqual([{ text: "Recevoir les rappels sur ton téléphone", id: "recevoir-les-rappels" }])
  })

  it("shows none when the title or the summary already holds every word, nor for a blank query", () => {
    const titled = { ...entry, title: "Rappels", summary: "Avant chaque journée." }
    expect(matchingDocSections(titled, "rappel journée")).toEqual([])
    expect(matchingDocSections(entry, "  ")).toEqual([])
    expect(matchingDocSections(entry, "le la")).toEqual([])
  })

  it("keeps only headings with an id, and never links the same text twice", () => {
    const twice = {
      ...entry,
      sections: [
        { text: "Les rappels", id: "les-rappels" },
        { text: "Les rappels", id: "les-rappels-2" },
        { text: "Rappels sans id", id: "" },
      ],
    }
    expect(matchingDocSectionLinks({ ...twice, title: "Une fiche", summary: "Un résumé." }, "rappels")).toEqual([{ text: "Les rappels", id: "les-rappels" }])
  })
})

describe("docFilterNextSteps", () => {
  const faq = `#${DOC_FAQ_HEADING_ID}`

  it("on the volunteers' guide, says « tu » and leads to the guide's questions", () => {
    const { advice, lead, steps } = docFilterNextSteps("benevole")
    expect(advice).toMatch(/^Essaie un autre mot\b/)
    expect(lead).toMatch(/\bta réponse\b/)
    expect(steps).toEqual([{ href: faq, label: "Questions fréquentes" }])
  })

  it("on the organisers' guide, says « vous » and adds the help unit", () => {
    const { advice, lead, steps } = docFilterNextSteps("admin")
    expect(advice).toMatch(/^Essayez un autre mot\b/)
    expect(lead).toMatch(/\bvotre réponse\b/)
    expect(steps.map((s) => s.href)).toEqual([faq, `/doc/${DOC_HELP_UNIT_SLUG}`])
  })

  it("on /doc, stays neutral and leads to both guides' questions and the help unit", () => {
    const { advice, lead, steps } = docFilterNextSteps()
    for (const text of [advice, lead]) expect(text).not.toMatch(/(?<![\w-])(tu|ta|ton|vous|votre|essaie|essayez)\b/i)
    expect(steps.map((s) => s.href)).toEqual([`/doc/benevole${faq}`, `/doc/admin${faq}`, `/doc/${DOC_HELP_UNIT_SLUG}`])
  })

  it("leads to a help unit that exists, for organisers, and never uses a forbidden separator", () => {
    const help = readDocUnits().find((u) => u.slug === DOC_HELP_UNIT_SLUG)
    expect(help?.roles).toContain("admin")
    for (const role of ["admin", "benevole", undefined] as const) {
      const { advice, lead, steps } = docFilterNextSteps(role)
      for (const text of [advice, lead, ...steps.flatMap((s) => [s.label, s.note ?? ""])]) expect(text).not.toMatch(/[·—]/)
    }
  })
})

describe("docFilterStatus", () => {
  it("says the result in a full sentence, with the query", () => {
    expect(docFilterStatus("lien", 7, 50)).toBe("7 fiches sur 50 correspondent à « lien ».")
    expect(docFilterStatus("lien", 1, 50)).toBe("1 fiche sur 50 correspond à « lien ».")
    expect(docFilterStatus(" xyz ", 0, 50)).toBe("Aucune fiche pour « xyz ».")
  })

  it("gives the total once the filter is cleared", () => {
    expect(docFilterStatus("", 50, 50)).toBe("Les 50 fiches sont affichées.")
    expect(docFilterStatus("", 1, 1)).toBe("La fiche est affichée.")
  })
})
