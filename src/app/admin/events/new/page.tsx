import EventForm from "@/components/admin/EventForm"
import EventTemplatePicker from "@/components/admin/EventTemplatePicker"

export default function NewEventPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nouvel événement</h1>
      <EventTemplatePicker>
        <EventForm />
      </EventTemplatePicker>
    </div>
  )
}
