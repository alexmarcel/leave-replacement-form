import { createClient } from '@/lib/supabase/server'
import { HolidaysClient } from './holidays-client'

export default async function HolidaysPage() {
  const supabase = await createClient()
  const { data: holidays } = await supabase
    .from('public_holidays')
    .select('*')
    .order('date')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Public Holidays</h1>
      <HolidaysClient initialHolidays={holidays ?? []} />
    </div>
  )
}
