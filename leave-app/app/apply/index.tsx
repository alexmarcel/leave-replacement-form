import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Modal,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useApply } from '@/context/apply'
import { useAuth } from '@/context/auth'
import { calcWorkingDays } from '@/lib/dates'
import type { LeaveType } from '@/lib/types'
import { ChevronLeft, ChevronDown, CalendarDays } from 'lucide-react-native'
import { format, parseISO } from 'date-fns'

export default function ApplyStep1() {
  const router = useRouter()
  const { profile } = useAuth()
  const { state, set } = useApply()

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [holidays, setHolidays] = useState<string[]>([])
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [loading, setLoading] = useState(true)

  // Date picker state
  const [pickerTarget, setPickerTarget] = useState<'startDate' | 'endDate' | null>(null)
  const [pickerDate, setPickerDate] = useState(new Date())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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

  function openPicker(target: 'startDate' | 'endDate') {
    const existing = target === 'startDate' ? state.startDate : state.endDate
    setPickerDate(existing ? parseISO(existing) : new Date())
    setPickerTarget(target)
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setPickerTarget(null)
      if (event.type === 'dismissed' || !selected) return
    }
    if (!selected || !pickerTarget) return
    const dateStr = format(selected, 'yyyy-MM-dd')
    const newState: Partial<typeof state> = { [pickerTarget]: dateStr }
    const start = pickerTarget === 'startDate' ? dateStr : state.startDate
    const end = pickerTarget === 'endDate' ? dateStr : state.endDate
    if (start && end && end >= start) {
      newState.totalDays = calcWorkingDays(start, end, holidays)
    } else {
      newState.totalDays = 0
    }
    set(newState)
    if (Platform.OS === 'ios') setPickerDate(selected)
  }

  function closeiOSPicker() {
    setPickerTarget(null)
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
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#059669" /></SafeAreaView>
  }

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
                  className="px-4 py-3 flex-row items-center border-b border-gray-50"
                  onPress={() => selectType(lt)}
                >
                  <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: lt.color_hex }} />
                  <View className="flex-1">
                    <Text className="text-gray-900 font-medium">{lt.name}</Text>
                    {lt.description ? <Text className="text-gray-400 text-xs">{lt.description}</Text> : null}
                  </View>
                  {lt.requires_replacement ? (
                    <Text className="text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">Replacement required</Text>
                  ) : (
                    <Text className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">No replacement needed</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Date Pickers */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-700 mb-2">Start Date *</Text>
            <TouchableOpacity
              className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex-row items-center justify-between"
              onPress={() => openPicker('startDate')}
            >
              <Text className={state.startDate ? 'text-gray-900' : 'text-gray-400'}>
                {state.startDate ? format(parseISO(state.startDate), 'd MMM yyyy') : 'Select…'}
              </Text>
              <CalendarDays size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-700 mb-2">End Date *</Text>
            <TouchableOpacity
              className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex-row items-center justify-between"
              onPress={() => openPicker('endDate')}
            >
              <Text className={state.endDate ? 'text-gray-900' : 'text-gray-400'}>
                {state.endDate ? format(parseISO(state.endDate), 'd MMM yyyy') : 'Select…'}
              </Text>
              <CalendarDays size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Android picker — renders inline when visible */}
        {Platform.OS === 'android' && pickerTarget && (
          <DateTimePicker
            value={pickerDate}
            mode="date"
            minimumDate={pickerTarget === 'endDate' && state.startDate ? parseISO(state.startDate) : today}
            onChange={onPickerChange}
          />
        )}

        {/* Working days */}
        {state.totalDays > 0 && (
          <View className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-5">
            <Text className="text-emerald-800 font-medium text-sm">
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
            onChangeText={(v: string) => set({ reason: v })}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          className="bg-emerald-600 rounded-xl py-4 items-center"
          onPress={handleNext}
        >
          <Text className="text-white font-semibold text-base">
            {state.requiresReplacement ? 'Pick Replacement' : 'Next: Review →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* iOS picker — shown in a modal overlay */}
      {Platform.OS === 'ios' && pickerTarget && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/40">
            <View className="bg-white rounded-t-2xl">
              <View className="flex-row justify-between items-center px-5 py-3 border-b border-gray-100">
                <Text className="text-gray-500 font-medium">
                  {pickerTarget === 'startDate' ? 'Start Date' : 'End Date'}
                </Text>
                <TouchableOpacity onPress={closeiOSPicker}>
                  <Text className="text-emerald-700 font-semibold text-base">Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                minimumDate={pickerTarget === 'endDate' && state.startDate ? parseISO(state.startDate) : today}
                onChange={onPickerChange}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}
