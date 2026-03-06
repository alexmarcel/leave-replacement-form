'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function SettingsClient({ initialAllowMultiple }: { initialAllowMultiple: boolean }) {
  const [allowMultiple, setAllowMultiple] = useState(initialAllowMultiple)
  const [saving, setSaving] = useState(false)

  async function handleToggle(value: boolean) {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('system_settings')
      .update({ allow_multiple_replacements: value, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) {
      toast.error(error.message)
    } else {
      setAllowMultiple(value)
      toast.success(`Replacement policy set to ${value ? 'One-to-Many' : 'One-to-One'}`)
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Replacement Policy</CardTitle>
        <CardDescription>
          Controls how the replacement picker works in the mobile app when staff apply for leave.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-medium text-sm">Allow One-to-Many Replacements</p>
            <p className="text-sm text-muted-foreground mt-1">
              {allowMultiple
                ? 'One-to-Many mode — a staff member can cover multiple people simultaneously. They are only excluded from the replacement picker if they themselves are on approved leave.'
                : 'One-to-One mode — a staff member can only be nominated as replacement for one active leave request at a time. If they are already covering someone during the same period, they will not appear in the picker.'}
            </p>
          </div>
          <Switch
            checked={allowMultiple}
            onCheckedChange={handleToggle}
            disabled={saving}
            className="shrink-0 mt-0.5"
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className={`rounded-lg border p-4 ${!allowMultiple ? 'border-primary bg-primary/5' : 'border-muted'}`}>
            <p className="font-semibold">One-to-One <span className="text-xs font-normal text-muted-foreground">(current)</span></p>
            <p className="text-muted-foreground mt-1 text-xs">
              Staff B can only cover one person at a time. Stricter — ensures a replacement is truly available.
            </p>
          </div>
          <div className={`rounded-lg border p-4 ${allowMultiple ? 'border-primary bg-primary/5' : 'border-muted'}`}>
            <p className="font-semibold">One-to-Many <span className="text-xs font-normal text-muted-foreground">{allowMultiple ? '(current)' : ''}</span></p>
            <p className="text-muted-foreground mt-1 text-xs">
              Staff B can cover multiple people at once. More flexible — useful for small teams.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
