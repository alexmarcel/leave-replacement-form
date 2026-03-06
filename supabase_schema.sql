-- ============================================================
-- LEAVE MANAGEMENT SYSTEM -- SUPABASE SCHEMA
-- ============================================================
-- HOW TO RUN:
--   Supabase Dashboard > SQL Editor > New Query > Paste > Run
--
-- SYSTEM OVERVIEW:
--   Three types of users:
--     admin    -> manages everything via Next.js dashboard
--     approver -> Staff C, approves or rejects leave requests
--     staff    -> regular employee, applies for leave via mobile app
--
-- WORKFLOW SUMMARY:
--   1. Admin creates staff accounts and configures the system
--   2. Staff A applies for leave on the mobile app
--   3. Staff A picks Staff B as replacement and Staff C as approver
--   4. Staff B receives a push notification and agrees or rejects
--   5. If agreed, Staff C receives a push notification
--   6. Staff C approves or rejects the request
--   7. Everyone is notified of the final outcome
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

-- pgcrypto provides gen_random_uuid() used for all primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- TABLE 1: SYSTEM SETTINGS
--
-- WORKFLOW ROLE:
--   Admin configures this once via the Next.js dashboard.
--   The single most important setting is allow_multiple_replacements
--   which controls how the replacement picker works in the mobile app.
--
--   When Staff A opens the replacement picker, the app calls
--   get_available_replacements() which reads this setting to decide
--   whether to filter out staff who are already covering someone else.
--
-- IMPORTANT: This table always has exactly ONE row (id = 1).
--   Always query with: WHERE id = 1
--   Never insert a second row -- the single_row constraint prevents it.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id                          INT         PRIMARY KEY DEFAULT 1,

  allow_multiple_replacements BOOLEAN     NOT NULL DEFAULT FALSE,
  -- FALSE (One-to-One mode):
  --   A staff member can only be nominated as replacement for
  --   ONE active leave request at a time. If Staff B is already
  --   covering someone during the same period, they will NOT
  --   appear in Staff A's replacement picker.
  --
  -- TRUE (One-to-Many mode):
  --   A staff member can cover multiple people simultaneously.
  --   Staff B will still appear in the picker even if they are
  --   already assigned as a replacement for another request.
  --   They will only be excluded if they themselves are on approved leave.

  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Records which admin last changed the settings

  CONSTRAINT single_row CHECK (id = 1)
  -- Prevents anyone from inserting a second row
);

COMMENT ON TABLE  public.system_settings IS
  'Global system configuration. Always has exactly one row (id = 1).';
COMMENT ON COLUMN public.system_settings.allow_multiple_replacements IS
  'FALSE = One-to-One: a staff can only cover one active request at a time. TRUE = One-to-Many: no limit.';

