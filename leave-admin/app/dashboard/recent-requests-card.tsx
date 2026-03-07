import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

export function RecentRequestsCard({ requests }: { requests: any[] }) {
  const slice = requests.slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Requests</CardTitle>
      </CardHeader>
      <CardContent className="p-0 mx-5">
        {!requests.length ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">No requests yet.</p>
        ) : (
          <>
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requester</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.map((r: any) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          <p className="font-medium text-sm">{r.requester?.full_name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{r.requester?.department ?? ''}</p>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={`/dashboard/requests/${r.id}`} className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.leave_type?.color_hex ?? '#888' }} />
                          {r.leave_type?.name ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          {fmtDate(r.start_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          {fmtDate(r.end_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          {r.total_days}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          {r.created_at ? fmtDateTime(r.created_at) : '—'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/requests/${r.id}`} className="block">
                          <StatusBadge status={r.status} />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="px-0 py-3 border-t">
              <Button variant="outline" size="sm" className="w-full p-5" asChild>
                <Link href="/dashboard/requests">View all requests</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
