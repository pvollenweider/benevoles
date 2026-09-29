// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { onboardingProgress, type OnboardingStep } from "@/lib/onboarding"
import DismissOnboardingButton from "./DismissOnboardingButton"

/**
 * First-run checklist (#369), shown at the top of the events list and the dashboard until the
 * required steps are done or an admin hides it. An ordered list: the order is the point.
 */
export default function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const { done, total, next } = onboardingProgress(steps)
  return (
    <section aria-labelledby="onboarding-heading" className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="onboarding-heading" className="text-base font-semibold text-gray-900">Premiers pas</h2>
          <p className="text-sm text-gray-600">
            {done} étape{done > 1 ? "s" : ""} sur {total} terminée{done > 1 ? "s" : ""}. Les étapes facultatives peuvent attendre.
          </p>
        </div>
        <DismissOnboardingButton />
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const isNext = next?.id === step.id
          return (
            <li key={step.id} className={`flex gap-3 rounded-xl p-3 ${isNext ? "bg-blue-50" : ""}`}>
              <span
                aria-hidden="true"
                className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                  step.done ? "bg-green-700 text-white" : "border border-gray-500 text-gray-700"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm">
                  <Link
                    href={step.href}
                    {...(step.external ? { target: "_blank", rel: "noopener" } : {})}
                    aria-current={isNext ? "step" : undefined}
                    className={`font-medium underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      step.done ? "text-gray-600" : "text-blue-700 hover:text-blue-900"
                    }`}
                  >
                    {step.label}
                    {step.external && <span className="sr-only"> (ouvre dans un nouvel onglet)</span>}
                  </Link>
                  <span className="text-gray-600">
                    {" "}— {step.done ? "fait" : step.optional ? "facultatif" : isNext ? "prochaine étape" : "à faire"}
                  </span>
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{step.hint}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
