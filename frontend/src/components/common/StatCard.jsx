export function StatCard({ title, value }) {
  return (
    <div className="border border-neutral-900 rounded p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-light text-neutral-200">{value}</div>
    </div>
  )
}
