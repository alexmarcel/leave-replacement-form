'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import type { LeaveType } from '@/lib/types'
import { PlusCircle } from 'lucide-react'

const emptyForm = {
  name: '', description: '', max_days_per_year: '', requires_replacement: true, color_hex: '#6366F1', is_active: true,
}

export function LeaveTypesClient({ initialTypes }: { initialTypes: LeaveType[] }) {
  const [types, setTypes] = useState<LeaveType[]>(initialTypes)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(lt: LeaveType) {
    setEditing(lt)
    setForm({
      name: lt.name,
      description: lt.description ?? '',
      max_days_per_year: lt.max_days_per_year?.toString() ?? '',
      requires_replacement: lt.requires_replacement,
      color_hex: lt.color_hex,
      is_active: lt.is_active,
    })
    setDialogOpen(true)
  }

  function set(field: string, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const payload = {
      name: form.name,
      description: form.description || null,
      max_days_per_year: form.max_days_per_year ? parseInt(form.max_days_per_year) : null,
      requires_replacement: form.requires_replacement,
      color_hex: form.color_hex,
      is_active: form.is_active,
    }

    if (editing) {
      const { error } = await supabase.from('leave_types').update(payload).eq('id', editing.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      setTypes(prev => prev.map(t => t.id === editing.id ? { ...t, ...payload } : t))
      toast.success('Leave type updated')
    } else {
      const { data, error } = await supabase.from('leave_types').insert(payload).select().single()
      if (error) { toast.error(error.message); setLoading(false); return }
      setTypes(prev => [...prev, data as LeaveType].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Leave type created')
    }

    setLoading(false)
    setDialogOpen(false)
  }

  async function toggleActive(lt: LeaveType) {
    const supabase = createClient()
    const { error } = await supabase.from('leave_types').update({ is_active: !lt.is_active }).eq('id', lt.id)
    if (error) { toast.error(error.message); return }
    setTypes(prev => prev.map(t => t.id === lt.id ? { ...t, is_active: !t.is_active } : t))
    toast.success(`${lt.name} ${!lt.is_active ? 'activated' : 'deactivated'}`)
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate}><PlusCircle className="h-4 w-4 mr-2" /> Add Leave Type</Button>
      </div>

      <div className="rounded-lg border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colour</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Max Days/Year</TableHead>
              <TableHead>Replacement Required</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map(lt => (
              <TableRow key={lt.id} className={!lt.is_active ? 'opacity-50' : ''}>
                <TableCell>
                  <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: lt.color_hex }} />
                </TableCell>
                <TableCell className="font-medium">{lt.name}</TableCell>
                <TableCell className="text-muted-foreground">{lt.max_days_per_year ?? 'Unlimited'}</TableCell>
                <TableCell>
                  <Badge variant={lt.requires_replacement ? 'default' : 'secondary'} className="text-xs">
                    {lt.requires_replacement ? 'Yes' : 'No'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={lt.is_active ? 'default' : 'secondary'} className={`text-xs ${lt.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {lt.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(lt)}>Edit</Button>
                  <Button size="sm" variant={lt.is_active ? 'destructive' : 'secondary'} onClick={() => toggleActive(lt)}>
                    {lt.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Max Days / Year</Label>
                <Input type="number" min="1" value={form.max_days_per_year} onChange={e => set('max_days_per_year', e.target.value)} placeholder="Unlimited" />
              </div>
              <div className="space-y-1.5">
                <Label>Colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.color_hex} onChange={e => set('color_hex', e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                  <Input value={form.color_hex} onChange={e => set('color_hex', e.target.value)} className="font-mono text-sm" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Replacement Required</Label>
              <Switch checked={form.requires_replacement} onCheckedChange={v => set('requires_replacement', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
