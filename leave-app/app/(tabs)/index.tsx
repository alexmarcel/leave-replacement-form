import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { formatDate, formatDateShort } from '@/lib/dates'
import { format, addDays } from 'date-fns'
import type { LeaveRequest, LeaveScheduleEntry } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { PlusCircle } from 'lucide-react-native'

export default function HomeScreen() {
  const { profile } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingActions, setPendingActions] = useState<LeaveRequest[]>([])
  const [onLeaveToday, setOnLeaveToday] = useState<LeaveScheduleEntry[]>([])
  const [upcoming, setUpcoming] = useState<LeaveScheduleEntry[]>([])

  const loadData = useCallback(async () => {
    if (!profile) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const twoWeeksLater = format(addDays(new Date(), 14), 'yyyy-MM-dd')

    const [pendingRes, todayRes, upcomingRes] = await Promise.all([
      // Pending actions for ME
      supabase
        .from('leave_requests')
        .select(`
          id, status, start_date, end_date, total_days,
          requester:profiles!requester_id(id, full_name, jawatan, department),
          replacement:profiles!replacement_id(id, full_name),
          approver:profiles!approver_id(id, full_name),
          leave_type:leave_types!leave_type_id(name, color_hex)
        `)
        .or(
          // Staff B — replacement requests waiting for my response
          `and(replacement_id.eq.${profile.id},status.eq.pending_replacement),` +
          // Staff C — approvals waiting for my decision
          `and(approver_id.eq.${profile.id},status.eq.pending_approval)`
        )
        .order('created_at', { ascending: false }),

      // On leave today
      supabase
        .from('leave_schedule')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today),

      // Upcoming in next 14 days (excluding today)
      supabase
        .from('leave_schedule')
        .select('*')
        .gt('start_date', today)
        .lte('start_date', twoWeeksLater)
        .order('start_date', { ascending: true }),
    ])

    setPendingActions((pendingRes.data ?? []) as unknown as LeaveRequest[])
    setOnLeaveToday((todayRes.data ?? []) as LeaveScheduleEntry[])
    setUpcoming((upcomingRes.data ?? []) as LeaveScheduleEntry[])
    setLoading(false)
    setRefreshing(false)
  }, [profile])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  function onRefresh() { setRefreshing(true); loadData() }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
      >
        {/* Header */}
        <View className="bg-white px-5 pt-4 pb-5 border-b border-gray-100">
          <Text className="text-gray-500 text-sm">Good {greeting()},</Text>
          <Text className="text-2xl font-bold text-gray-900">{profile?.full_name}</Text>
          <Text className="text-gray-400 text-xs mt-0.5">{profile?.jawatan}{profile?.department ? ` · ${profile.department}` : ''}</Text>
        </View>

        {/* Apply Leave CTA */}
        {(profile?.role === 'staff' || profile?.role === 'approver') && (
          <View className="px-5 pt-4">
            <TouchableOpacity
              className="bg-emerald-600 rounded-2xl px-5 py-4 flex-row items-center justify-between"
              onPress={() => router.push('/apply')}
            >
              <View>
                <Text className="text-white font-semibold text-base">Apply for Leave</Text>
                <Text className="text-emerald-200 text-xs mt-0.5">Tap to submit a new request</Text>
              </View>
              <PlusCircle size={28} color="white" />
            </TouchableOpacity>
          </View>
        )}

        {/* Pending Actions */}
        {pendingActions.length > 0 && (
          <Section title="Action Required" accent="bg-amber-500">
            {pendingActions.map(r => (
              <ActionCard key={r.id} request={r} myId={profile!.id} onPress={() => router.push(`/request/${r.id}`)} />
            ))}
          </Section>
        )}

        {/* On Leave Today */}
        <Section title={`On Leave Today (${onLeaveToday.length})`} accent="bg-red-500">
          {onLeaveToday.length === 0 ? (
            <Text className="text-gray-400 text-sm px-4 pb-3">No staff on leave today.</Text>
          ) : onLeaveToday.map(e => (
            <LeaveChip key={e.leave_request_id} entry={e} showDate={false} />
          ))}
        </Section>

        {/* Upcoming Leaves */}
        <Section title="Upcoming Leaves (Next 14 Days)" accent="bg-blue-500">
          {upcoming.length === 0 ? (
            <Text className="text-gray-400 text-sm px-4 pb-3">No upcoming leaves in the next 14 days.</Text>
          ) : upcoming.map(e => (
            <LeaveChip key={e.leave_request_id} entry={e} showDate />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <View className="mt-5 mx-5">
      <View className="flex-row items-center gap-2 mb-3">
        <View className={`w-2 h-2 rounded-full ${accent}`} />
        <Text className="text-sm font-semibold text-gray-700">{title}</Text>
      </View>
      <View className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {children}
      </View>
    </View>
  )
}

function ActionCard({ request, myId, onPress }: { request: LeaveRequest; myId: string; onPress: () => void }) {
  const isReplacement = request.replacement_id === myId
  const label = isReplacement ? 'Replacement request from' : 'Leave approval from'
  const person = isReplacement ? request.requester : request.requester

  return (
    <TouchableOpacity
      className="px-4 py-3 border-b border-gray-50 last:border-b-0"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-xs text-amber-600 font-medium mb-0.5">{label}</Text>
          <Text className="text-gray-900 font-semibold">{person?.full_name ?? '—'}</Text>
          <Text className="text-gray-500 text-xs mt-0.5">
            {request.leave_type?.name} · {formatDateShort(request.start_date)} → {formatDateShort(request.end_date)} ({request.total_days}d)
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>
    </TouchableOpacity>
  )
}

function LeaveChip({ entry, showDate }: { entry: LeaveScheduleEntry; showDate: boolean }) {
  return (
    <View className="px-4 py-3 flex-row items-center justify-between border-b border-gray-50 last:border-b-0">
      <View className="flex-row items-center gap-3 flex-1">
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color_hex }} />
        <View className="flex-1">
          <Text className="text-gray-900 font-medium text-sm">{entry.full_name}</Text>
          <Text className="text-gray-400 text-xs">{entry.department ?? ''}</Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-xs font-medium" style={{ color: entry.color_hex }}>{entry.leave_type}</Text>
        {showDate && (
          <Text className="text-gray-400 text-xs mt-0.5">
            {formatDateShort(entry.start_date)}{entry.start_date !== entry.end_date ? ` → ${formatDateShort(entry.end_date)}` : ''}
          </Text>
        )}
      </View>
    </View>
  )
}
