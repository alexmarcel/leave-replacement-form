import { useEffect, useState } from 'react'
import {
  View, Text, SectionList, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useApply } from '@/context/apply'
import { useAuth } from '@/context/auth'
import { ChevronLeft, Search, Check } from 'lucide-react-native'

interface Candidate {
  id: string
  full_name: string
  department: string | null
  jawatan: string | null
  email: string
  available: boolean
}

interface Section {
  title: string
  data: Candidate[]
}

function groupByDepartment(candidates: Candidate[]): Section[] {
  const map = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const dept = c.department?.trim() || 'No Department'
    if (!map.has(dept)) map.set(dept, [])
    map.get(dept)!.push(c)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'No Department') return 1
      if (b === 'No Department') return -1
      return a.localeCompare(b)
    })
    .map(([title, data]) => ({
      title,
      // available first, then unavailable
      data: [...data.filter(c => c.available), ...data.filter(c => !c.available)],
    }))
}

export default function ApplyStep2Replacement() {
  const router = useRouter()
  const { profile } = useAuth()
  const { state, set } = useApply()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.id || !state.startDate || !state.endDate) {
      setError('Missing date range or user profile. Go back and try again.')
      setLoading(false)
      return
    }
    async function load() {
      const [{ data: availableData, error: rpcError }, { data: allStaff }] = await Promise.all([
        supabase.rpc('get_available_replacements', {
          p_start_date: state.startDate,
          p_end_date: state.endDate,
          p_requester_id: profile!.id,
        }),
        supabase
          .from('profiles')
          .select('id, full_name, department, jawatan, email')
          .eq('is_active', true)
          .in('role', ['staff', 'approver'])
          .neq('id', profile!.id)
          .order('full_name'),
      ])
      if (rpcError) { setError(rpcError.message); setLoading(false); return }
      const availableIds = new Set((availableData ?? []).map((c: any) => c.id))
      setCandidates(
        (allStaff ?? []).map(p => ({ ...p, available: availableIds.has(p.id) }))
      )
      setLoading(false)
    }
    load()
  }, [])

  const filtered = candidates.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.department ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.jawatan ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const sections = groupByDepartment(filtered)
  const hasSelection = !!state.replacementId

  function select(c: Candidate) {
    if (!c.available) return
    set({ replacementId: c.id, replacementName: c.full_name })
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">Pick Replacement</Text>
          <Text className="text-xs text-gray-400">Step 2 of 3</Text>
        </View>
      </View>

      <View className="px-5 py-3 bg-white border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2">
          <Search size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 text-gray-900 text-sm"
            placeholder="Search name, department…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#059669" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-red-500 text-sm text-center">{error}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-sm">No staff found.</Text>
              <Text className="text-gray-400 text-xs mt-1">No staff accounts exist yet. Ask an admin to create staff accounts.</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View className="mt-4 mb-2">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {section.title}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item: c }) => {
            const selected = state.replacementId === c.id
            if (!c.available) {
              return (
                <View className="bg-gray-50 rounded-2xl px-4 py-4 border border-gray-100 flex-row items-center opacity-60">
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-400">{c.full_name}</Text>
                    {c.jawatan ? <Text className="text-gray-400 text-sm">{c.jawatan}</Text> : null}
                    <Text className="text-xs text-orange-400 mt-1">Already replacing someone else</Text>
                  </View>
                </View>
              )
            }
            return (
              <TouchableOpacity
                className={`bg-white rounded-2xl px-4 py-4 border flex-row items-center ${selected ? 'border-emerald-600' : 'border-gray-100'}`}
                onPress={() => select(c)}
              >
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{c.full_name}</Text>
                  {c.jawatan ? <Text className="text-gray-500 text-sm">{c.jawatan}</Text> : null}
                </View>
                {selected && (
                  <View className="w-6 h-6 bg-emerald-600 rounded-full items-center justify-center">
                    <Check size={14} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Continue button */}
      {!loading && !error && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-gray-50 border-t border-gray-100">
          <TouchableOpacity
            className={`rounded-2xl py-4 items-center ${hasSelection ? 'bg-emerald-600' : 'bg-gray-200'}`}
            onPress={() => { if (hasSelection) router.push('/apply/review') }}
            disabled={!hasSelection}
          >
            <Text className={`font-semibold text-base ${hasSelection ? 'text-white' : 'text-gray-400'}`}>
              {hasSelection ? 'Continue to Review' : 'Select a Replacement'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}
