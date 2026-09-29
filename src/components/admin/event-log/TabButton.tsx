import type { Tab } from "@/lib/event-log-explorer"

// Arrow/Home/End handling lives on the parent role="tablist" (one listener, no synthetic event
// dispatch needed to activate the next tab — see the tablist's onKeyDown above).
export default function TabButton({ id, active, onClick, children }: { id: Tab; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  )
}
