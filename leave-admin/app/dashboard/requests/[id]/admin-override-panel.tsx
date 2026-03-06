'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { LeaveStatus } from '@/lib/types'
import { ShieldAlert, UserRoundCog } from 'lucide-react'

interface Approver {
  id: string
  full_name: string
  role: string
  jawatan: string | null
}

interface Props {
  requestId: string
  currentStatus: LeaveStatus
  currentApproverId: string | null
}

export function AdminOverridePanel({ requestId, currentStatus, currentApproverId }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  // Reassign state
  const [reassignOpen, setReassignOpen] = useState(false)
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [loadingApprovers, setLoadingApprovers] = useState(false)
  const [newApproverId, setNewApproverId] = useState('')
  const [reassignNotes, setReassignNotes] = useState('')

  async function override(action: 'approve' | 'reject' | 'cancel') {
    setLoading(action)
    const res = await fetch(`/api/requests/${requestId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Override failed')
    } else {
      toast.success('Request updated')
      router.refresh()
    }
    setLoading(null)
  }

  async function openReassign() {
    setReassignOpen(true)
    setLoadingApprovers(true)
    const res = await fetch('/api/approvers')
    const data = await res.json()
    // Exclude the current approver
    setApprovers((data.approvers ?? []).filter((a: Approver) => a.id !== currentApproverId))
    setLoadingApprovers(false)
  }

  async function handleReassign() {
    if (!newApproverId) { toast.error('Select an approver'); return }
    setLoading('reassign')
    const res = await fetch(`/api/requests/${requestId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_approver_id: newApproverId, notes: reassignNotes }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Reassignment failed')
    } else {
      toast.success('Approver reassigned')
      router.refresh()
    }
    setLoading(null)
    setReassignOpen(false)
  }

  return (
    <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
          Admin Override
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Force a status change on this request. This bypasses the normal workflow and is recorded in the audit log.
        </p>
        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea
            placeholder="Reason for override…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {currentStatus !== 'approved' && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={!!loading}
              onClick={() => override('approve')}
            >
              {loading === 'approve' ? 'Approving…' : 'Force Approve'}
            </Button>
          )}
          {currentStatus !== 'rejected' && (
            <Button
              size="sm"
              variant="destructive"
              disabled={!!loading}
              onClick={() => override('reject')}
            >
              {loading === 'reject' ? 'Rejecting…' : 'Force Reject'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!!loading}
            onClick={() => override('cancel')}
          >
            {loading === 'cancel' ? 'Cancelling…' : 'Cancel Request'}
          </Button>
        </div>

        {/* Reassign Approver — shown when an approver is assigned */}
        {currentApproverId && (
          <>
            <Separator className="border-amber-300" />
            {!reassignOpen ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!!loading}
                onClick={openReassign}
              >
                <UserRoundCog className="h-4 w-4" />
                Reassign Approver
              </Button>
            ) : (
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserRoundCog className="h-4 w-4" />
                  Reassign Approver
                </p>
                <p className="text-xs text-muted-foreground">
                  Redirect this request to a different approver. The previous approver will no longer see it.
                  This is recorded in the audit log.
                </p>
                <div className="space-y-1.5">
                  <Label>New Approver *</Label>
                  {loadingApprovers ? (
                    <p className="text-sm text-muted-foreground">Loading approvers…</p>
                  ) : approvers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No other approvers available.</p>
                  ) : (
                    <Select value={newApproverId} onValueChange={setNewApproverId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select approver…" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvers.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name}
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({a.role}{a.jawatan ? ` · ${a.jawatan}` : ''})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Reason (optional)</Label>
                  <Textarea
                    placeholder="e.g. Original approver is on leave…"
                    value={reassignNotes}
                    onChange={e => setReassignNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!!loading || loadingApprovers || approvers.length === 0}
                    onClick={handleReassign}
                  >
                    {loading === 'reassign' ? 'Reassigning…' : 'Confirm Reassign'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setReassignOpen(false); setNewApproverId(''); setReassignNotes('') }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