-- Seed the one and only settings row on first run
INSERT INTO public.system_settings (id, allow_multiple_replacements)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- TABLE 2: PROFILES
--
-- WORKFLOW ROLE:
--   Every user in the system has a profile row here.
--   This table extends Supabase's built-in auth.users table.
--
--   HOW A PROFILE IS CREATED:
--     Admin calls supabase.auth.admin.createUser() from the
--     Next.js dashboard. This creates a row in auth.users.
--     The handle_new_user trigger (defined below) then
--     automatically inserts a row here using the metadata
--     passed by admin (full_name, role, phone, jawatan, department).
--
--   MOBILE APP LOGIN:
--     On first login, the Expo app registers the device and
--     saves the Expo Push Token to expo_push_token. This token
--     is used to send push notifications to this specific device.
--     If a staff member logs in on a new device, the token is
--     overwritten with the new device's token.
--
--   ROLES:
--     admin    -> can only access the Next.js dashboard
--     approver -> Staff C in the workflow; uses the mobile app
--     staff    -> regular employee; uses the mobile app
--
--   DEACTIVATION:
--     Setting is_active = FALSE prevents the staff member from:
--     - logging in to the mobile app
--     - appearing in the replacement picker
--     (done by admin via the dashboard, not by deleting the row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Links to Supabase Auth. Deleting the auth user cascades here.

  full_name       TEXT        NOT NULL,
  email           TEXT        NOT NULL UNIQUE,
  phone           TEXT,
  -- Required for contact; shown in the admin dashboard staff list

  role            TEXT        NOT NULL DEFAULT 'staff'
                                CHECK (role IN ('admin', 'approver', 'staff')),
  department      TEXT,
  jawatan         TEXT,
  -- Job title / position in Malay (e.g. Pegawai Tadbir, Jurutera)

  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- FALSE = cannot log in, hidden from replacement picker

  avatar_url      TEXT,
  expo_push_token TEXT,
  -- Saved by the mobile app on first login.
  -- Used by the app to call the Expo Push API when sending notifications.
  -- Format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles                 IS 'User profiles. Extends Supabase Auth. One row per user.';
COMMENT ON COLUMN public.profiles.role            IS 'admin = Next.js dashboard only | approver = Staff C | staff = regular employee.';
COMMENT ON COLUMN public.profiles.jawatan         IS 'Job title in Malay. e.g. Pegawai Tadbir, Jurutera.';
COMMENT ON COLUMN public.profiles.is_active       IS 'FALSE = cannot log in and hidden from replacement picker.';
COMMENT ON COLUMN public.profiles.expo_push_token IS 'Saved on first app login. Used to deliver push notifications via Expo Push API.';


-- ============================================================
-- TABLE 3: LEAVE TYPES
--
-- WORKFLOW ROLE:
--   Admin creates and manages leave types via the dashboard.
--   When Staff A fills in the leave form on the mobile app,
--   they pick from this list.
--
--   requires_replacement controls whether Staff A must nominate
--   a replacement before they can submit the request:
--     TRUE  -> Staff A must go through the full workflow
--              (pick replacement -> pick approver -> submit)
--     FALSE -> Staff A can skip the replacement step and submit
--              directly to Staff C for approval
--              (e.g. Sick Leave -- you don't plan to be sick)
--
--   color_hex is used in the mobile app's leave schedule/calendar
--   to colour-code each leave type visually.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_types (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL UNIQUE,
  description          TEXT,

  max_days_per_year    INT,
  -- NULL means unlimited days allowed per year.
  -- This is informational only -- the system does not enforce it
  -- automatically. Admin can see usage via the leave_statistics view.

  requires_replacement BOOLEAN     NOT NULL DEFAULT TRUE,
  -- TRUE  -> replacement nomination is mandatory (Annual Leave, Unpaid Leave)
  -- FALSE -> replacement can be skipped (Sick Leave, Emergency Leave)

  color_hex            TEXT        NOT NULL DEFAULT '#6366F1',
  -- Hex colour code shown in the mobile app schedule calendar.
  -- e.g. '#6366F1' = indigo, '#EF4444' = red, '#F97316' = orange

  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  -- FALSE = hidden from the leave type picker in the mobile app

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.leave_types                      IS 'Leave types configured by admin. Shown in the mobile app leave form.';
COMMENT ON COLUMN public.leave_types.requires_replacement IS 'TRUE = replacement must be nominated before submitting. FALSE = can skip replacement step.';
COMMENT ON COLUMN public.leave_types.color_hex            IS 'Hex colour shown in the mobile app schedule/calendar view.';

-- Default leave types seeded on first run
INSERT INTO public.leave_types (name, description, max_days_per_year, requires_replacement, color_hex)
VALUES
  ('Annual Leave',    'Yearly paid leave entitlement',     14,   TRUE,  '#6366F1'),
  ('Sick Leave',      'Medical or health-related absence', 14,   FALSE, '#EF4444'),
  ('Emergency Leave', 'Urgent personal or family matters', 3,    FALSE, '#F97316'),
  ('Unpaid Leave',    'Leave without pay',                 NULL, TRUE,  '#6B7280'),
  ('Maternity Leave', 'Maternity leave entitlement',       60,   FALSE, '#EC4899'),
  ('Paternity Leave', 'Paternity leave entitlement',       7,    FALSE, '#3B82F6')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- TABLE 4: PUBLIC HOLIDAYS
--
-- WORKFLOW ROLE:
--   Admin adds public holidays via the Next.js dashboard.
--   These dates are used in TWO places:
--
--   1. TOTAL DAYS CALCULATION (mobile app):
--      When Staff A picks start and end dates on the leave form,
--      the app fetches this table and excludes both weekends and
--      public holidays when calculating total_days.
--      e.g. A leave from Mon-Fri spanning a public holiday on Wed
--      counts as 4 working days, not 5.
--
--   2. REPLACEMENT AVAILABILITY CHECK (get_available_replacements):
--      The function checks that the requested date range contains
--      at least one working day. If the entire range falls on
--      weekends or public holidays, no replacement is needed.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  -- Display name e.g. "Hari Raya Aidilfitri", "Malaysia Day"

  date       DATE        NOT NULL UNIQUE,
  -- Unique constraint prevents duplicate entries for the same date

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.public_holidays IS
  'Public holidays. Excluded from total_days calculation and replacement availability check.';


-- ============================================================
-- TABLE 5: LEAVE REQUESTS
--
-- WORKFLOW ROLE:
--   This is the core table of the entire system.
--   Every leave application is one row here.
--   The status column drives the entire workflow state machine.
--
-- THE COMPLETE WORKFLOW:
--
--   STEP 1 -- Staff A creates a draft
--     status = 'draft'
--     Staff A fills in leave type, dates, reason on the mobile app.
--     The row is saved but not yet sent to anyone.
--     Staff A can edit or discard at this stage.
--
--   STEP 2 -- Staff A picks replacement and submits
--     status = 'pending_replacement'
--     Staff A calls get_available_replacements() to get eligible staff.
--     Staff A picks Staff B (replacement) and Staff C (approver).
--     Staff A taps Submit.
--     replacement_id and approver_id are saved to this row.
--     replacement_response is set to 'pending'.
--     A push notification is sent to Staff B's device.
--     A row is inserted into notifications for Staff B.
--
--   STEP 3a -- Staff B rejects
--     status = 'replacement_rejected'
--     replacement_response = 'rejected'
--     replacement_responded_at = now()
--     replacement_notes = Staff B's reason (optional)
--     A push notification is sent back to Staff A.
--     Staff A must go back and pick a different replacement.
--     The replacement_id is cleared so Staff A can pick again.
--
--   STEP 3b -- Staff B agrees
--     status = 'pending_approval'
--     replacement_response = 'agreed'
--     replacement_responded_at = now()
--     A push notification is sent to Staff C's device.
--     A row is inserted into notifications for Staff C.
--
--   STEP 4a -- Staff C rejects
--     status = 'rejected'
--     approver_response = 'rejected'
--     approver_responded_at = now()
--     approver_notes = Staff C's reason (optional)
--     A push notification is sent to Staff A.
--
--   STEP 4b -- Staff C approves
--     status = 'approved'
--     approver_response = 'approved'
--     approver_responded_at = now()
--     Push notifications sent to both Staff A and Staff B.
--     The leave now appears in the schedule calendar for everyone.
--
--   CANCELLATION (any step before approved):
--     status = 'cancelled'
--     Staff A can cancel while status is:
--       draft, pending_replacement, replacement_rejected, pending_approval
--     Push notifications sent to Staff B and Staff C to inform them.
--
--   ADMIN OVERRIDE (Next.js dashboard):
--     Admin can force any status change from the request detail page.
--     This bypasses the normal workflow. The audit log records it.
--
-- STATUS MACHINE DIAGRAM:
--
--   [draft]
--      |-- Staff A submits
--      v
--   [pending_replacement]
--      |-- Staff B rejects --> [replacement_rejected] --> Staff A picks again
--      |-- Staff B agrees
--      v
--   [pending_approval]
--      |-- Staff C rejects --> [rejected]
--      |-- Staff C approves
--      v
--   [approved]
--
--   Any state before approved --> [cancelled] (Staff A cancels)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- THE THREE PARTIES ------------------------------------------

  requester_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Staff A: the person applying for leave.
  -- ON DELETE RESTRICT prevents deleting a staff profile that has leave requests.

  replacement_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Staff B: the nominated replacement.
  -- Set when Staff A submits (status -> pending_replacement).
  -- Cleared (SET NULL) if Staff B's profile is deleted.
  -- NULL when leave type does not require a replacement.

  approver_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Staff C: the approver (must have role = 'approver').
  -- Set when Staff A submits.
  -- Cleared (SET NULL) if Staff C's profile is deleted.

  -- LEAVE DETAILS -----------------------------------------------

  leave_type_id  UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  -- Links to the leave type chosen by Staff A.

  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,

  total_days     INT  NOT NULL CHECK (total_days > 0),
  -- Working days only. Calculated by the mobile app at submission time.
  -- Excludes: Saturdays, Sundays, and dates in public_holidays.

  reason         TEXT,
  -- Optional written reason from Staff A.

  attachment_url TEXT,
  -- Optional URL to a supporting document (e.g. medical cert).
  -- Stored in Supabase Storage; URL saved here.

  -- WORKFLOW STATUS ---------------------------------------------

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',               -- Created, not yet submitted
      'pending_replacement', -- Waiting for Staff B to respond
      'replacement_rejected',-- Staff B declined; Staff A must pick again
      'pending_approval',    -- Staff B agreed; waiting for Staff C
      'approved',            -- Staff C approved; leave is confirmed
      'rejected',            -- Staff C rejected the request
      'cancelled'            -- Staff A cancelled before final decision
    )),

  -- STAFF B (REPLACEMENT) RESPONSE -----------------------------

  replacement_response     TEXT CHECK (replacement_response IN ('pending', 'agreed', 'rejected')),
  -- Set to 'pending' when request is submitted to Staff B.
  -- Updated to 'agreed' or 'rejected' when Staff B responds.

  replacement_responded_at TIMESTAMPTZ,
  -- Timestamp of when Staff B tapped Agree or Reject.

  replacement_notes        TEXT,
  -- Optional message from Staff B explaining their decision.

  -- STAFF C (APPROVER) RESPONSE --------------------------------

  approver_response     TEXT CHECK (approver_response IN ('pending', 'approved', 'rejected')),
  -- Set to 'pending' when request reaches Staff C.
  -- Updated to 'approved' or 'rejected' when Staff C decides.

  approver_responded_at TIMESTAMPTZ,
  -- Timestamp of when Staff C tapped Approve or Reject.

  approver_notes        TEXT,
  -- Optional message from Staff C explaining their decision.
  -- Also used by admin override to record the reason.

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- updated_at is auto-stamped by the trg_leave_requests_updated_at trigger.

  -- INTEGRITY CONSTRAINTS --------------------------------------

  CONSTRAINT valid_date_range
    CHECK (end_date >= start_date),
  -- End date must be same day or after start date.

  CONSTRAINT requester_not_replacement
    CHECK (requester_id != replacement_id),
  -- Staff A cannot nominate themselves as their own replacement.

  CONSTRAINT requester_not_approver
    CHECK (requester_id != approver_id)
  -- Staff A cannot be their own approver.
);

