import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
      <Toaster richColors />
    </div>
  )
}
