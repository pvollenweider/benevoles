import { ACTION_PREFIXES, ACTOR_TYPE_LABELS, ENTITY_LABELS } from "@/lib/event-log-explorer"

export default function FilterBar(props: {
  entityType: string; onEntityType: (v: string) => void
  actorType: string; onActorType: (v: string) => void
  action: string; onAction: (v: string) => void
  since: string; onSince: (v: string) => void
  until: string; onUntil: (v: string) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Field label="Type d'élément">
        <select className="input" value={props.entityType} onChange={(e) => props.onEntityType(e.target.value)}>
          <option value="">Tous</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Qui">
        <select className="input" value={props.actorType} onChange={(e) => props.onActorType(e.target.value)}>
          <option value="">Tous</option>
          {Object.entries(ACTOR_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Action">
        <select className="input" value={props.action} onChange={(e) => props.onAction(e.target.value)}>
          {ACTION_PREFIXES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="Depuis">
        <input type="date" className="input" value={props.since} onChange={(e) => props.onSince(e.target.value)} />
      </Field>
      <Field label="Jusqu'à">
        <input type="date" className="input" value={props.until} onChange={(e) => props.onUntil(e.target.value)} />
      </Field>
    </div>
  )
}

// `htmlFor` must point at the actual control, not a wrapping <div> — that only works when
// `for` is absent (implicit nesting). With `for` present but pointing at a non-labelable
// element, no control gets an accessible name at all. Implicit nesting (label wraps control
// directly, no `for`/`id`) is correct here since every caller passes exactly one form control.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <div>{children}</div>
    </label>
  )
}