COMMENT ON TABLE  public.leave_requests            IS 'Core leave request table. One row per application. status column drives the workflow.';
COMMENT ON COLUMN public.leave_requests.total_days IS 'Working days only. Excludes weekends and public holidays. Calculated by the mobile app.';
COMMENT ON COLUMN public.leave_requests.status     IS 'Workflow state. See table comment for full transition diagram.';

-- Indexes to speed up common queries
CREATE INDEX IF NOT EXISTS idx_lr_requester   ON public.leave_requests (requester_id);
-- Used when Staff A loads "My Requests" screen

CREATE INDEX IF NOT EXISTS idx_lr_replacement ON public.leave_requests (replacement_id);
-- Used when Staff B loads incoming replacement requests

CREATE INDEX IF NOT EXISTS idx_lr_approver    ON public.leave_requests (approver_id);
-- Used when Staff C loads pending approvals

CREATE INDEX IF NOT EXISTS idx_lr_status      ON public.leave_requests (status);
-- Used for filtering by status in admin dashboard

CREATE INDEX IF NOT EXISTS idx_lr_dates       ON public.leave_requests (start_date, end_date);
-- Used by the leave schedule calendar (day/week/month views)


-- ============================================================
-- TABLE 6: NOTIFICATIONS
--
-- WORKFLOW ROLE:
--   Every time the workflow advances, two things happen:
--     1. A row is inserted here (in-app notification log)
--     2. The app calls the Expo Push API to send a device notification
--
--   This table powers the in-app notification bell icon.
--   The mobile app subscribes to this table via Supabase Realtime
--   so new notifications appear instantly without polling.
--
--   NOTIFICATION TYPES AND WHEN THEY ARE SENT:
--     replacement_requested -> to Staff B when Staff A submits
--     replacement_agreed    -> to Staff A when Staff B agrees
--     replacement_rejected  -> to Staff A when Staff B rejects
--     approval_requested    -> to Staff C when Staff B agrees
--     request_approved      -> to Staff A and Staff B when Staff C approves
--     request_rejected      -> to Staff A when Staff C rejects
--     request_cancelled     -> to Staff B and Staff C when Staff A cancels
--
--   The leave_request_id links back to the request so tapping
--   the notification deep-links to that request's detail screen.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_id     UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The staff member who should see this notification.
  -- CASCADE deletes notifications if the user is deleted.

  leave_request_id UUID    REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  -- Links to the related leave request.
  -- SET NULL if the request is deleted (notification stays but link is gone).

  type             TEXT    NOT NULL
    CHECK (type IN (
      'replacement_requested', -- Staff B: "Ahmad wants you as replacement 3-7 Mac"
      'replacement_agreed',    -- Staff A: "Staff B agreed to cover you"
      'replacement_rejected',  -- Staff A: "Staff B declined. Please pick another replacement"
      'approval_requested',    -- Staff C: "Leave request from Ahmad needs your approval"
      'request_approved',      -- Staff A + B: "Your leave request has been approved"
      'request_rejected',      -- Staff A: "Your leave request was rejected"
      'request_cancelled'      -- Staff B + C: "Ahmad cancelled their leave request"
    )),

  title      TEXT    NOT NULL,
  -- Short notification title shown as the push notification headline.
  -- e.g. "Replacement Request", "Leave Approved"

  body       TEXT,
  -- Full notification message body.
  -- e.g. "Ahmad bin Ali is requesting you as replacement from 3 Mac to 7 Mac 2025"

  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  -- FALSE = unread (shown with a dot or badge in the app)
  -- TRUE  = staff has tapped/viewed the notification
  -- Updated by the app when the notification is opened.

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'In-app notification log. Powers the bell icon and Supabase Realtime feed. Expo Push sent separately by app.';

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON public.notifications (recipient_id, is_read, created_at DESC);
-- Optimises loading unread notifications for a specific user sorted by newest first


