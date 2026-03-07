'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Profile, Role } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Profile | null
  onSaved: (profile: Profile, isNew: boolean) => void
}

const emptyForm = {
  full_name: '', email: '', phone: '', jawatan: '', department: '', role: 'staff' as Role, password: '', newPassword: '',
}

export function StaffFormDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        full_name: editing.full_name,
        email: editing.email,
        phone: editing.phone ?? '',
        jawatan: editing.jawatan ?? '',
        department: editing.department ?? '',
        role: editing.role,
        password: '',
        newPassword: '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [editing, open])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (editing) {
      // Update existing profile
      const res = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          jawatan: form.jawatan || null,
          department: form.department || null,
          role: form.role,
          newPassword: form.newPassword || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to update')
        setLoading(false)
        return
      }
      onSaved({ ...editing, ...form, phone: form.phone || null, jawatan: form.jawatan || null, department: form.department || null }, false)
      toast.success('Staff updated')
    } else {
      // Create new account
      if (!form.password) {
        toast.error('Password is required')
        setLoading(false)
        return
      }
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to create')
        setLoading(false)
        return
      }
      // Fetch the newly created profile
      const supabase = createClient()
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.id).single()
      if (profile) onSaved(profile as Profile, true)
      toast.success('Staff account created')
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Staff' : 'Add Staff'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0123456789" />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v => set('role', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jawatan</Label>
              <Input value={form.jawatan} onChange={e => set('jawatan', e.target.value)} placeholder="Pegawai Tadbir" />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Kewangan" />
            </div>
            {!editing ? (
              <div className="col-span-2 space-y-1.5">
                <Label>Temporary Password *</Label>
                <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} required />
              </div>
            ) : (
              <div className="col-span-2 space-y-1.5">
                <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
                <Input type="password" value={form.newPassword} onChange={e => set('newPassword', e.target.value)} placeholder="Min. 6 characters" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
