import { Tabs } from 'expo-router'
import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { Home, FileText, CalendarDays, Bell, User } from 'lucide-react-native'

export default function TabLayout() {
  const { session } = useAuth()
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    registerForPushNotifications()
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {})
    return () => {
      notificationListener.current?.remove()
    }
  }, [])

  async function registerForPushNotifications() {
    if (!Device.isDevice) return
    try {
      const { status: existing } = await Notifications.getPermissionsAsync()
      let finalStatus = existing
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') return
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        })
      }
      const { data: token } = await Notifications.getExpoPushTokenAsync()
      if (token && session?.user.id) {
        await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', session.user.id)
      }
    } catch {
      // Push notifications not supported in Expo Go on Android (SDK 53+)
    }
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Requests', tabBarIcon: ({ color }) => <FileText size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Notifications', tabBarIcon: ({ color }) => <Bell size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} /> }}
      />
    </Tabs>
  )
}