-- ============================================================
-- TABLE 7: AUDIT LOG
--
-- WORKFLOW ROLE:
--   Every time the status column on leave_requests changes,
--   the trg_leave_audit trigger automatically inserts a row here.
--
--   This table is APPEND-ONLY -- rows are never updated or deleted.
--   It provides a permanent, tamper-proof history of every status
--   change on every request, including who made the change and when.
--
--   Shown in the admin dashboard on the request detail page
--   as a visual timeline of the request's journey.
--
--   Examples of what gets recorded:
--     draft            -> pending_replacement  (Staff A submitted)
--     pending_replacement -> replacement_rejected (Staff B rejected)
--     replacement_rejected -> pending_replacement (Staff A resubmitted)
--     pending_replacement -> pending_approval   (Staff B agreed)
--     pending_approval -> approved              (Staff C approved)
--     pending_approval -> rejected              (Staff C rejected)
--     pending_approval -> cancelled             (Staff A cancelled)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  leave_request_id UUID        NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  -- Links to the request. CASCADE deletes audit rows if request is deleted.

  changed_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- The user who triggered the status change.
  -- NULL if changed by a system process.

  old_status       TEXT,
  -- The status before the change. NULL for the very first status set.

  new_status       TEXT        NOT NULL,
  -- The status after the change.

  notes            TEXT,
  -- Optional context. Used by admin override to record reason.

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Exact timestamp of when the status changed.
);

