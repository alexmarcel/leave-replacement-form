import { useEffect, useState } from 'react'
import {
  View, Text, SectionList, TouchableOpacity,
  ActivityIndicator, TextInput, Alert,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { formatDate } from '@/lib/dates'
import { sendPushNotification } from '@/lib/notifications'
import { ChevronLeft, Search } from 'lucide-react-native'

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
      data: [...data.filter(c => c.available), ...data.filter(c => !c.available)],
    }))
}

export default function PickReplacementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { profile } = useAuth()

  const [request, setRequest] = useState<{ start_date: string; end_date: string; requester_id: string } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: req, error: reqErr } = await supabase
        .from('leave_requests')
        .select('start_date, end_date, requester_id')
        .eq('id', id)
        .single()

      if (reqErr || !req) {
        setError('Could not load request.')
        setLoading(false)
        return
      }

      setRequest(req)

      const [{ data: availableData, error: rpcError }, { data: allStaff }] = await Promise.all([
        supabase.rpc('get_available_replacements', {
          p_start_date: req.start_date,
          p_end_date: req.end_date,
          p_requester_id: req.requester_id,
        }),
        supabase
          .from('profiles')
          .select('id, full_name, department, jawatan, email')
          .eq('is_active', true)
          .in('role', ['staff', 'approver', 'admin'])
          .neq('id', req.requester_id)
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
  }, [id])

  const filtered = candidates.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.department ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.jawatan ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const sections = groupByDepartment(filtered)

  async function handleSelect(candidate: Candidate) {
    if (!request) return
    Alert.alert(
      'Confirm Replacement',
      `Send a replacement request to ${candidate.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => submitSelect(candidate) },
      ]
    )
  }

  async function submitSelect(candidate: Candidate) {
    if (!request) return
    setSubmitting(true)

    const { error: updateErr } = await supabase
      .from('leave_requests')
      .update({
        replacement_id: candidate.id,
        replacement_response: 'pending',
        replacement_responded_at: null,
        replacement_notes: null,
        status: 'pending_replacement',
      })
      .eq('id', id)

    if (updateErr) {
      Alert.alert('Error', updateErr.message)
      setSubmitting(false)
      return
    }

    // Notify new Staff B
    const { data: replacement } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', candidate.id)
      .single()

    if (replacement?.expo_push_token) {
      const body = `${profile!.full_name} is requesting you as replacement from ${formatDate(request.start_date)} to ${formatDate(request.end_date)}.`
      await sendPushNotification(replacement.expo_push_token, 'Replacement Request', body)
      await supabase.from('notifications').insert({
        recipient_id: candidate.id,
        leave_request_id: id,
        type: 'replacement_requested',
        title: 'Replacement Request',
        body,
      })
    }

    setSubmitting(false)
    router.back()
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">Pick New Replacement</Text>
          <Text className="text-xs text-gray-400">Select someone to cover for you</Text>
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
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
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
                className="bg-white rounded-2xl px-4 py-4 border border-gray-100 flex-row items-center"
                onPress={() => handleSelect(c)}
                disabled={submitting}
              >
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{c.full_name}</Text>
                  {c.jawatan ? <Text className="text-gray-500 text-sm">{c.jawatan}</Text> : null}
                  {c.department ? <Text className="text-gray-400 text-xs">{c.department}</Text> : null}
                </View>
                {submitting && <ActivityIndicator color="#059669" />}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
