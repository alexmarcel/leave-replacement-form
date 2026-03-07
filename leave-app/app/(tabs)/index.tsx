import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { formatDateShort } from '@/lib/dates'
import { format, addDays } from 'date-fns'
import type { LeaveRequest } from '@/lib/types'
import { Calendar, ChevronRight } from 'lucide-react-native'

type LeaveChipEntry = {
  id: string
  start_date: string
  end_date: string
  total_days: number
  requester: { full_name: string; department: string | null }
  replacement: { full_name: string } | null
  leave_type: { name: string; color_hex: string }
}
import { StatusBadge } from '@/components/StatusBadge'
import { PlusCircle } from 'lucide-react-native'

export default function HomeScreen() {
  const { profile } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingActions, setPendingActions] = useState<LeaveRequest[]>([])
  const [replacingFor, setReplacingFor] = useState<LeaveRequest[]>([])
  const [onLeaveToday, setOnLeaveToday] = useState<LeaveChipEntry[]>([])
  const [upcoming, setUpcoming] = useState<LeaveChipEntry[]>([])

  const loadData = useCallback(async () => {
    if (!profile) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const twoWeeksLater = format(addDays(new Date(), 14), 'yyyy-MM-dd')

    const [pendingRes, replacingRes, todayRes, upcomingRes] = await Promise.all([
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

      // Requests I have agreed to cover (agreed + awaiting approval, or fully approved)
      supabase
        .from('leave_requests')
        .select(`
          id, status, start_date, end_date, total_days,
          requester:profiles!requester_id(id, full_name, jawatan, department),
          leave_type:leave_types!leave_type_id(name, color_hex)
        `)
        .eq('replacement_id', profile.id)
        .in('status', ['pending_approval', 'approved'])
        .order('start_date', { ascending: true }),

      // On leave today
      supabase
        .from('leave_requests')
        .select(`
          id, start_date, end_date, total_days,
          requester:profiles!requester_id(full_name, department),
          replacement:profiles!replacement_id(full_name),
          leave_type:leave_types!leave_type_id(name, color_hex)
        `)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today),

      // Upcoming in next 14 days (excluding today)
      supabase
        .from('leave_requests')
        .select(`
          id, start_date, end_date, total_days,
          requester:profiles!requester_id(full_name, department),
          replacement:profiles!replacement_id(full_name),
          leave_type:leave_types!leave_type_id(name, color_hex)
        `)
        .eq('status', 'approved')
        .gt('start_date', today)
        .lte('start_date', twoWeeksLater)
        .order('start_date', { ascending: true }),
    ])

    setPendingActions((pendingRes.data ?? []) as unknown as LeaveRequest[])
    setReplacingFor((replacingRes.data ?? []) as unknown as LeaveRequest[])
    setOnLeaveToday((todayRes.data ?? []) as unknown as LeaveChipEntry[])
    setUpcoming((upcomingRes.data ?? []) as unknown as LeaveChipEntry[])
    setLoading(false)
    setRefreshing(false)
  }, [profile])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  function onRefresh() { setRefreshing(true); loadData() }

  if (loading || !profile) {
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
        <View className="bg-white px-5 pt-10 pb-5 border-b border-gray-100">
          <Text className="text-gray-500 text-sm">Good {greeting()},</Text>
          <Text className="text-2xl font-bold text-gray-900">{profile?.full_name}</Text>
          <Text className="text-gray-400 text-xs mt-0.5">{profile?.jawatan}{profile?.department ? ` · ${profile.department}` : ''}</Text>
        </View>

        {/* Apply Leave CTA */}
        {(profile?.role === 'staff' || profile?.role === 'approver' || profile?.role === 'admin') && (
          <View className="px-5 pt-4">
            <TouchableOpacity
              className="bg-emerald-600 rounded-2xl px-5 py-6 flex-row items-center justify-between"
              onPress={() => router.push('/apply')}
            >
              <View>
                <Text className="text-white font-semibold text-base">Request Leave Replacement</Text>
                <Text className="text-emerald-200 text-xs mt-0.5">Tap to submit a new request</Text>
              </View>
              <PlusCircle size={38} color="white" />
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

        {/* Covering For */}
        {replacingFor.length > 0 && (
          <Section title={`Covering For (${replacingFor.length})`} accent="bg-emerald-500">
            {replacingFor.map(r => (
              <TouchableOpacity
                key={r.id}
                className="px-4 py-3 border-b border-gray-50 last:border-b-0"
                onPress={() => router.push(`/request/${r.id}`)}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-xs text-emerald-700 font-medium mb-0.5">Replacement for</Text>
                    <Text className="text-gray-900 font-semibold">{(r.requester as any)?.full_name ?? '—'}</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">
                      {(r.leave_type as any)?.name} · {formatDateShort(r.start_date)} - {formatDateShort(r.end_date)} ({r.total_days}d)
                    </Text>
                  </View>
                  <StatusBadge status={r.status} />
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* On Leave Today */}
        <Section title={`On Leave Today (${onLeaveToday.length})`} accent="bg-green-500">
          {onLeaveToday.length === 0 ? (
            <Text className="text-gray-400 text-sm px-4 pb-3 pt-3">No staff on leave today.</Text>
          ) : onLeaveToday.map(e => (
            <LeaveChip key={e.id} entry={e} />
          ))}
        </Section>

        {/* Upcoming Leaves */}
        <Section title="Upcoming Leaves (Next 14 Days)" accent="bg-blue-500">
          {upcoming.length === 0 ? (
            <Text className="text-gray-400 text-sm px-4 pb-3 pt-3">No upcoming leaves in the next 14 days.</Text>
          ) : upcoming.map(e => (
            <LeaveChip key={e.id} entry={e} />
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
  if (h < 19) return 'evening'
  return 'night'
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <View className="mt-5 mx-5">
      <View className="flex-row items-center gap-2 mb-3"><Calendar size={18} color="#d1d5db" className="ml-2" />
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
            {request.leave_type?.name} · {formatDateShort(request.start_date)} - {formatDateShort(request.end_date)} ({request.total_days}d)
          </Text>
        </View>
        <StatusBadge status={request.status} />
      </View>
    </TouchableOpacity>
  )
}

function LeaveChip({ entry }: { entry: LeaveChipEntry }) {
  const lt = entry.leave_type as any
  const color = lt?.color_hex ?? '#059669'
  return (
    <View className="px-4 py-3 border-b border-gray-50 last:border-b-0">
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <View className="w-3.5 h-3.5 rounded-full mt-1" style={{ backgroundColor: color }} />
          <View className="flex-1">
            <Text className="text-gray-900 font-medium text-sm justify-center">{(entry.requester as any)?.full_name}</Text>
            {(entry.requester as any)?.department
              ? <Text className="text-gray-400 text-xs">{(entry.requester as any).department}</Text>
              : null}
            {(entry.replacement as any)?.full_name
              ? <Text className="text-gray-400 text-xs mt-0.5">Replacement : {(entry.replacement as any).full_name}</Text>
              : null}
          </View>
        </View>
        <View className="items-end">
          <Text className="text-xs font-medium" style={{ color }}>{lt?.name}</Text>
          <Text className="text-gray-400 text-xs mt-0.5">
            {formatDateShort(entry.start_date)}{entry.start_date !== entry.end_date ? ` to ${formatDateShort(entry.end_date)}` : ''}
          </Text>
          <Text className="text-gray-400 text-xs">{entry.total_days} day{entry.total_days !== 1 ? 's' : ''}</Text>
        </View>
      </View>
    </View>
  )
}