COMMENT ON TABLE public.leave_audit_log IS
  'Append-only audit trail. One row per status change. Written automatically by trigger.';

CREATE INDEX IF NOT EXISTS idx_audit_request ON public.leave_audit_log (leave_request_id, created_at DESC);
-- Optimises loading the audit timeline for a specific request


-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- ── TRIGGER 1: Auto-stamp updated_at ─────────────────────────
-- Fires BEFORE every UPDATE on profiles, leave_types, leave_requests.
-- Sets updated_at = NOW() automatically so the app never has to.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_leave_types_updated_at
  BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── TRIGGER 2: Auto-create profile on new auth user ──────────
-- Fires AFTER INSERT on auth.users.
-- When admin calls supabase.auth.admin.createUser() from the
-- Next.js dashboard, Supabase creates the auth.users row.
-- This trigger immediately creates the matching profiles row
-- using the metadata admin passed in user_metadata.
--
-- Admin should pass user_metadata like this:
--   {
--     full_name:  "Ahmad bin Ali",
--     role:       "staff",
--     phone:      "0123456789",
--     jawatan:    "Pegawai Tadbir",
--     department: "Kewangan"
--   }
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, phone, jawatan, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'jawatan',
    NEW.raw_user_meta_data->>'department'
  )
  ON CONFLICT (id) DO NOTHING;
  -- ON CONFLICT guard prevents duplicate inserts if trigger fires twice
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── TRIGGER 3: Write audit log on status change ───────────────
-- Fires AFTER every UPDATE on leave_requests.
-- If the status column changed, inserts one row into leave_audit_log.
-- Records who made the change (auth.uid()) and what the old/new status was.
-- This happens automatically -- the app never writes to audit log directly.
CREATE OR REPLACE FUNCTION public.log_leave_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- IS DISTINCT FROM handles NULL safely (unlike !=)
    INSERT INTO public.leave_audit_log (leave_request_id, changed_by, old_status, new_status)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_leave_audit
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_leave_status_change();


