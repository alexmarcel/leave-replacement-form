import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useApply } from '@/context/apply'
import { useAuth } from '@/context/auth'
import { calcWorkingDays } from '@/lib/dates'
import type { LeaveType, PublicHoliday } from '@/lib/types'
import { ChevronLeft, ChevronDown } from 'lucide-react-native'
import { format, addDays } from 'date-fns'

export default function ApplyStep1() {
  const router = useRouter()
  const { profile } = useAuth()
  const { state, set } = useApply()

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [holidays, setHolidays] = useState<string[]>([])
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      const [{ data: types }, { data: hols }] = await Promise.all([
        supabase.from('leave_types').select('*').eq('is_active', true).order('name'),
        supabase.from('public_holidays').select('date'),
      ])
      setLeaveTypes((types ?? []) as LeaveType[])
      setHolidays((hols ?? []).map((h: { date: string }) => h.date))
      setLoading(false)
    }
    load()
  }, [])

  function selectType(lt: LeaveType) {
    set({ leaveTypeId: lt.id, leaveTypeName: lt.name, requiresReplacement: lt.requires_replacement })
    setShowTypeMenu(false)
  }

  function handleDateChange(field: 'startDate' | 'endDate', value: string) {
    const newState: Partial<typeof state> = { [field]: value }
    const start = field === 'startDate' ? value : state.startDate
    const end = field === 'endDate' ? value : state.endDate
    if (start && end && end >= start) {
      newState.totalDays = calcWorkingDays(start, end, holidays)
    }
    set(newState)
  }

  function handleNext() {
    if (!state.leaveTypeId) { Alert.alert('Select a leave type'); return }
    if (!state.startDate) { Alert.alert('Select a start date'); return }
    if (!state.endDate) { Alert.alert('Select an end date'); return }
    if (state.endDate < state.startDate) { Alert.alert('End date must be after start date'); return }
    if (state.totalDays === 0) { Alert.alert('No working days in the selected range'); return }

    if (state.requiresReplacement) {
      router.push('/apply/replacement')
    } else {
      router.push('/apply/review')
    }
  }

  if (loading) {
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#6366F1" /></SafeAreaView>
  }

  const maxDate = format(addDays(new Date(), 365), 'yyyy-MM-dd')

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">Apply for Leave</Text>
        <Text className="ml-auto text-xs text-gray-400">Step 1 of {state.requiresReplacement ? '3' : '2'}</Text>
      </View>

      <ScrollView className="flex-1 px-5 py-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Leave Type */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-gray-700 mb-2">Leave Type *</Text>
          <TouchableOpacity
            className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex-row items-center justify-between"
            onPress={() => setShowTypeMenu(!showTypeMenu)}
          >
            <Text className={state.leaveTypeName ? 'text-gray-900' : 'text-gray-400'}>
              {state.leaveTypeName || 'Select leave type…'}
            </Text>
            <ChevronDown size={16} color="#9ca3af" />
          </TouchableOpacity>
          {showTypeMenu && (
            <View className="bg-white border border-gray-200 rounded-xl mt-1 overflow-hidden shadow-sm">
              {leaveTypes.map(lt => (
                <TouchableOpacity
                  key={lt.id}
                  className="px-4 py-3 flex-row items-center border-b border-gray-50 last:border-b-0"
                  onPress={() => selectType(lt)}
                >
                  <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: lt.color_hex }} />
                  <View className="flex-1">
                    <Text className="text-gray-900 font-medium">{lt.name}</Text>
                    {lt.description ? <Text className="text-gray-400 text-xs">{lt.description}</Text> : null}
                  </View>
                  {!lt.requires_replacement && (
                    <Text className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">No replacement needed</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Dates */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-700 mb-2">Start Date *</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              value={state.startDate}
              onChangeText={v => handleDateChange('startDate', v)}
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-700 mb-2">End Date *</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              value={state.endDate}
              onChangeText={v => handleDateChange('endDate', v)}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Working days display */}
        {state.totalDays > 0 && (
          <View className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
            <Text className="text-indigo-700 font-medium text-sm">
              {state.totalDays} working day{state.totalDays !== 1 ? 's' : ''} (weekends & holidays excluded)
            </Text>
          </View>
        )}

        {/* Reason */}
        <View className="mb-5">
          <Text className="text-sm font-medium text-gray-700 mb-2">Reason (optional)</Text>
          <TextInput
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
            placeholder="Briefly describe the reason…"
            placeholderTextColor="#9ca3af"
            value={state.reason}
            onChangeText={v => set({ reason: v })}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          className="bg-indigo-500 rounded-xl py-4 items-center"
          onPress={handleNext}
        >
          <Text className="text-white font-semibold text-base">
            {state.requiresReplacement ? 'Next: Pick Replacement →' : 'Next: Review →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
