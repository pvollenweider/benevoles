import EventForm from "@/components/admin/EventForm"
import EventTemplatePicker from "@/components/admin/EventTemplatePicker"
import WizardSteps from "@/components/admin/WizardSteps"
import { wizardHrefs } from "@/lib/event-wizard"

// Step 1 of the three-step creation (#401): the event's information, blank or from a template.
// Created events go on to their shifts with the assistant's indicator; leaving it at any point
// is just using the full interface.
export default function NewEventPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <WizardSteps current={1} eventId={null} />
      <h1 className="text-xl font-bold text-gray-900">Nouvel événement</h1>
      <EventTemplatePicker>
        <EventForm createdHref={(id) => wizardHrefs(id)[2]} />
      </EventTemplatePicker>
    </div>
  )
}