-- ============================================================
-- FUNCTION: get_available_replacements
--
-- WORKFLOW ROLE:
--   Called by the mobile app when Staff A opens the
--   replacement picker screen. Returns a filtered list of
--   staff who are eligible to be a replacement.
--
-- A staff member is EXCLUDED from the list if they:
--   1. Are inactive (is_active = FALSE)
--   2. Are not a regular staff (role != 'staff')
--   3. Are the requester themselves
--   4. Are already on APPROVED leave during the requested period
--   5. Are already assigned as a replacement in another active
--      request during the same period AND allow_multiple_replacements = FALSE
--   6. The date range has zero working days
--      (entire range is weekends + public holidays)
--
-- PARAMETERS:
--   p_start_date   -> the start date Staff A picked
--   p_end_date     -> the end date Staff A picked
--   p_requester_id -> Staff A's user id (to exclude themselves)
--
-- USAGE FROM MOBILE APP:
--   const { data } = await supabase.rpc('get_available_replacements', {
--     p_start_date:   '2025-03-03',
--     p_end_date:     '2025-03-07',
--     p_requester_id: user.id
--   })
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_available_replacements(
  p_start_date   DATE,
  p_end_date     DATE,
  p_requester_id UUID
)
RETURNS TABLE (
  id         UUID,
  full_name  TEXT,
  department TEXT,
  jawatan    TEXT,
  email      TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_allow_multiple BOOLEAN;
BEGIN
  -- Read the replacement policy from system settings
  SELECT allow_multiple_replacements
    INTO v_allow_multiple
    FROM public.system_settings
   WHERE id = 1;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.department,
    p.jawatan,
    p.email
  FROM public.profiles p
  WHERE
    p.is_active = TRUE
    AND p.role  = 'staff'
    AND p.id   != p_requester_id

    -- RULE 1: Exclude anyone already on approved leave during this period
    -- e.g. Staff B is on Annual Leave 3-10 Mac, so they cannot cover Staff A 5-7 Mac
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.requester_id = p.id
        AND lr.status       = 'approved'
        AND lr.start_date  <= p_end_date
        AND lr.end_date    >= p_start_date
    )

    -- RULE 2: In One-to-One mode, exclude anyone already assigned
    -- as a replacement in another active request during this period.
    -- In One-to-Many mode, skip this check entirely.
    AND (
      v_allow_multiple = TRUE
      OR NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.replacement_id = p.id
          AND lr.status IN ('pending_replacement', 'pending_approval', 'approved')
          AND lr.start_date    <= p_end_date
          AND lr.end_date      >= p_start_date
      )
    )

    -- RULE 3: The date range must contain at least one working day.
    -- If the entire range is weekends + public holidays, no replacement needed.
    AND (
      SELECT COUNT(*)
      FROM generate_series(p_start_date, p_end_date, INTERVAL '1 day') AS gs(d)
      WHERE EXTRACT(DOW FROM gs.d) NOT IN (0, 6)
        -- 0 = Sunday, 6 = Saturday
        AND NOT EXISTS (
          SELECT 1 FROM public.public_holidays ph
          WHERE ph.date = gs.d::DATE
        )
    ) > 0

  ORDER BY p.full_name;
END;
$$;

COMMENT ON FUNCTION public.get_available_replacements IS
  'Returns staff eligible as replacement for a date range. Reads system_settings.allow_multiple_replacements.';


-- ============================================================
-- VIEW: leave_schedule
--
-- WORKFLOW ROLE:
--   Powers the Leave Schedule screen in the mobile app.
--   All users (staff, approver, admin) can see this.
--   Shows all APPROVED leave requests.
--
-- MOBILE APP USAGE:
--   Day view:   WHERE start_date <= today AND end_date >= today
--   Week view:  WHERE start_date <= week_end AND end_date >= week_start
--   Month view: WHERE start_date <= month_end AND end_date >= month_start
--
--   The app can also filter by department or leave type
--   using additional WHERE clauses on top of this view.
-- ============================================================
CREATE OR REPLACE VIEW public.leave_schedule AS
SELECT
  lr.id          AS leave_request_id,
  lr.start_date,
  lr.end_date,
  lr.total_days,
  p.id           AS staff_id,
  p.full_name,
  p.department,
  p.jawatan,
  lt.id          AS leave_type_id,
  lt.name        AS leave_type,
  lt.color_hex
  -- color_hex lets the mobile app colour-code each entry on the calendar
FROM public.leave_requests lr
JOIN public.profiles    p  ON p.id  = lr.requester_id
JOIN public.leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.status = 'approved'
-- Only approved leave is shown on the schedule
ORDER BY lr.start_date;

COMMENT ON VIEW public.leave_schedule IS
  'All approved leave. Query with date range filters for day/week/month views in the mobile app.';


-- ============================================================
-- VIEW: staff_on_leave_today
--
-- WORKFLOW ROLE:
--   A convenience view that pre-filters leave_schedule to
--   only show staff who are on leave TODAY (CURRENT_DATE).
--
--   Used by:
--     - Admin dashboard home page "On Leave Today" card
--     - Mobile app home screen quick summary
--     - Mobile app Day view (shortcut instead of date filter)
-- ============================================================
CREATE OR REPLACE VIEW public.staff_on_leave_today AS
SELECT
  p.id        AS staff_id,
  p.full_name,
  p.department,
  p.jawatan,
  lr.id       AS leave_request_id,
  lt.name     AS leave_type,
  lt.color_hex,
  lr.start_date,
  lr.end_date,
  lr.total_days
