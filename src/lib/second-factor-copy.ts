// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** The second factor's messages (pentest F6), shared by the API routes and the pages. */
export const SECOND_FACTOR_MESSAGES = {
  invalidCode: "Code incorrect ou déjà utilisé. Vérifiez que l'heure de votre téléphone est juste, puis saisissez le code suivant.",
  enrolmentExpired: "Ce code QR a expiré. Affichez-en un nouveau, supprimez l'ancienne entrée de ce site dans votre application, puis scannez le nouveau code.",
  alreadyEnrolled: "La double authentification est déjà activée sur ce compte. Rechargez la page.",
  tooManyAttempts: "Trop de codes incorrects. Réessayez dans un quart d'heure.",
  unavailable: "La double authentification ne peut pas être activée : la clé de chiffrement du serveur (TOKEN_ENCRYPTION_KEY) n'est pas configurée.",
  sessionNotUpdated: "Le code est bon, mais la session n'a pas pu être mise à jour. Rechargez la page et réessayez.",
} as const
