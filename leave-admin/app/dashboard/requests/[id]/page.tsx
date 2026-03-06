import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import { AdminOverridePanel } from './admin-override-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { LeaveStatus } from '@/lib/types'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

const FINAL_STATUSES: LeaveStatus[] = ['approved', 'rejected', 'cancelled']

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: request } = await supabase
    .from('leave_requests')
    .select(`
      *,
      requester:profiles!requester_id(*),
      replacement:profiles!replacement_id(*),
      approver:profiles!approver_id(*),
      leave_type:leave_types!leave_type_id(*)
    `)
    .eq('id', id)
    .single()

  if (!request) notFound()

  const { data: auditLog } = await supabase
    .from('leave_audit_log')
    .select(`*, changer:profiles!changed_by(full_name)`)
    .eq('leave_request_id', id)
    .order('created_at', { ascending: true })

  const isFinal = FINAL_STATUSES.includes(request.status as LeaveStatus)

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex justify-between py-1.5 text-sm">
        <span className="text-muted-foreground w-40 shrink-0">{label}</span>
        <span className="font-medium text-right">{value ?? '—'}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/requests" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-2xl font-bold">Request Detail</h1>
        <StatusBadge status={request.status as LeaveStatus} />
      </div>

      {/* Leave Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leave Details</CardTitle></CardHeader>
        <CardContent className="divide-y">
          <InfoRow label="Leave Type" value={
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: request.leave_type?.color_hex }} />
              {request.leave_type?.name}
            </span>
          } />
          <InfoRow label="Dates" value={`${request.start_date} → ${request.end_date}`} />
          <InfoRow label="Working Days" value={`${request.total_days} day${request.total_days !== 1 ? 's' : ''}`} />
          <InfoRow label="Reason" value={request.reason} />
          {request.attachment_url && (
            <InfoRow label="Attachment" value={
              <a href={request.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                View document
              </a>
            } />
          )}
          <InfoRow label="Submitted" value={new Date(request.created_at).toLocaleString()} />
        </CardContent>
      </Card>

      {/* Three Parties */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Staff A */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Staff A — Requester</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-semibold">{request.requester?.full_name}</p>
            <p className="text-muted-foreground">{request.requester?.jawatan}</p>
            <p className="text-muted-foreground">{request.requester?.department}</p>
            <p className="text-xs text-muted-foreground">{request.requester?.email}</p>
          </CardContent>
        </Card>

        {/* Staff B */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Staff B — Replacement</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {request.replacement ? (
              <>
                <p className="font-semibold">{request.replacement.full_name}</p>
                <p className="text-muted-foreground">{request.replacement.jawatan}</p>
                <p className="text-muted-foreground capitalize">
                  Response: <span className="font-medium">{request.replacement_response ?? '—'}</span>
                </p>
                {request.replacement_notes && (
                  <p className="text-xs text-muted-foreground italic">"{request.replacement_notes}"</p>
                )}
                {request.replacement_responded_at && (
                  <p className="text-xs text-muted-foreground">{new Date(request.replacement_responded_at).toLocaleString()}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Not assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Staff C */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Staff C — Approver</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {request.approver ? (
              <>
                <p className="font-semibold">{request.approver.full_name}</p>
                <p className="text-muted-foreground">{request.approver.jawatan}</p>
                <p className="text-muted-foreground capitalize">
                  Response: <span className="font-medium">{request.approver_response ?? '—'}</span>
                </p>
                {request.approver_notes && (
                  <p className="text-xs text-muted-foreground italic">"{request.approver_notes}"</p>
                )}
                {request.approver_responded_at && (
                  <p className="text-xs text-muted-foreground">{new Date(request.approver_responded_at).toLocaleString()}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Not assigned</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin Override */}
      {!isFinal && (
        <AdminOverridePanel
          requestId={request.id}
          currentStatus={request.status as LeaveStatus}
          currentApproverId={request.approver_id}
        />
      )}

      {/* Audit Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Audit Timeline</CardTitle></CardHeader>
        <CardContent>
          {!auditLog?.length ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ol className="relative border-l border-muted ml-3 space-y-4">
              {auditLog.map((entry: any) => (
                <li key={entry.id} className="ml-4">
                  <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
                  <p className="text-sm font-medium">
                    {entry.old_status ? `${entry.old_status} → ` : ''}<span className="font-bold">{entry.new_status}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.changer?.full_name ?? 'System'} · {new Date(entry.created_at).toLocaleString()}
                  </p>
                  {entry.notes && <p className="text-xs text-muted-foreground italic mt-0.5">"{entry.notes}"</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
