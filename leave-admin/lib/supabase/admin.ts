import { createClient } from '@supabase/supabase-js'

// Service-role client — only use in Route Handlers, never in client components.
// Has full DB access, bypasses RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
