import { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  leave_request_id: string | null
}

export default function NotificationsScreen() {
  const { profile } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications((data ?? []) as Notification[])
    setLoading(false)
    setRefreshing(false)
  }, [profile])

  useFocusEffect(useCallback(() => { loadNotifications() }, [loadNotifications]))
  function onRefresh() { setRefreshing(true); loadNotifications() }

  async function handleTap(n: Notification) {
    // Mark as read
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    if (n.leave_request_id) {
      router.push(`/request/${n.leave_request_id}`)
    }
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profile!.id)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const typeIcon: Record<string, string> = {
    replacement_requested: '🔔',
    replacement_agreed: '✅',
    replacement_rejected: '❌',
    approval_requested: '📋',
    request_approved: '✅',
    request_rejected: '❌',
    request_cancelled: '🚫',
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-bold text-gray-900">Notifications</Text>
          {unreadCount > 0 && (
            <Text className="text-xs text-emerald-700 mt-0.5">{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} className="px-3 py-1.5 bg-emerald-50 rounded-full">
            <Text className="text-xs text-emerald-700 font-medium">Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingVertical: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-sm">No notifications yet.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View className="h-px bg-gray-100 mx-5" />}
          renderItem={({ item: n }) => (
            <TouchableOpacity
              className={`px-5 py-4 flex-row gap-3 ${!n.is_read ? 'bg-emerald-50/60' : 'bg-white'}`}
              onPress={() => handleTap(n)}
            >
              <Text className="text-xl mt-0.5">{typeIcon[n.type] ?? '🔔'}</Text>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className={`text-sm font-semibold ${!n.is_read ? 'text-gray-900' : 'text-gray-700'}`}>{n.title}</Text>
                  {!n.is_read && <View className="w-2 h-2 rounded-full bg-emerald-500" />}
                </View>
                {n.body ? <Text className="text-gray-500 text-xs mt-0.5 leading-4">{n.body}</Text> : null}
                <Text className="text-gray-400 text-xs mt-1">{new Date(n.created_at).toLocaleString()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
