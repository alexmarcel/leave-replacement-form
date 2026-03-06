'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PublicHoliday } from '@/lib/types'
import { PlusCircle, Trash2 } from 'lucide-react'

export function HolidaysClient({ initialHolidays }: { initialHolidays: PublicHoliday[] }) {
  const [holidays, setHolidays] = useState<PublicHoliday[]>(initialHolidays)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null)
  const [form, setForm] = useState({ name: '', date: '' })
  const [loading, setLoading] = useState(false)

  // Group by year
  const grouped = holidays.reduce<Record<number, PublicHoliday[]>>((acc, h) => {
    const year = new Date(h.date).getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(h)
    return acc
  }, {})
  const years = Object.keys(grouped).map(Number).sort((a, b) => b - a)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('public_holidays')
      .insert({ name: form.name, date: form.date })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
    } else {
      setHolidays(prev => [...prev, data as PublicHoliday].sort((a, b) => a.date.localeCompare(b.date)))
      toast.success('Holiday added')
      setDialogOpen(false)
      setForm({ name: '', date: '' })
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const supabase = createClient()
    const { error } = await supabase.from('public_holidays').delete().eq('id', deleteTarget.id)
    if (error) {
      toast.error(error.message)
    } else {
      setHolidays(prev => prev.filter(h => h.id !== deleteTarget.id))
      toast.success('Holiday removed')
    }
    setDeleteTarget(null)
  }

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    weekday: 'short', day: 'numeric', month: 'long',
  })

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}><PlusCircle className="h-4 w-4 mr-2" /> Add Holiday</Button>
      </div>

      {years.length === 0 ? (
        <p className="text-muted-foreground text-sm">No public holidays added yet.</p>
      ) : years.map(year => (
        <div key={year} className="space-y-2">
          <h2 className="text-lg font-semibold">{year}</h2>
          <div className="rounded-lg border bg-background divide-y">
            {grouped[year].map(h => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(h.date)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(h)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Public Holiday</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Hari Raya Aidilfitri" required />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.date}) from the holiday list? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
