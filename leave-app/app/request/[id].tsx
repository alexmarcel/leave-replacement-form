import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, BackHandler,
} from 'react-native'
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { formatDate, formatDateWithDay } from '@/lib/dates'
import type { LeaveRequest, LeaveAuditLog, LeaveStatus } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { ChevronLeft, CheckCircle2, XCircle, Clock, FilePenLine, FileDown, ClockFading, CircleCheck, CircleCheckBig } from 'lucide-react-native'
import { sendPushNotification } from '@/lib/notifications'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

const FINAL: LeaveStatus[] = ['approved', 'rejected', 'cancelled']

export default function RequestDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>()
  const { profile } = useAuth()
  const router = useRouter()

  const [request, setRequest] = useState<LeaveRequest | null>(null)
  const [auditLog, setAuditLog] = useState<LeaveAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    if (from !== 'requests') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(tabs)/requests')
      return true
    })
    return () => sub.remove()
  }, [from])

  const loadRequest = useCallback(async () => {
    const [{ data: req }, { data: audit }] = await Promise.all([
      supabase
        .from('leave_requests')
        .select(`
          *,
          requester:profiles!requester_id(*),
          replacement:profiles!replacement_id(*),
          approver:profiles!approver_id(*),
          leave_type:leave_types!leave_type_id(*)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('leave_audit_log')
        .select(`*, changer:profiles!changed_by(full_name)`)
        .eq('leave_request_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (!req) {
      setFetchError('Request not found or you do not have access.')
    } else {
      setRequest(req as LeaveRequest)
      setFetchError(null)
    }
    setAuditLog((audit ?? []) as LeaveAuditLog[])
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { loadRequest() }, [loadRequest]))

  const isFinal = FINAL.includes(request?.status as LeaveStatus)
  const isRequester = profile?.id === request?.requester_id
  const isReplacement = profile?.id === request?.replacement_id
  const isApprover = profile?.id === request?.approver_id

  async function handleReplacementResponse(agreed: boolean) {
    setActionLoading(agreed ? 'agree' : 'reject')
    const newStatus = agreed ? 'pending_approval' : 'replacement_rejected'

    const { error } = await supabase
      .from('leave_requests')
      .update({
        replacement_response: agreed ? 'agreed' : 'rejected',
        replacement_responded_at: new Date().toISOString(),
        replacement_notes: notes || null,
        ...(agreed ? { approver_response: 'pending' } : {}),
        status: newStatus,
      })
      .eq('id', id)

    if (error) { Alert.alert('Error', error.message); setActionLoading(null); return }

    // Notify Staff A
    if (request?.requester?.expo_push_token) {
      const body = agreed
        ? `${profile?.full_name} agreed to cover you. Your request is now pending approval.`
        : `${profile?.full_name} declined your replacement request. Please select another replacement.`
      await sendPushNotification(request.requester.expo_push_token, agreed ? 'Replacement Agreed' : 'Replacement Declined', body)
      await supabase.from('notifications').insert({
        recipient_id: request.requester_id,
        leave_request_id: id,
        type: agreed ? 'replacement_agreed' : 'replacement_rejected',
        title: agreed ? 'Replacement Agreed' : 'Replacement Declined',
        body,
      })
    }

    // Notify Staff C if agreed
    if (agreed && request?.approver?.expo_push_token) {
      const body = `${request.requester?.full_name}'s leave request from ${formatDate(request.start_date)} to ${formatDate(request.end_date)} needs your approval.`
      await sendPushNotification(request.approver.expo_push_token, 'Approval Requested', body)
      await supabase.from('notifications').insert({
        recipient_id: request.approver_id,
        leave_request_id: id,
        type: 'approval_requested',
        title: 'Approval Requested',
        body,
      })
    }

    setNotes('')
    setShowNotes(false)
    setActionLoading(null)
    loadRequest()
  }

  async function handleApproverResponse(approved: boolean) {
    setActionLoading(approved ? 'approve' : 'reject')
    const newStatus = approved ? 'approved' : 'rejected'

    const { error } = await supabase
      .from('leave_requests')
      .update({
        approver_response: approved ? 'approved' : 'rejected',
        approver_responded_at: new Date().toISOString(),
        approver_notes: notes || null,
        status: newStatus,
      })
      .eq('id', id)

    if (error) { Alert.alert('Error', error.message); setActionLoading(null); return }

    // Notify Staff A
    if (request?.requester?.expo_push_token) {
      const body = approved
        ? `Your leave from ${formatDate(request!.start_date)} to ${formatDate(request!.end_date)} has been approved.`
        : `Your leave request was rejected by ${profile?.full_name}. ${notes ? `Reason: ${notes}` : ''}`
      await sendPushNotification(request.requester.expo_push_token, approved ? 'Leave Approved' : 'Leave Rejected', body)
      await supabase.from('notifications').insert({
        recipient_id: request.requester_id,
        leave_request_id: id,
        type: approved ? 'request_approved' : 'request_rejected',
        title: approved ? 'Leave Approved' : 'Leave Rejected',
        body,
      })
    }

    // Notify Staff B if approved
    if (approved && request?.replacement?.expo_push_token) {
      const body = `You are confirmed as replacement for ${request.requester?.full_name} from ${formatDate(request.start_date)} to ${formatDate(request.end_date)}.`
      await sendPushNotification(request.replacement.expo_push_token, 'Replacement Confirmed', body)
      await supabase.from('notifications').insert({
        recipient_id: request.replacement_id!,
        leave_request_id: id,
        type: 'request_approved',
        title: 'Replacement Confirmed',
        body,
      })
    }

    setNotes('')
    setShowNotes(false)
    setActionLoading(null)
    loadRequest()
  }

  async function handleWithdraw() {
    Alert.alert(
      'Withdraw Agreement',
      'Are you sure you want to withdraw? Staff A will need to pick a new replacement.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Withdraw', style: 'destructive', onPress: async () => {
            setActionLoading('withdraw')
            const { error } = await supabase
              .from('leave_requests')
              .update({
                replacement_response: 'rejected',
                replacement_responded_at: new Date().toISOString(),
                replacement_notes: null,
                status: 'replacement_rejected',
              })
              .eq('id', id)

            if (error) { Alert.alert('Error', error.message); setActionLoading(null); return }

            // Notify Staff A
            if (request?.requester?.expo_push_token) {
              const body = `${profile?.full_name} withdrew as your replacement. Please pick someone else.`
              await sendPushNotification(request.requester.expo_push_token, 'Replacement Withdrew', body)
              await supabase.from('notifications').insert({
                recipient_id: request.requester_id,
                leave_request_id: id,
                type: 'replacement_rejected',
                title: 'Replacement Withdrew',
                body,
              })
            }

            // Notify Staff C
            if (request?.approver?.expo_push_token) {
              const body = `The replacement for ${request.requester?.full_name}'s leave request has withdrawn. The request is on hold.`
              await sendPushNotification(request.approver.expo_push_token, 'Replacement Withdrew', body)
              await supabase.from('notifications').insert({
                recipient_id: request.approver_id,
                leave_request_id: id,
                type: 'replacement_rejected',
                title: 'Replacement Withdrew',
                body,
              })
            }

            setActionLoading(null)
            loadRequest()
          },
        },
      ]
    )
  }

  async function handleGeneratePdf() {
    if (!request) return
    setPdfLoading(true)
    try {
      const r = request as any
      const leaveType = r.leave_type
      const requester = r.requester
      const replacement = r.replacement
      const approver = r.approver

      const statusColors: Record<string, string> = {
        approved: '#16a34a', rejected: '#dc2626', cancelled: '#6b7280',
        pending_approval: '#d97706', pending_replacement: '#2563eb',
        replacement_rejected: '#dc2626', draft: '#9ca3af',
      }
      const statusColor = statusColors[request.status] ?? '#6b7280'

      const row = (label: string, value: string) =>
        `<tr><td class="label">${label}</td><td class="value">${value}</td></tr>`

      const partySection = (title: string, p: any, extra?: string) => {
        if (!p) return `<div class="section"><h3>${title}</h3><p class="muted">Not assigned</p></div>`
        return `
          <div class="section">
            <h3>${title}</h3>
            <table>${[
              row('Name', p.full_name ?? '—'),
              p.jawatan ? row('Position', p.jawatan) : '',
              p.department ? row('Department', p.department) : '',
              p.email ? row('Email', p.email) : '',
              p.phone ? row('Phone', p.phone) : '',
              extra ? row('Response', extra) : '',
            ].join('')}</table>
          </div>`
      }

      const replacementExtra = r.replacement_response
        ? `${r.replacement_response}${r.replacement_notes ? ` — "${r.replacement_notes}"` : ''}`
        : undefined
      const approverExtra = r.approver_response && r.approver_response !== 'pending'
        ? `${r.approver_response}${r.approver_notes ? ` — "${r.approver_notes}"` : ''}`
        : undefined

      const html = `
        <!DOCTYPE html><html><head><meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 32px; font-size: 13px; width: 100%; box-sizing: border-box; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { margin: 0 0 4px; font-size: 20px; color: #059669; }
          .header p { margin: 0; color: #6b7280; font-size: 12px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; color: #fff; font-size: 12px; font-weight: 600; background: ${statusColor}; }
          .section { margin-bottom: 20px; }
          .section h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 6px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
          td.label { color: #6b7280; width: 130px; }
          td.value { color: #111827; font-weight: 500; }
          .muted { color: #9ca3af; font-size: 12px; margin: 0; }
          .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${leaveType?.color_hex ?? '#059669'}; margin-right: 6px; vertical-align: middle; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; }
          .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; color: #9ca3af; font-size: 11px; }
        </style></head><body>
        <div class="header">
          <div>
            <h1>Leave Request</h1>
            <p>Generated ${new Date().toLocaleString()}</p>
          </div>
          <span class="badge">${request.status.replace(/_/g, ' ').toUpperCase()}</span>
        </div>

        <div class="section">
          <h3>Leave Details</h3>
          <table>${[
            row('Type', `<span class="dot"></span>${leaveType?.name ?? '—'}`),
            row('From', formatDateWithDay(request.start_date)),
            row('To', formatDateWithDay(request.end_date)),
            row('Working Days', `${request.total_days} day${request.total_days !== 1 ? 's' : ''}`),
            request.reason ? row('Reason', request.reason) : '',
            row('Submitted', new Date(request.created_at).toLocaleString()),
          ].join('')}</table>
        </div>

        <div class="grid">
          ${partySection('Staff A — Requester', requester)}
          ${partySection('Staff B — Replacement', replacement, replacementExtra)}
        </div>
        ${partySection('Staff C — Approver', approver, approverExtra)}

        ${auditLog.length > 0 ? `
        <div class="section">
          <h3>Timeline</h3>
          <table>${auditLog.map((entry) => `
            <tr>
              <td class="label" style="color:#6b7280;font-size:11px;padding:7px 0;border-bottom:1px solid #f3f4f6;">
                ${new Date(entry.created_at).toLocaleString()}
              </td>
              <td class="value" style="padding:7px 0;border-bottom:1px solid #f3f4f6;">
                <span style="font-weight:600;">
                  ${entry.old_status ? `${entry.old_status.replace(/_/g, ' ')} → ` : ''}${entry.new_status.replace(/_/g, ' ')}
                </span>
                <span style="color:#6b7280;font-weight:400;"> · ${(entry.changer as any)?.full_name ?? 'System'}</span>
                ${entry.notes ? `<br/><span style="color:#6b7280;font-style:italic;font-size:11px;">"${entry.notes}"</span>` : ''}
              </td>
            </tr>`).join('')}
          </table>
        </div>` : ''}

        <div class="footer">This document is generated from the Leave Management System and is for reference only.</div>
        </body></html>`

      const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842 })
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Leave Request PDF' })
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not generate PDF.')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleCancel() {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this leave request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('leave_requests')
            .update({ status: 'cancelled' })
            .eq('id', id)
          if (error) { Alert.alert('Error', error.message); return }

          // Notify relevant parties
          const notifs = []
          if (request?.replacement_id && request.status === 'pending_replacement') {
            notifs.push({ id: request.replacement_id, token: request.replacement?.expo_push_token, msg: `${request.requester?.full_name} cancelled their request. You no longer need to respond.` })
          }
          if (request?.status === 'pending_approval') {
            if (request.replacement_id) notifs.push({ id: request.replacement_id, token: request.replacement?.expo_push_token, msg: `${request.requester?.full_name} cancelled their leave request.` })
            if (request.approver_id) notifs.push({ id: request.approver_id, token: request.approver?.expo_push_token, msg: `${request.requester?.full_name} cancelled their leave request.` })
          }
          for (const n of notifs) {
            if (n.token) await sendPushNotification(n.token, 'Request Cancelled', n.msg)
            await supabase.from('notifications').insert({ recipient_id: n.id, leave_request_id: id, type: 'request_cancelled', title: 'Request Cancelled', body: n.msg })
          }
          loadRequest()
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    )
  }

  if (fetchError || !request) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <ChevronLeft size={22} color="#374151" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 flex-1">Request Detail</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-gray-400 text-sm text-center">{fetchError ?? 'Request not found.'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Nav bar */}
      <View className="bg-white px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => from === 'requests' ? router.replace('/(tabs)/requests') : router.canGoBack() ? router.back() : router.replace('/(tabs)/requests')} className="mr-3 p-1">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Request Detail</Text>
        <StatusBadge status={request.status} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Leave Details */}
        <InfoCard title="Leave Details">
          <Row label="Type">
            <View className="flex-row items-center gap-2">
              <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: request.leave_type?.color_hex }} />
              <Text className="text-gray-900 font-medium">{request.leave_type?.name}</Text>
            </View>
          </Row>
          <Row label="From"><Text className="text-gray-900 font-medium">{formatDateWithDay(request.start_date)}</Text></Row>
          <Row label="To"><Text className="text-gray-900 font-medium">{formatDateWithDay(request.end_date)}</Text></Row>
          <Row label="Working Days"><Text className="text-gray-900 font-medium">{request.total_days} day{request.total_days !== 1 ? 's' : ''}</Text></Row>
          {request.reason ? <Row label="Reason"><Text className="text-gray-900 font-medium flex-shrink">{request.reason}</Text></Row> : null}
          <Row label="Submitted"><Text className="text-gray-500 text-sm">{new Date(request.created_at).toLocaleString()}</Text></Row>
        </InfoCard>

        {/* Three Parties */}
        <View className="mt-4 gap-3">
          <PartyCard
            label="Staff A — Requester"
            profile={request.requester}
            extra={null}
            statusIcon={<FilePenLine size={20} color="#059669" />}
          />
          <PartyCard
            label="Staff B — Replacement"
            profile={request.replacement}
            extra={request.replacement_response ? `Response: ${request.replacement_response}${request.replacement_notes ? ` · "${request.replacement_notes}"` : ''}` : null}
            statusIcon={
              request.replacement_response === 'agreed' ? <CircleCheckBig size={20} color="#16a34a" /> :
              request.replacement_response === 'rejected' ? <XCircle size={20} color="#dc2626" /> :
              request.replacement_id ? <ClockFading size={20} color="#55aefe" /> : null
            }
          />
          <PartyCard
            label="Staff C — Approver"
            profile={request.approver}
            extra={request.approver_response && request.approver_response !== 'pending' ? `Response: ${request.approver_response}${request.approver_notes ? ` · "${request.approver_notes}"` : ''}` : null}
            statusIcon={
              request.approver_response === 'approved' ? <CircleCheckBig size={20} color="#16a34a" /> :
              request.approver_response === 'rejected' ? <XCircle size={20} color="#dc2626" /> :
              request.approver_id ? <ClockFading size={20} color="#55aefe" /> : null
            }
          />
        </View>

        {/* Action Buttons */}
        {!isFinal && (
          <View className="mt-5 bg-white rounded-2xl p-4 border border-gray-100">
            <Text className="text-sm font-semibold text-gray-700 mb-3">Actions</Text>

            {/* Notes input */}
            {showNotes && (
              <TextInput
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm mb-3 bg-gray-50"
                placeholder="Add a note (optional)…"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            )}

            {/* Staff B actions */}
            {isReplacement && request.status === 'pending_replacement' && (
              <View className="gap-2">
                {!showNotes && (
                  <TouchableOpacity onPress={() => setShowNotes(true)} className="py-2">
                    <Text className="text-emerald-600 text-sm text-center">+ Add a note</Text>
                  </TouchableOpacity>
                )}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 bg-green-500 rounded-xl py-3 items-center"
                    onPress={() => handleReplacementResponse(true)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'agree' ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Agree</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 bg-red-500 rounded-xl py-3 items-center"
                    onPress={() => handleReplacementResponse(false)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'reject' ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Reject</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Staff C actions */}
            {isApprover && request.status === 'pending_approval' && (
              <View className="gap-2">
                {!showNotes && (
                  <TouchableOpacity onPress={() => setShowNotes(true)} className="py-2">
                    <Text className="text-emerald-600 text-sm text-center">+ Add a note</Text>
                  </TouchableOpacity>
                )}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 bg-green-500 rounded-xl py-3 items-center"
                    onPress={() => handleApproverResponse(true)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'approve' ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 bg-red-500 rounded-xl py-3 items-center"
                    onPress={() => handleApproverResponse(false)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'reject' ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">Reject</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Staff B — withdraw after agreeing */}
            {isReplacement && request.status === 'pending_approval' && (
              <TouchableOpacity
                className="border border-red-300 rounded-xl py-3 items-center mb-2"
                onPress={handleWithdraw}
                disabled={!!actionLoading}
              >
                {actionLoading === 'withdraw'
                  ? <ActivityIndicator color="#dc2626" />
                  : <Text className="text-red-600 font-medium">Withdraw Agreement</Text>}
              </TouchableOpacity>
            )}

            {/* Staff A — pick new replacement after rejection */}
            {isRequester && request.status === 'replacement_rejected' && (
              <TouchableOpacity
                className="bg-emerald-600 rounded-xl py-3 items-center mb-2"
                onPress={() => router.push(`/request/pick-replacement?id=${id}`)}
                disabled={!!actionLoading}
              >
                <Text className="text-white font-semibold">Pick New Replacement</Text>
              </TouchableOpacity>
            )}

            {/* Staff A cancel */}
            {isRequester && ['draft', 'pending_replacement', 'replacement_rejected', 'pending_approval'].includes(request.status) && (
              <TouchableOpacity
                className="border border-red-300 rounded-xl py-3 items-center"
                onPress={handleCancel}
                disabled={!!actionLoading}
              >
                <Text className="text-red-600 font-medium">Cancel Request</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Share PDF */}
        <TouchableOpacity
          className="mt-5 bg-white rounded-2xl px-4 py-3.5 border border-gray-100 flex-row items-center justify-center gap-2"
          onPress={handleGeneratePdf}
          disabled={pdfLoading}
        >
          {pdfLoading
            ? <ActivityIndicator size="small" color="#059669" />
            : <>
                <FileDown size={18} color="#059669" />
                <Text className="text-emerald-700 font-semibold text-sm">Share as PDF</Text>
              </>
          }
        </TouchableOpacity>

        {/* Audit Timeline */}
        <View className="mt-5">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Timeline</Text>
          <View className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
            {auditLog.length === 0 ? (
              <Text className="text-gray-400 text-sm">No audit entries yet.</Text>
            ) : auditLog.map((entry, i) => (
              <View key={entry.id} className="flex-row gap-3 mb-3 last:mb-0">
                <View className="items-center">
                  <View className="w-2.5 h-2.5 rounded-full bg-gray-400 mt-1.5" />
                  {i < auditLog.length - 1 && <View className="w-0.5 flex-1 bg-gray-200 my-1" />}
                </View>
                <View className="flex-1 pb-1">
                  <Text className="text-sm text-gray-900 font-medium">
                    {entry.old_status ? `${entry.old_status} → ` : ''}{entry.new_status}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {(entry.changer as any)?.full_name ?? 'System'} · {new Date(entry.created_at).toLocaleString()}
                  </Text>
                  {entry.notes ? <Text className="text-xs text-gray-500 italic mt-0.5">"{entry.notes}"</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl overflow-hidden border border-gray-100">
      <Text className="px-4 pt-3 pb-2 text-sm font-semibold text-gray-700">{title}</Text>
      <View className="divide-y divide-gray-50">{children}</View>
    </View>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start justify-between px-4 py-2.5 border-t border-gray-50">
      <Text className="text-gray-500 text-sm w-28 shrink-0">{label}</Text>
      <View className="flex-1 items-end">{children}</View>
    </View>
  )
}

function PartyCard({ label, profile, extra, statusIcon }: { label: string; profile: any; extra: string | null; statusIcon?: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
      <Text className="text-xs text-gray-400 mb-1">{label}</Text>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          {profile ? (
            <>
              <Text className="text-gray-900 font-semibold">{profile.full_name}</Text>
              <Text>
                {profile.jawatan ? <Text className="text-gray-500 text-xs">{profile.jawatan}</Text> : null} 
              </Text>
              {extra ? <Text className="text-green-700 text-xs mt-1">{extra}</Text> : null}
            </>
          ) : (
            <Text className="text-gray-400 text-sm">Not assigned</Text>
          )}
        </View>
        {statusIcon && <View className="mt-2 mb-6 justify-center">{statusIcon}</View>}
      </View>
    </View>
  )
}
