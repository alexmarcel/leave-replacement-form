import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('id', 1)
    .single()

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsClient initialAllowMultiple={settings?.allow_multiple_replacements ?? false} />
    </div>
  )
}
