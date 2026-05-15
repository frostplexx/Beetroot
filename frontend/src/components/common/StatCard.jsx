import { Card, CardContent } from '@/components/ui/card'

export function StatCard({ title, value }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
        <div className="text-2xl font-light text-foreground">{value}</div>
      </CardContent>
    </Card>
  )
}
