import { createClient } from '@/lib/supabase/server'
import { LeaveTypesClient } from './leave-types-client'

export default async function LeaveTypesPage() {
  const supabase = await createClient()
  const { data: leaveTypes } = await supabase
    .from('leave_types')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Leave Types</h1>
      <LeaveTypesClient initialTypes={leaveTypes ?? []} />
    </div>
  )
}
