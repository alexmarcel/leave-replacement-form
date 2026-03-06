export type Role = 'admin' | 'approver' | 'staff'

export type LeaveStatus =
  | 'draft'
  | 'pending_replacement'
  | 'replacement_rejected'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export type ReplacementResponse = 'pending' | 'agreed' | 'rejected'
export type ApproverResponse = 'pending' | 'approved' | 'rejected'

export type NotificationType =
  | 'replacement_requested'
  | 'replacement_agreed'
  | 'replacement_rejected'
  | 'approval_requested'
  | 'request_approved'
  | 'request_rejected'
  | 'request_cancelled'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: Role
  department: string | null
  jawatan: string | null
  is_active: boolean
  avatar_url: string | null
  expo_push_token: string | null
  created_at: string
  updated_at: string
}

export interface LeaveType {
  id: string
  name: string
  description: string | null
  max_days_per_year: number | null
  requires_replacement: boolean
  color_hex: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PublicHoliday {
  id: string
  name: string
  date: string
  created_at: string
}

export interface LeaveRequest {
  id: string
  requester_id: string
  replacement_id: string | null
  approver_id: string | null
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  reason: string | null
  attachment_url: string | null
  status: LeaveStatus
  replacement_response: ReplacementResponse | null
  replacement_responded_at: string | null
  replacement_notes: string | null
  approver_response: ApproverResponse | null
  approver_responded_at: string | null
  approver_notes: string | null
  created_at: string
  updated_at: string
  // Joined fields
  requester?: Profile
  replacement?: Profile
  approver?: Profile
  leave_type?: LeaveType
}

export interface LeaveAuditLog {
  id: string
  leave_request_id: string
  changed_by: string | null
  old_status: string | null
  new_status: string
  notes: string | null
  created_at: string
  changer?: Profile
}

export interface SystemSettings {
  id: number
  allow_multiple_replacements: boolean
  updated_at: string
  updated_by: string | null
}

export interface StaffOnLeaveToday {
  staff_id: string
  full_name: string
  department: string | null
  jawatan: string | null
  leave_request_id: string
  leave_type: string
  color_hex: string
  start_date: string
  end_date: string
  total_days: number
}
