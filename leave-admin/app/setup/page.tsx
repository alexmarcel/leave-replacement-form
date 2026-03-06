import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SetupForm } from './setup-form'

export default async function SetupPage() {
  const supabase = await createClient()

  // Check if any admin already exists — if so, seal this page permanently
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (count && count > 0) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Suspense>
        <SetupForm />
      </Suspense>
    </div>
  )
}
