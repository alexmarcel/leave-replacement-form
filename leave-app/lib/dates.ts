import { eachDayOfInterval, isWeekend, parseISO, format } from 'date-fns'

/**
 * Calculate working days between two dates, excluding weekends and public holidays.
 */
export function calcWorkingDays(startDate: string, endDate: string, holidays: string[]): number {
  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  return days.filter(d => {
    if (isWeekend(d)) return false
    if (holidays.includes(format(d, 'yyyy-MM-dd'))) return false
    return true
  }).length
}

export function formatDate(date: string): string {
  return format(parseISO(date), 'd MMM yyyy')
}

export function formatDateWithDay(date: string): string {
  return format(parseISO(date), 'EEEE, d MMM yyyy')
}

export function formatDateShort(date: string): string {
  return format(parseISO(date), 'd MMM')
}
