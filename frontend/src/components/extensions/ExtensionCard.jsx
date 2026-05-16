import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

export function ExtensionCard({ extension, onSettingsClick, onUninstall, onRefresh }) {
  const [enabled, setEnabled] = useState(extension.enabled)
  const [toggling, setToggling] = useState(false)

  const toggleEnabled = async () => {
    setToggling(true)
    try {
      const response = await fetch(`/api/extensions/${extension.id}/enable`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled })
      })

      if (response.ok) {
        setEnabled(!enabled)
      } else {
        alert('Failed to toggle extension')
      }
    } catch (error) {
      console.error('Failed to toggle extension:', error)
      alert('Failed to toggle extension')
    } finally {
      setToggling(false)
    }
  }

  const displayName = extension.manifest.displayName || extension.name
  const types = extension.manifest.type || []

  return (
    <Card className={`transition-opacity ${enabled ? '' : 'opacity-50'}`}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {extension.manifest.icon ? (
              <img
                src={extension.manifest.icon}
                alt={displayName}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-puzzle-piece text-2xl text-rose-500"></i>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{displayName}</CardTitle>
              <CardDescription className="text-xs">
                v{extension.version} • {extension.manifest.author || 'Unknown'}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={toggleEnabled}
            disabled={toggling}
            className="flex-shrink-0"
          />
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-neutral-400 mb-3 line-clamp-2">
          {extension.manifest.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {types.map(type => (
            <Badge key={type} variant="secondary" className="text-xs">
              {type.replace('_', ' ')}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSettingsClick(extension)}
          className="flex-1"
        >
          <i className="fa-solid fa-gear mr-2"></i>
          Settings
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onUninstall(extension)}
        >
          <i className="fa-solid fa-trash"></i>
        </Button>
      </CardFooter>
    </Card>
  )
}
