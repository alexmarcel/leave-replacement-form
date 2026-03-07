import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/auth'
import { supabase } from '@/lib/supabase'
import { LogOut, Mail, Phone, Briefcase, Building2 } from 'lucide-react-native'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()

  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [savingPhone, setSavingPhone] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setPhone(profile?.phone ?? '')
  }, [profile?.phone])

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  async function handleSavePhone() {
    setSavingPhone(true)
    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone.trim() || null })
      .eq('id', profile!.id)
    setSavingPhone(false)
    if (error) Alert.alert('Error', error.message)
    else Alert.alert('Saved', 'Phone number updated.')
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match.'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setNewPassword('')
      setConfirmPassword('')
      Alert.alert('Success', 'Password changed successfully.')
    }
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

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Name + role */}
        <View className="items-center mb-6">
          <Text className="text-xl font-bold text-gray-900">{profile.full_name}</Text>
          <View className={`mt-2 px-3 py-1 rounded-full ${roleBg[profile.role]}`}>
            <Text className={`text-xs font-medium ${roleText[profile.role]}`}>{roleLabel[profile.role]}</Text>
          </View>
        </View>

        {/* Details card */}
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
          <ProfileRow icon={<Mail size={16} color="#6b7280" />} label="Email" value={profile.email} />
          {profile.phone ? <ProfileRow icon={<Phone size={16} color="#6b7280" />} label="Phone" value={profile.phone} /> : null}
          {profile.jawatan ? <ProfileRow icon={<Briefcase size={16} color="#6b7280" />} label="Jawatan" value={profile.jawatan} /> : null}
          {profile.department ? <ProfileRow icon={<Building2 size={16} color="#6b7280" />} label="Department" value={profile.department} /> : null}
        </View>

        {/* Edit phone */}
        <View className="bg-white rounded-2xl border border-gray-100 px-4 py-4 mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Edit Phone Number</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm bg-gray-50 mb-3"
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 0123456789"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            className={`rounded-xl py-2.5 items-center ${savingPhone ? 'bg-emerald-300' : 'bg-emerald-600'}`}
            onPress={handleSavePhone}
            disabled={savingPhone}
          >
            {savingPhone
              ? <ActivityIndicator color="white" />
              : <Text className="text-white font-semibold text-sm">Save Phone</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Change password */}
        <View className="bg-white rounded-2xl border border-gray-100 px-4 py-4 mb-6">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Change Password</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm bg-gray-50 mb-2"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password (min. 6 characters)"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm bg-gray-50 mb-3"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />
          <TouchableOpacity
            className={`rounded-xl py-2.5 items-center ${savingPassword ? 'bg-emerald-300' : 'bg-emerald-600'}`}
            onPress={handleChangePassword}
            disabled={savingPassword}
          >
            {savingPassword
              ? <ActivityIndicator color="white" />
              : <Text className="text-white font-semibold text-sm">Change Password</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          className="bg-white rounded-2xl border border-red-200 px-5 py-4 flex-row items-center gap-3"
          onPress={handleSignOut}
        >
          <LogOut size={18} color="#dc2626" />
          <Text className="text-red-600 font-medium">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
