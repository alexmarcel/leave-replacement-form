import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/approvers — returns all active approvers (for reassign dropdown)
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: approvers } = await supabase
    .from('profiles')
    .select('id, full_name, role, jawatan')
    .eq('role', 'approver')
    .eq('is_active', true)
    .order('full_name')

  return NextResponse.json({ approvers: approvers ?? [] })
}
