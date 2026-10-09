import { redirect } from "next/navigation"
import EventForm from "@/components/admin/EventForm"
import { getOrgContext } from "@/lib/auth-guard"
import { orgTimeZone } from "@/lib/time-zone"
import EventTemplatePicker from "@/components/admin/EventTemplatePicker"
import WizardSteps from "@/components/admin/WizardSteps"
import { wizardHrefs } from "@/lib/event-wizard"
import HelpLink from "@/components/admin/HelpLink"

// Step 1 of the three-step creation (#401): the event's information, blank or from a template.
// Created events go on to their shifts with the assistant's indicator; leaving it at any point
// is just using the full interface.
export default async function NewEventPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  // The registration window is typed in the organisation's time zone, as on the edit page.
  const org = await ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } })
  return (
    <div className="max-w-2xl space-y-6">
      <WizardSteps current={1} eventId={null} />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Nouvel événement</h1>
        <HelpLink route="/admin/events/new" />
      </div>
      <EventTemplatePicker>
        <EventForm createdHref={wizardHrefs("{id}")[2]} timeZone={orgTimeZone(org)} />
      </EventTemplatePicker>
    </div>
  )
}
