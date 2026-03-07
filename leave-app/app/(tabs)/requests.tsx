import { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { formatDateShort } from '@/lib/dates'
import type { LeaveRequest, LeaveStatus } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { ChevronRight } from 'lucide-react-native'

const ALL_STATUSES: LeaveStatus[] = [
  'pending_replacement', 'replacement_rejected', 'pending_approval',
  'approved', 'rejected', 'cancelled', 'draft',
]

const FILTERS: { label: string; value: LeaveStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

export default function RequestsScreen() {
  const { profile } = useAuth()
  const router = useRouter()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [filter, setFilter] = useState<LeaveStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadRequests = useCallback(async () => {
    if (!profile) return
    let query = supabase
      .from('leave_requests')
      .select(`
        id, status, start_date, end_date, total_days, created_at,
        leave_type:leave_types!leave_type_id(name, color_hex),
        replacement:profiles!replacement_id(full_name),
        approver:profiles!approver_id(full_name)
      `)
      .eq('requester_id', profile.id)
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      if (filter === 'pending_approval') {
        query = query.in('status', ['pending_replacement', 'replacement_rejected', 'pending_approval'])
      } else {
        query = query.eq('status', filter)
      }
    }

    const { data } = await query
    setRequests((data ?? []) as unknown as LeaveRequest[])
    setLoading(false)
    setRefreshing(false)
  }, [profile, filter])

  useFocusEffect(useCallback(() => { loadRequests() }, [loadRequests]))
  function onRefresh() { setRefreshing(true); loadRequests() }

  if (!profile) return null

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">My Requests</Text>
      </View>

      {/* Filter tabs */}
      <View className="bg-white border-b border-gray-100 px-5 py-2 flex-row gap-2">
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full ${filter === f.value ? 'bg-emerald-600' : 'bg-gray-100'}`}
          >
            <Text className={`text-xs font-medium ${filter === f.value ? 'text-white' : 'text-gray-600'}`}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 12, paddingHorizontal: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-sm">No requests found.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item: r }) => (
            <TouchableOpacity
              className="bg-white rounded-2xl px-4 py-4 border border-gray-100 flex-row items-center"
              onPress={() => router.push(`/request/${r.id}`)}
            >
              <View
                className="w-1 self-stretch rounded-full mr-3"
                style={{ backgroundColor: (r.leave_type as any)?.color_hex ?? '#059669' }}
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="font-semibold text-gray-900">{(r.leave_type as any)?.name ?? '—'}</Text>
                  <StatusBadge status={r.status} />
                </View>
                <Text className="text-gray-500 text-sm">
                  {formatDateShort(r.start_date)} to {formatDateShort(r.end_date)} · {r.total_days} day{r.total_days !== 1 ? 's' : ''}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  Submitted {new Date(r.created_at).toLocaleDateString()}
                </Text>
              </View>
              <ChevronRight size={18} color="#d1d5db" className="ml-2" />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
