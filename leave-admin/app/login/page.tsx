import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
