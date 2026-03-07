import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { Tent, TentTree, Trees } from 'lucide-react-native'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) { setError('Please enter email and password.'); return }
    setError('')
    setLoading(true)
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (e) setError(e.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-top px-6 mt-20 py-12">
          {/* Header */}
          <View className="mb-10">
            <View className="flex-row items-end gap-1 mb-4">
              <View className="w-14 h-14 rounded-2xl bg-emerald-600 items-center justify-center">
                <TentTree size={28} color="white" />
              </View>
            </View>
            <Text className="text-3xl font-bold text-gray-900">Welcome back</Text>
            <Text className="text-gray-500 mt-1">Sign in to your account</Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5 mt-4">Email</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-gray-900 bg-gray-50"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5 mt-4">Password</Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 mb-4 text-gray-900 bg-gray-50"
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {error ? (
              <View className="bg-red-50 rounded-xl px-4 py-3">
                <Text className="text-red-700 text-sm">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              className="bg-emerald-600 rounded-xl py-3.5 items-center mt-2"
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Sign In</Text>
              }
            </TouchableOpacity>
            
            <View className="flex-1 bg-gray-900 p-6">
  
            {/* TOP CONTENT: Your header, forms, or buttons go here */}
            <View>
              <Text className="text-white text-2xl"></Text>
            </View>

            {/* FOOTER: mt-auto pushes this entire block to the bottom */}
            <View className="mt-auto pb-4">
              <Text className="text-sm text-gray-200 mb-1 text-left">
                Sistem Automasi Mohon Staf Izin Ambil Holiday (SAMSIAH)
              </Text>
              <Text className="text-sm text-gray-200 text-left">
                © 2026 ILKKM Tawau
              </Text>
            </View>
  
</View>

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
