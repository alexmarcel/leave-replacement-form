import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Double-check: refuse if an admin already exists
  const supabase = await createClient()
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (count && count > 0) {
    return NextResponse.json({ error: 'Setup already complete.' }, { status: 403 })
  }

  const { full_name, email, password } = await req.json()

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Create the auth user with role=admin in metadata
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin' },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // The handle_new_user trigger creates the profile automatically.
  // Ensure the role is set to 'admin' (trigger reads from metadata, but be explicit).
  await adminClient
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', data.user.id)

  return NextResponse.json({ ok: true }, { status: 201 })
}
