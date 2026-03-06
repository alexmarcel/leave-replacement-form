import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/auth'
import { LogOut, User, Mail, Phone, Briefcase, Building2 } from 'lucide-react-native'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  if (!profile) return null

  const roleLabel: Record<string, string> = { admin: 'Administrator', approver: 'Approver', staff: 'Staff' }
  const roleBg: Record<string, string> = { admin: 'bg-purple-100', approver: 'bg-blue-100', staff: 'bg-gray-100' }
  const roleText: Record<string, string> = { admin: 'text-purple-800', approver: 'text-blue-800', staff: 'text-gray-700' }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-4 pb-5 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Profile</Text>
      </View>

      <View className="px-5 py-6">
        {/* Avatar + name */}
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-emerald-100 items-center justify-center mb-3">
            <Text className="text-3xl font-bold text-emerald-600">{profile.full_name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text className="text-xl font-bold text-gray-900">{profile.full_name}</Text>
          <View className={`mt-2 px-3 py-1 rounded-full ${roleBg[profile.role]}`}>
            <Text className={`text-xs font-medium ${roleText[profile.role]}`}>{roleLabel[profile.role]}</Text>
          </View>
        </View>

        {/* Details card */}
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <ProfileRow icon={<Mail size={16} color="#6b7280" />} label="Email" value={profile.email} />
          {profile.phone ? <ProfileRow icon={<Phone size={16} color="#6b7280" />} label="Phone" value={profile.phone} /> : null}
          {profile.jawatan ? <ProfileRow icon={<Briefcase size={16} color="#6b7280" />} label="Jawatan" value={profile.jawatan} /> : null}
          {profile.department ? <ProfileRow icon={<Building2 size={16} color="#6b7280" />} label="Department" value={profile.department} /> : null}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          className="mt-6 bg-white rounded-2xl border border-red-200 px-5 py-4 flex-row items-center gap-3"
          onPress={handleSignOut}
        >
          <LogOut size={18} color="#dc2626" />
          <Text className="text-red-600 font-medium">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-row items-center px-4 py-3.5 border-b border-gray-50 last:border-b-0 gap-3">
      {icon}
      <View className="flex-1">
        <Text className="text-xs text-gray-400">{label}</Text>
        <Text className="text-gray-900 text-sm font-medium mt-0.5">{value}</Text>
      </View>
    </View>
  )
}
