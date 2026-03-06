import { View, Text } from 'react-native'
import type { LeaveStatus } from '@/lib/types'

const config: Record<LeaveStatus, { label: string; bg: string; text: string }> = {
  draft:                { label: 'Draft',               bg: '#f3f4f6', text: '#6b7280' },
  pending_replacement:  { label: 'Pending Replacement', bg: '#dbeafe', text: '#1d4ed8' },
  replacement_rejected: { label: 'Repl. Rejected',      bg: '#ffedd5', text: '#c2410c' },
  pending_approval:     { label: 'Pending Approval',    bg: '#fef9c3', text: '#a16207' },
  approved:             { label: 'Approved',            bg: '#dcfce7', text: '#15803d' },
  rejected:             { label: 'Rejected',            bg: '#fee2e2', text: '#dc2626' },
  cancelled:            { label: 'Cancelled',           bg: '#f3f4f6', text: '#9ca3af' },
}

export function StatusBadge({ status }: { status: LeaveStatus }) {
  const c = config[status] ?? { label: status, bg: '#f3f4f6', text: '#6b7280' }
  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: c.bg }}>
      <Text className="text-xs font-medium" style={{ color: c.text }}>{c.label}</Text>
    </View>
  )
}
