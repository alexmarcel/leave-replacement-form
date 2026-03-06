import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { new_approver_id, notes } = await req.json()

  if (!new_approver_id) return NextResponse.json({ error: 'new_approver_id is required' }, { status: 400 })

  // Verify the new approver exists and has an eligible role
  const { data: newApprover } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', new_approver_id)
    .single()

  if (!newApprover || !['approver', 'admin'].includes(newApprover.role) || !newApprover.is_active) {
    return NextResponse.json({ error: 'Invalid approver selected' }, { status: 400 })
  }

  // Fetch the current request to get old approver name for the audit note
  const { data: request } = await supabase
    .from('leave_requests')
    .select('approver_id, status, approver:profiles!approver_id(full_name)')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Update the approver_id on the leave request
  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({ approver_id: new_approver_id })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  // Manually insert an audit log entry — reassignment doesn't change status
  // so the trigger won't fire. We record it as a note on the current status.
  const oldApproverName = (request.approver as any)?.full_name ?? 'unknown'
  const auditNote = [
    `Approver reassigned from ${oldApproverName} to ${newApprover.full_name} by admin.`,
    notes ? `Reason: ${notes}` : '',
  ].filter(Boolean).join(' ')

  await supabase.from('leave_audit_log').insert({
    leave_request_id: id,
    changed_by: user.id,
    old_status: request.status,
    new_status: request.status, // status unchanged
    notes: auditNote,
  })

  return NextResponse.json({ ok: true })
}
