'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StaffFormDialog } from './staff-form-dialog'
import type { Profile } from '@/lib/types'
import { PlusCircle, Search } from 'lucide-react'

export function StaffTable({ initialStaff }: { initialStaff: Profile[] }) {
  const [staff, setStaff] = useState<Profile[]>(initialStaff)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)

  const filtered = staff.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email.toLowerCase().includes(search.toLowerCase())) ||
    (s.department?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  async function handleToggleActive(member: Profile) {
    const res = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id, is_active: !member.is_active }),
    })
    if (!res.ok) {
      toast.error('Failed to update staff status')
      return
    }
    setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: !s.is_active } : s))
    toast.success(`${member.full_name} ${!member.is_active ? 'activated' : 'deactivated'}`)
  }

  function handleSaved(saved: Profile, isNew: boolean) {
    if (isNew) {
      setStaff(prev => [saved, ...prev].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    } else {
      setStaff(prev => prev.map(s => s.id === saved.id ? saved : s))
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const roleBadgeClass: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800',
    approver: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-700',
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, department…"
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <PlusCircle className="h-4 w-4 mr-2" /> Add Staff
        </Button>
      </div>

      <div className="rounded-lg border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Jawatan</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No staff found.
                </TableCell>
              </TableRow>
            ) : filtered.map(member => (
              <TableRow key={member.id} className={!member.is_active ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{member.full_name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{member.email}</TableCell>
                <TableCell className="text-sm">{member.jawatan ?? '—'}</TableCell>
                <TableCell className="text-sm">{member.department ?? '—'}</TableCell>
                <TableCell>
                  <Badge className={`text-xs ${roleBadgeClass[member.role] ?? ''}`} variant="outline">
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={member.is_active ? 'default' : 'secondary'} className={`text-xs ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {member.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditing(member); setDialogOpen(true) }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={member.is_active ? 'destructive' : 'secondary'}
                    onClick={() => handleToggleActive(member)}
                  >
                    {member.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <StaffFormDialog
        open={dialogOpen}
        onOpenChange={open => { setDialogOpen(open); if (!open) setEditing(null) }}
        editing={editing}
        onSaved={handleSaved}
      />
    </>
  )
}
