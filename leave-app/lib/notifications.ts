/**
 * Send a push notification via the Expo Push API.
 * Called from the mobile app directly (not a server).
 */
export async function sendPushNotification(token: string, title: string, body: string) {
  if (!token.startsWith('ExponentPushToken')) return
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({ to: token, title, body, sound: 'default' }),
    })
  } catch {
    // Best effort — don't crash the app if push fails
  }
}
