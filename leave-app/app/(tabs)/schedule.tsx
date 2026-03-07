import { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { formatDate, formatDateShort } from '@/lib/dates'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, subWeeks, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

type ViewMode = 'day' | 'week' | 'month'

type ScheduleEntry = {
  id: string
  start_date: string
  end_date: string
  total_days: number
  requester: { full_name: string; department: string | null; jawatan: string | null }
  replacement: { full_name: string } | null
  leave_type: { name: string; color_hex: string }
}

export default function ScheduleScreen() {
  const [mode, setMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  function getRange(): { start: string; end: string; label: string } {
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    if (mode === 'day') {
      const d = fmt(anchor)
      return { start: d, end: d, label: formatDate(d) }
    }
    if (mode === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 })
      const e = endOfWeek(anchor, { weekStartsOn: 1 })
      return { start: fmt(s), end: fmt(e), label: `${formatDateShort(fmt(s))} – ${formatDateShort(fmt(e))}` }
    }
    const s = startOfMonth(anchor)
    const e = endOfMonth(anchor)
    return { start: fmt(s), end: fmt(e), label: format(anchor, 'MMMM yyyy') }
  }

  const { start, end, label } = getRange()

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select(`
        id, start_date, end_date, total_days,
        requester:profiles!requester_id(full_name, department, jawatan),
        replacement:profiles!replacement_id(full_name),
        leave_type:leave_types!leave_type_id(name, color_hex)
      `)
      .eq('status', 'approved')
      .lte('start_date', end)
      .gte('end_date', start)
      .order('start_date', { ascending: true })
    setEntries((data ?? []) as unknown as ScheduleEntry[])
    setLoading(false)
    setRefreshing(false)
  }, [start, end])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))
  function onRefresh() { setRefreshing(true); loadData() }

  function navigate(dir: 1 | -1) {
    setAnchor(prev => {
      if (mode === 'day') return new Date(prev.getTime() + dir * 86400000)
      if (mode === 'week') return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1)
      return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1)
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-5 pt-4 pb-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Leave Schedule</Text>

        {/* View mode tabs */}
        <View className="flex-row gap-1 mt-3">
          {(['day', 'week', 'month'] as ViewMode[]).map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              className={`px-4 py-1.5 rounded-full ${mode === m ? 'bg-emerald-600' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-medium capitalize ${mode === m ? 'text-white' : 'text-gray-600'}`}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Navigation */}
        <View className="flex-row items-center justify-between mt-3">
          <TouchableOpacity onPress={() => navigate(-1)} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronLeft size={18} color="#374151" />
          </TouchableOpacity>
          <Text className="text-sm font-semibold text-gray-700">{label}</Text>
          <TouchableOpacity onPress={() => navigate(1)} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronRight size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-sm">No approved leave in this period.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item: e }) => {
            const lt = e.leave_type as any
            const req = e.requester as any
            const repl = e.replacement as any
            const color = lt?.color_hex ?? '#059669'
            return (
              <View className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 flex-row items-center gap-3">
                <View className="w-1 self-stretch rounded-full" style={{ backgroundColor: color }} />
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{req?.full_name}</Text>
                  <Text className="text-gray-500 text-xs">{req?.department ?? ''}{req?.jawatan ? ` · ${req.jawatan}` : ''}</Text>
                  {repl?.full_name
                    ? <Text className="text-green-600 text-xs mt-0.5">Replacement: {repl.full_name}</Text>
                    : null}
                </View>
                <View className="items-end">
                  <Text className="text-xs font-medium" style={{ color }}>{lt?.name}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {e.start_date === e.end_date
                      ? formatDateShort(e.start_date)
                      : `${formatDateShort(e.start_date)} – ${formatDateShort(e.end_date)}`}
                  </Text>
                  <Text className="text-gray-400 text-xs">{e.total_days}d</Text>
                </View>
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
