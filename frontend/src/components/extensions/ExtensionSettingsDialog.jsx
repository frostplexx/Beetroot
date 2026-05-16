import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

export function ExtensionSettingsDialog({ extension, open, onClose, onSave }) {
  const [settings, setSettings] = useState(extension.settings || {})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/extensions/${extension.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      })

      if (response.ok) {
        onSave()
        onClose()
      } else {
        const error = await response.text()
        alert(`Failed to save settings: ${error}`)
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const manifestSettings = extension.manifest.settings || []

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {extension.manifest.displayName || extension.name} Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-4">
          {manifestSettings.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">
              This extension has no configurable settings
            </p>
          ) : (
            manifestSettings.map(setting => (
              <div key={setting.key} className="space-y-2">
                <Label htmlFor={setting.key} className="flex items-center gap-2">
                  {setting.label}
                  {setting.required && (
                    <span className="text-rose-500 text-xs">*</span>
                  )}
                </Label>

                {setting.description && (
                  <p className="text-sm text-neutral-500">
                    {setting.description}
                  </p>
                )}

                {(setting.type === 'text' || setting.type === 'string') && (
                  <Input
                    id={setting.key}
                    type="text"
                    value={settings[setting.key] || setting.default || ''}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    placeholder={setting.default}
                  />
                )}

                {setting.type === 'password' && (
                  <Input
                    id={setting.key}
                    type="password"
                    value={settings[setting.key] || ''}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    placeholder="••••••••"
                  />
                )}

                {setting.type === 'number' && (
                  <Input
                    id={setting.key}
                    type="number"
                    value={settings[setting.key] || setting.default || 0}
                    onChange={(e) => updateSetting(setting.key, parseFloat(e.target.value))}
                  />
                )}

                {setting.type === 'boolean' && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={setting.key}
                      checked={settings[setting.key] !== undefined ? settings[setting.key] : setting.default}
                      onCheckedChange={(checked) => updateSetting(setting.key, checked)}
                    />
                    <label
                      htmlFor={setting.key}
                      className="text-sm text-neutral-400 cursor-pointer"
                    >
                      Enable
                    </label>
                  </div>
                )}

                {setting.type === 'select' && setting.options && (
                  <Select
                    value={settings[setting.key] || setting.default}
                    onValueChange={(value) => updateSetting(setting.key, value)}
                  >
                    <SelectTrigger id={setting.key}>
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {setting.options.map(option => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
