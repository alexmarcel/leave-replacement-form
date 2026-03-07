import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useApply } from '@/context/apply'
import { useAuth } from '@/context/auth'
import { formatDate, formatDateWithDay } from '@/lib/dates'
import { sendPushNotification } from '@/lib/notifications'
import { ChevronLeft, Check, AlertTriangle } from 'lucide-react-native'

interface Approver {
  id: string
  full_name: string
  jawatan: string | null
  department: string | null
  expo_push_token: string | null
}

interface ConflictRequest {
  id: string
  start_date: string
  end_date: string
  requester: { full_name: string } | null
}

export default function ApplyReview() {
  const router = useRouter()
  const { profile } = useAuth()
  const { state, set, reset } = useApply()

  const [approvers, setApprovers] = useState<Approver[]>([])
  const [loadingApprovers, setLoadingApprovers] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictRequest[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: approverData }, { data: settingsData }, { data: conflictData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, jawatan, department, expo_push_token')
          .eq('role', 'approver')
          .eq('is_active', true)
          .neq('id', profile!.id)
          .order('full_name'),
        supabase
          .from('system_settings')
          .select('allow_multiple_replacements')
          .limit(1)
          .single(),
        supabase
          .from('leave_requests')
          .select('id, start_date, end_date, requester:profiles!requester_id(full_name)')
          .eq('replacement_id', profile!.id)
          .in('status', ['pending_approval', 'approved'])
          .lte('start_date', state.endDate)
          .gte('end_date', state.startDate),
      ])
      setApprovers((approverData ?? []) as Approver[])
      // Only enforce conflict check in One-to-One mode
      const oneToOne = !(settingsData?.allow_multiple_replacements ?? false)
      setConflicts(oneToOne ? (conflictData ?? []) as unknown as ConflictRequest[] : [])
      setLoadingApprovers(false)
    }
    load()
  }, [])

  async function handleSubmit() {
    if (!state.approverId) { Alert.alert('Select an approver'); return }
    setSubmitting(true)

    // 1. Create the draft leave request
    const { data: draft, error: draftErr } = await supabase
      .from('leave_requests')
      .insert({
        requester_id: profile!.id,
        leave_type_id: state.leaveTypeId,
        start_date: state.startDate,
        end_date: state.endDate,
        total_days: state.totalDays,
        reason: state.reason || null,
        status: 'draft',
      })
      .select()
      .single()

    if (draftErr || !draft) {
      Alert.alert('Error', draftErr?.message ?? 'Failed to create request')
      setSubmitting(false)
      return
    }

    // 2. Submit — set replacement (if any), approver, and advance status
    const requiresReplacement = state.requiresReplacement && state.replacementId
    const newStatus = requiresReplacement ? 'pending_replacement' : 'pending_approval'

    const { error: submitErr } = await supabase
      .from('leave_requests')
      .update({
        replacement_id: requiresReplacement ? state.replacementId : null,
        approver_id: state.approverId,
        replacement_response: requiresReplacement ? 'pending' : null,
        approver_response: requiresReplacement ? null : 'pending',
        status: newStatus,
      })
      .eq('id', draft.id)

    if (submitErr) {
      Alert.alert('Error', submitErr.message)
      setSubmitting(false)
      return
    }

    // 3. Send notification to Staff B (replacement) if required
    if (requiresReplacement) {
      const { data: replacement } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', state.replacementId)
        .single()

      if (replacement?.expo_push_token) {
        const body = `${profile!.full_name} is requesting you as replacement from ${formatDate(state.startDate)} to ${formatDate(state.endDate)}.`
        await sendPushNotification(replacement.expo_push_token, 'Replacement Request', body)
        await supabase.from('notifications').insert({
          recipient_id: state.replacementId,
          leave_request_id: draft.id,
          type: 'replacement_requested',
          title: 'Replacement Request',
          body,
        })
      }
    } else {
      // Skip replacement — notify approver directly
      const approver = approvers.find(a => a.id === state.approverId)
      if (approver?.expo_push_token) {
        const body = `${profile!.full_name}'s leave from ${formatDate(state.startDate)} to ${formatDate(state.endDate)} needs your approval.`
        await sendPushNotification(approver.expo_push_token, 'Approval Requested', body)
        await supabase.from('notifications').insert({
          recipient_id: state.approverId,
          leave_request_id: draft.id,
          type: 'approval_requested',
          title: 'Approval Requested',
          body,
        })
      }
    }

    setSubmitting(false)
    Alert.alert('Submitted!', 'Your leave request has been submitted.', [
      { text: 'OK', onPress: () => { router.replace('/(tabs)/requests'); reset() } },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">Review & Submit</Text>
          <Text className="text-xs text-gray-400">Step {state.requiresReplacement ? '3' : '2'} of {state.requiresReplacement ? '3' : '2'}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 py-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 mb-5 flex-row gap-3">
            <AlertTriangle size={18} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
            <View className="flex-1">
              <Text className="text-red-800 font-semibold text-sm mb-1">Replacement Conflict</Text>
              <Text className="text-red-700 text-xs leading-5">
                You are already committed as a replacement during this period:
              </Text>
              {conflicts.map(c => (
                <Text key={c.id} className="text-red-700 text-xs font-medium mt-1">
                  · {(c.requester as any)?.full_name ?? '—'} ({formatDate(c.start_date)} – {formatDate(c.end_date)})
                </Text>
              ))}
              <Text className="text-red-600 text-xs mt-2">
                You cannot submit a leave request while you are a replacement for someone else on overlapping dates.
              </Text>
            </View>
          </View>
        )}

        {/* Summary */}
        <View className="bg-white rounded-2xl overflow-hidden border border-gray-100 mb-5">
          <Text className="px-4 pt-3 pb-1 text-sm font-semibold text-gray-700">Leave Summary</Text>
          <SummaryRow label="Type" value={state.leaveTypeName} />
          <SummaryRow label="From" value={state.startDate ? formatDateWithDay(state.startDate) : '—'} />
          <SummaryRow label="To" value={state.endDate ? formatDateWithDay(state.endDate) : '—'} />
          <SummaryRow label="Working Days" value={`${state.totalDays} day${state.totalDays !== 1 ? 's' : ''}`} />
          {state.reason ? <SummaryRow label="Reason" value={state.reason} /> : null}
          {state.replacementName ? <SummaryRow label="Replacement" value={state.replacementName} /> : null}
        </View>

        {/* Approver picker */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-gray-700 mb-2">Select Approver *</Text>
          {loadingApprovers ? (
            <ActivityIndicator color="#059669" />
          ) : approvers.length === 0 ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
              <Text className="text-amber-800 font-medium text-sm">No approvers available</Text>
              <Text className="text-amber-600 text-xs mt-1">
                No active approver accounts exist yet. Please ask your admin to create an approver account before submitting a leave request.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {approvers.map(a => {
                const selected = state.approverId === a.id
                return (
                  <TouchableOpacity
                    key={a.id}
                    className={`bg-white rounded-2xl px-4 py-3.5 border flex-row items-center ${selected ? 'border-emerald-600' : 'border-gray-100'}`}
                    onPress={() => set({ approverId: a.id, approverName: a.full_name })}
                  >
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900">{a.full_name}</Text>
                      {a.jawatan ? <Text className="text-gray-500 text-sm">{a.jawatan}</Text> : null}
                    </View>
                    {selected && (
                      <View className="w-6 h-6 bg-emerald-600 rounded-full items-center justify-center">
                        <Check size={14} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        <TouchableOpacity
          className={`rounded-xl py-4 items-center ${submitting || approvers.length === 0 || conflicts.length > 0 ? 'bg-gray-100' : 'bg-emerald-600'}`}
          onPress={handleSubmit}
          disabled={submitting || approvers.length === 0 || conflicts.length > 0}
        >
          {submitting
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Submit Request</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-start px-4 py-2.5 border-t border-gray-50">
      <Text className="text-gray-500 text-sm w-28">{label}</Text>
      <Text className="text-gray-900 font-medium flex-1 text-right">{value}</Text>
    </View>
  )
}
