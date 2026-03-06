'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FileText,
  Tag,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',           label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/dashboard/staff',     label: 'Staff',          icon: Users },
  { href: '/dashboard/requests',  label: 'Leave Requests', icon: FileText },
  { href: '/dashboard/leave-types', label: 'Leave Types',  icon: Tag },
  { href: '/dashboard/holidays',  label: 'Public Holidays',icon: CalendarDays },
  { href: '/dashboard/settings',  label: 'Settings',       icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col border-r bg-background">
      <div className="px-6 py-5 border-b">
        <p className="font-semibold text-sm tracking-wide text-muted-foreground uppercase">Leave Admin</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
