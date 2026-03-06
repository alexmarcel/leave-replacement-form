import { createClient } from '@/lib/supabase/server'
import { StaffTable } from './staff-table'

export default async function StaffPage() {
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff</h1>
      </div>
      <StaffTable initialStaff={staff ?? []} />
    </div>
  )
}
