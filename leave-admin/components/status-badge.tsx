import { Badge } from '@/components/ui/badge'
import type { LeaveStatus } from '@/lib/types'

const statusConfig: Record<LeaveStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft:                { label: 'Draft',               variant: 'outline',      className: 'border-gray-400 text-gray-600' },
  pending_replacement:  { label: 'Pending Replacement', variant: 'secondary',    className: 'bg-blue-100 text-blue-800 border-blue-200' },
  replacement_rejected: { label: 'Replacement Rejected',variant: 'destructive',  className: 'bg-orange-100 text-orange-800 border-orange-200' },
  pending_approval:     { label: 'Pending Approval',    variant: 'secondary',    className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  approved:             { label: 'Approved',            variant: 'default',      className: 'bg-green-100 text-green-800 border-green-200' },
  rejected:             { label: 'Rejected',            variant: 'destructive',  className: 'bg-red-100 text-red-800 border-red-200' },
  cancelled:            { label: 'Cancelled',           variant: 'outline',      className: 'border-gray-300 text-gray-500' },
}

export function StatusBadge({ status }: { status: LeaveStatus }) {
  const cfg = statusConfig[status] ?? { label: status, variant: 'outline' as const, className: '' }
  return (
    <Badge variant={cfg.variant} className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  )
}
