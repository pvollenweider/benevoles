// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

export const orgRegistrationsFixture = {
  id: "video-org-registrations",
  slug: "formation-parc",
  name: "Association du Parc",
  email: "lea.rochat@example.org",
  events: [
    { slug: "fete-du-parc", title: "Fête du parc", role: "Accueil" },
    { slug: "marche-des-voisins", title: "Marché des voisins", role: "Buvette" },
  ],
}

// Synthetic fixed token for the personal page tour in the isolated local DB.
export const personalTourOrgToken = "demo-personal-tour-organisation-link-v43-01"
