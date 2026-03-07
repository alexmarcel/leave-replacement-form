import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// POST /api/staff — create a new staff account
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, email, phone, jawatan, department, role, password } = await req.json()

  if (!full_name || !email || !role || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role, phone, jawatan, department },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ id: data.user?.id }, { status: 201 })
}

// PATCH /api/staff — update a staff profile (and optionally reset password)
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, full_name, email, phone, jawatan, department, role, is_active, newPassword } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Update auth user (email and/or password) via admin client
  const adminClient = createAdminClient()
  const authUpdates: { email?: string; password?: string } = {}
  if (email) authUpdates.email = email
  if (newPassword) {
    if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    authUpdates.password = newPassword
  }
  if (Object.keys(authUpdates).length > 0) {
    const { error: authErr } = await adminClient.auth.admin.updateUserById(id, authUpdates)
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  // Update profile row
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name, email, phone, jawatan, department, role, is_active, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
