import EventForm from "@/components/admin/EventForm"

export default function NewEventPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nouvel événement</h1>
      <EventForm />
    </div>
  )
}
