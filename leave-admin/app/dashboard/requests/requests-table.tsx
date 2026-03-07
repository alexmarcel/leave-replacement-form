'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  requests: any[]
  statusTabs: { value: string; label: string }[]
  activeStatus: string
}

export function RequestsTable({ requests, statusTabs, activeStatus }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = requests.filter(r => {
    const q = search.toLowerCase()
    return (
      r.requester?.full_name?.toLowerCase().includes(q) ||
      r.leave_type?.name?.toLowerCase().includes(q) ||
      r.requester?.department?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {statusTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => router.push(`/dashboard/requests?status=${tab.value}`)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeStatus === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name, department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requester</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No requests found.
                </TableCell>
              </TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  <p className="font-medium text-sm">{r.requester?.full_name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{r.requester?.department ?? ''}</p>
                </TableCell>
                <TableCell className="text-sm">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: r.leave_type?.color_hex ?? '#888' }}
                  />
                  {r.leave_type?.name ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(r.start_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(r.end_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                </TableCell>
                <TableCell className="text-sm">{r.total_days}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/requests/${r.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