FROM public.leave_requests lr
JOIN public.profiles    p  ON p.id  = lr.requester_id
JOIN public.leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.status     = 'approved'
  AND lr.start_date <= CURRENT_DATE
  AND lr.end_date   >= CURRENT_DATE;

COMMENT ON VIEW public.staff_on_leave_today IS
  'All staff on approved leave today. Used by admin dashboard and mobile app home screen.';


-- ============================================================
-- VIEW: leave_statistics
--
-- WORKFLOW ROLE:
--   Powers the reporting section of the admin dashboard.
--   Shows an aggregated summary of leave usage per staff
--   member, per leave type, per calendar year.
--
--   Admin can use this to see:
--     - How many days each staff took per leave type
--     - How many requests were rejected or cancelled
--     - Year-over-year comparisons
--
--   Note: Because leave_requests is LEFT JOINed, staff who
--   have never applied for leave will also appear (with 0 counts).
-- ============================================================
CREATE OR REPLACE VIEW public.leave_statistics AS
SELECT
  p.id                                                           AS staff_id,
  p.full_name,
  p.department,
  p.jawatan,
  lt.id                                                          AS leave_type_id,
  lt.name                                                        AS leave_type,
  EXTRACT(YEAR FROM lr.start_date)::INT                         AS year,

  COUNT(*)   FILTER (WHERE lr.status = 'approved')               AS approved_count,
  -- Number of approved leave requests this year

  COALESCE(SUM(lr.total_days) FILTER (WHERE lr.status = 'approved'), 0)
                                                                 AS total_days_taken,
  -- Total working days taken on approved leave this year

  COUNT(*)   FILTER (WHERE lr.status = 'rejected')               AS rejected_count,
  COUNT(*)   FILTER (WHERE lr.status = 'cancelled')              AS cancelled_count

FROM public.profiles p
LEFT JOIN public.leave_requests lr ON lr.requester_id = p.id
LEFT JOIN public.leave_types    lt ON lt.id = lr.leave_type_id
WHERE p.role = 'staff'
GROUP BY
  p.id, p.full_name, p.department, p.jawatan,
  lt.id, lt.name,
  EXTRACT(YEAR FROM lr.start_date);

COMMENT ON VIEW public.leave_statistics IS
  'Leave usage summary per staff per leave type per year. Used by admin dashboard reporting.';


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
--
-- RLS ensures that each user can only read and write data
-- they are authorised to access, even if someone tries to
-- query the database directly with the anon key.
--
-- PRINCIPLE:
--   - Staff can only see their own data
--   - Replacement and approver can see requests they are involved in
--   - All users can see approved leave (needed for schedule view)
--   - Admin can see and do everything
-- ============================================================

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_audit_log ENABLE ROW LEVEL SECURITY;


-- Helper function: returns the current logged-in user's role.
-- SECURITY DEFINER bypasses RLS on the profiles table to prevent
-- infinite recursion (RLS on profiles would call this, which reads profiles).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ── system_settings policies ──────────────────────────────────
-- All logged-in users can READ settings (needed by get_available_replacements)
-- Only admin can UPDATE settings (replacement policy toggle)
CREATE POLICY "settings: authenticated read"
  ON public.system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings: admin update"
  ON public.system_settings FOR UPDATE
  USING (public.current_user_role() = 'admin');


-- ── profiles policies ─────────────────────────────────────────
-- Own row: always readable by the user themselves
CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Admin: can read all profiles (needed for staff management)
CREATE POLICY "profiles: admin read all"
  ON public.profiles FOR SELECT
  USING (public.current_user_role() = 'admin');

-- Staff + Approver: can read all ACTIVE profiles
-- Needed for: replacement picker, approver picker
CREATE POLICY "profiles: staff read active"
  ON public.profiles FOR SELECT
  USING (is_active = TRUE AND public.current_user_role() IN ('staff', 'approver'));

-- Only admin can create profiles (done via trigger, but policy guards direct inserts)
CREATE POLICY "profiles: admin insert"
  ON public.profiles FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- Admin can update any profile (name, jawatan, role, is_active, etc.)
CREATE POLICY "profiles: admin update"
  ON public.profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- Staff can update their own profile (e.g. save expo_push_token on login)
CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());


-- ── leave_types policies ──────────────────────────────────────
-- All logged-in users read leave types (needed for leave form picker)
CREATE POLICY "leave_types: authenticated read"
  ON public.leave_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admin can create, update, delete leave types
