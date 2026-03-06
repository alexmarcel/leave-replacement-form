import { Stack } from 'expo-router'
import { ApplyProvider } from '@/context/apply'

export default function ApplyLayout() {
  return (
    <ApplyProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ApplyProvider>
  )
}
