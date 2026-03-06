import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action, notes } = await req.json()

  const statusMap: Record<string, { status: string; approver_response?: string }> = {
    approve: { status: 'approved',   approver_response: 'approved' },
    reject:  { status: 'rejected',   approver_response: 'rejected' },
    cancel:  { status: 'cancelled' },
  }

  const update = statusMap[action]
  if (!update) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const payload: Record<string, string> = { status: update.status }
  if (update.approver_response) payload.approver_response = update.approver_response
  if (notes) payload.approver_notes = notes

  const { error } = await supabase
    .from('leave_requests')
    .update(payload)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