CREATE POLICY "leave_types: admin all"
  ON public.leave_types FOR ALL
  USING (public.current_user_role() = 'admin');


-- ── public_holidays policies ──────────────────────────────────
-- All logged-in users read holidays (needed for total_days calculation)
CREATE POLICY "holidays: authenticated read"
  ON public.public_holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admin can add or remove holidays
CREATE POLICY "holidays: admin all"
  ON public.public_holidays FOR ALL
  USING (public.current_user_role() = 'admin');


-- ── leave_requests policies ───────────────────────────────────

-- ALL users can read APPROVED requests (needed for leave schedule calendar)
CREATE POLICY "leave_requests: all read approved"
  ON public.leave_requests FOR SELECT
  USING (status = 'approved' AND auth.uid() IS NOT NULL);

-- Requester (Staff A) can read all their own requests regardless of status
CREATE POLICY "leave_requests: requester read own"
  ON public.leave_requests FOR SELECT
  USING (requester_id = auth.uid());

-- Replacement (Staff B) can read requests where they are nominated
-- Needed to show the incoming replacement request on Staff B's home screen
CREATE POLICY "leave_requests: replacement read assigned"
  ON public.leave_requests FOR SELECT
  USING (replacement_id = auth.uid());

-- Approver (Staff C) can read requests assigned to them for approval
CREATE POLICY "leave_requests: approver read assigned"
  ON public.leave_requests FOR SELECT
  USING (approver_id = auth.uid());

-- Admin can read all requests regardless of status
CREATE POLICY "leave_requests: admin read all"
  ON public.leave_requests FOR SELECT
  USING (public.current_user_role() = 'admin');

-- Staff and approvers can insert their own leave requests
CREATE POLICY "leave_requests: staff insert"
  ON public.leave_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid() AND public.current_user_role() IN ('staff', 'approver'));

-- Requester (Staff A) can update while request is still in their court:
--   draft                -> edit details before submitting
--   pending_replacement  -> cancel the request
--   replacement_rejected -> pick a new replacement
--   pending_approval     -> cancel the request
CREATE POLICY "leave_requests: requester update"
  ON public.leave_requests FOR UPDATE
  USING (
    requester_id = auth.uid()
    AND status IN ('draft', 'pending_replacement', 'replacement_rejected', 'pending_approval')
  );

-- Staff B can only update when it is their turn to respond
CREATE POLICY "leave_requests: replacement update"
  ON public.leave_requests FOR UPDATE
  USING (replacement_id = auth.uid() AND status = 'pending_replacement');

-- Staff C can only update when it is their turn to decide
CREATE POLICY "leave_requests: approver update"
  ON public.leave_requests FOR UPDATE
  USING (approver_id = auth.uid() AND status = 'pending_approval');

-- Admin can update any request at any time (admin override feature)
CREATE POLICY "leave_requests: admin update"
  ON public.leave_requests FOR UPDATE
  USING (public.current_user_role() = 'admin');


-- ── notifications policies ────────────────────────────────────
-- Users can only see their own notifications
CREATE POLICY "notifications: own read"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

-- Any authenticated user can insert notifications (app inserts when workflow advances)
CREATE POLICY "notifications: own insert"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can mark their own notifications as read (update is_read = true)
CREATE POLICY "notifications: own update"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid());

-- Admin can read all notifications
CREATE POLICY "notifications: admin read all"
  ON public.notifications FOR SELECT
  USING (public.current_user_role() = 'admin');


-- ── leave_audit_log policies ──────────────────────────────────
-- Requester can read the audit trail for their own requests
CREATE POLICY "audit: requester read own"
  ON public.leave_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.id             = leave_request_id
        AND lr.requester_id   = auth.uid()
    )
  );

-- Admin can read all audit logs
CREATE POLICY "audit: admin read all"
  ON public.leave_audit_log FOR SELECT
  USING (public.current_user_role() = 'admin');

-- No INSERT policy needed: audit rows are written by the trigger (SECURITY DEFINER)


-- ============================================================
-- GRANTS
-- Grants the authenticated role permission to perform
-- the operations allowed by RLS policies above.
-- Without GRANT, even policies that say "allowed" won't work.
-- ============================================================
GRANT SELECT, UPDATE                 ON public.system_settings       TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.profiles               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_holidays        TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.leave_requests         TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.notifications          TO authenticated;
GRANT SELECT, INSERT                 ON public.leave_audit_log        TO authenticated;
GRANT SELECT                         ON public.leave_schedule         TO authenticated;
GRANT SELECT                         ON public.staff_on_leave_today   TO authenticated;
GRANT SELECT                         ON public.leave_statistics       TO authenticated;


-- ============================================================
-- END OF SCHEMA
-- ============================================================
