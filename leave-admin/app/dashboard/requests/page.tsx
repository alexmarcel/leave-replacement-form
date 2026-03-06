import { createClient } from '@/lib/supabase/server'
import { RequestsTable } from './requests-table'
import type { LeaveStatus } from '@/lib/types'

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('leave_requests')
    .select(`
      id, status, start_date, end_date, total_days, created_at, reason,
      requester:profiles!requester_id(id, full_name, department, jawatan),
      replacement:profiles!replacement_id(id, full_name),
      approver:profiles!approver_id(id, full_name),
      leave_type:leave_types!leave_type_id(id, name, color_hex)
    `)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status as LeaveStatus)
  }

  const { data: requests } = await query

  const statusTabs: { value: string; label: string }[] = [
    { value: 'all',                  label: 'All' },
    { value: 'pending_replacement',  label: 'Pending Replacement' },
    { value: 'replacement_rejected', label: 'Repl. Rejected' },
    { value: 'pending_approval',     label: 'Pending Approval' },
    { value: 'approved',             label: 'Approved' },
    { value: 'rejected',             label: 'Rejected' },
    { value: 'cancelled',            label: 'Cancelled' },
    { value: 'draft',                label: 'Draft' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Leave Requests</h1>
      <RequestsTable
        requests={requests ?? []}
        statusTabs={statusTabs}
        activeStatus={status ?? 'all'}
      />
    </div>
  )
}
