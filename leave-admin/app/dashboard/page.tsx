import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, UserCheck, Clock, CheckCircle, ShieldCheck } from 'lucide-react'
import { RecentRequestsCard } from './recent-requests-card'
import Link from 'next/link'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalStaff },
    { count: totalApprovers },
    { data: onLeaveToday },
    { count: pendingApproval },
    { count: totalApproved },
    { data: recentRequests },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['staff', 'approver', 'admin']).eq('is_active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'approver').eq('is_active', true),
    supabase
      .from('leave_requests')
      .select(`
        id, start_date, end_date, total_days,
        requester:profiles!requester_id(full_name, department, jawatan),
        replacement:profiles!replacement_id(full_name),
        leave_type:leave_types!leave_type_id(name, color_hex)
      `)
      .eq('status', 'approved')
      .lte('start_date', new Date().toISOString().slice(0, 10))
      .gte('end_date', new Date().toISOString().slice(0, 10)),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase
      .from('leave_requests')
      .select(`
        id, status, start_date, end_date, total_days, created_at,
        requester:profiles!requester_id(full_name, department),
        leave_type:leave_types!leave_type_id(name, color_hex)
      `)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const stats = [
    { label: 'Active Staff',     value: totalStaff ?? 0,           icon: Users,        color: 'text-blue-600' },
    { label: 'Active Approvers', value: totalApprovers ?? 0,        icon: ShieldCheck,  color: 'text-purple-600' },
    { label: 'On Leave Today',   value: onLeaveToday?.length ?? 0,  icon: UserCheck,    color: 'text-orange-600' },
    { label: 'Pending Approval', value: pendingApproval ?? 0,       icon: Clock,        color: 'text-yellow-600' },
    { label: 'Total Approved',   value: totalApproved ?? 0,         icon: CheckCircle,  color: 'text-green-600' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* On Leave Today */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">On Leave Today</CardTitle>
          </CardHeader>
          <CardContent>
            {!onLeaveToday?.length ? (
              <p className="text-sm text-muted-foreground">No staff on leave today.</p>
            ) : (
              <ul className="divide-y">
                {(onLeaveToday as any[]).map(s => {
                  const req = s.requester
                  const lt = s.leave_type
                  const repl = s.replacement
                  return (
                    <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                      <Link href={`/dashboard/requests/${s.id}`} className="flex items-start justify-between gap-3 hover:opacity-80">
                        <Badge style={{ backgroundColor: lt?.color_hex ?? '#888' }} className="text-white text-xs shrink-0 mr-4 mt-0.5">
                          {lt?.name}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{req?.full_name ?? '—'}</p>
                          <p className="text-muted-foreground text-xs">
                            {req?.jawatan ?? ''}{req?.department ? ` · ${req.department}` : ''}
                          </p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {fmtDate(s.start_date)} to {fmtDate(s.end_date)} · {s.total_days} day{s.total_days !== 1 ? 's' : ''}
                          </p>
                          {repl?.full_name && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                              Replacement: {repl.full_name}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <RecentRequestsCard requests={recentRequests ?? []} />
      </div>
    </div>
  )
}
