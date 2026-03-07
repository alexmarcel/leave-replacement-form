-- ============================================================
-- LEAVE MANAGEMENT SYSTEM -- SUPABASE SCHEMA
-- ============================================================
-- HOW TO RUN:
--   Supabase Dashboard > SQL Editor > New Query > Paste > Run
--
-- This script is fully idempotent -- safe to run multiple times.
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
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- TABLE 1: SYSTEM SETTINGS
-- Always has exactly ONE row (id = 1).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id                          INT         PRIMARY KEY DEFAULT 1,
  allow_multiple_replacements BOOLEAN     NOT NULL DEFAULT FALSE,
  -- FALSE = One-to-One: a staff member can only cover one active request at a time.
  -- TRUE  = One-to-Many: a staff member can cover multiple people simultaneously.
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

COMMENT ON TABLE  public.system_settings IS 'Global system configuration. Always has exactly one row (id = 1).';
COMMENT ON COLUMN public.system_settings.allow_multiple_replacements IS
  'FALSE = One-to-One: a staff can only cover one active request at a time. TRUE = One-to-Many: no limit.';

INSERT INTO public.system_settings (id, allow_multiple_replacements)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- TABLE 2: PROFILES
-- Extends Supabase Auth. Created by trigger on auth.users INSERT.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  email           TEXT        NOT NULL UNIQUE,
  phone           TEXT,
  role            TEXT        NOT NULL DEFAULT 'staff'
                                CHECK (role IN ('admin', 'approver', 'staff')),
  department      TEXT,
  jawatan         TEXT,
  -- Job title in Malay. e.g. Pegawai Tadbir, Jurutera
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- FALSE = cannot log in, hidden from replacement picker
  avatar_url      TEXT,
  expo_push_token TEXT,
  -- Saved by the mobile app on first login. Used to deliver push notifications.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles                 IS 'User profiles. Extends Supabase Auth. One row per user.';
COMMENT ON COLUMN public.profiles.role            IS 'admin = dashboard only | approver = Staff C | staff = regular employee.';
COMMENT ON COLUMN public.profiles.jawatan         IS 'Job title in Malay. e.g. Pegawai Tadbir, Jurutera.';
COMMENT ON COLUMN public.profiles.is_active       IS 'FALSE = cannot log in and hidden from replacement picker.';
COMMENT ON COLUMN public.profiles.expo_push_token IS 'Saved on first app login. Used to deliver push notifications via Expo Push API.';


-- ============================================================
-- TABLE 3: LEAVE TYPES
-- Admin-configured. Staff picks from this list when applying.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_types (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL UNIQUE,
  description          TEXT,
  max_days_per_year    INT,
  -- NULL = unlimited. Informational only; not auto-enforced.
  requires_replacement BOOLEAN     NOT NULL DEFAULT TRUE,
  -- TRUE  = must nominate a replacement (Annual Leave, Unpaid Leave)
  -- FALSE = can skip replacement step (Sick Leave, Emergency Leave)
  color_hex            TEXT        NOT NULL DEFAULT '#6366F1',
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.leave_types                      IS 'Leave types configured by admin. Shown in the mobile app leave form.';
COMMENT ON COLUMN public.leave_types.requires_replacement IS 'TRUE = replacement must be nominated before submitting. FALSE = can skip replacement step.';
COMMENT ON COLUMN public.leave_types.color_hex            IS 'Hex colour shown in the mobile app schedule/calendar view.';

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
-- Used to exclude non-working days from total_days calculation.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  date       DATE        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.public_holidays IS
  'Public holidays. Excluded from total_days calculation and replacement availability check.';


-- ============================================================
-- TABLE 5: LEAVE REQUESTS
-- Core table. status column drives the entire workflow.
--
-- STATUS MACHINE:
--   [draft]
--      └─> [pending_replacement]  (Staff A submits, Staff B notified)
--            ├─> [replacement_rejected]  (Staff B declines)
--            │     └─> [pending_replacement]  (Staff A picks again)
--            └─> [pending_approval]  (Staff B agrees, Staff C notified)
--                  ├─> [approved]   (Staff C approves)
--                  └─> [rejected]   (Staff C rejects)
--   Any state before approved -> [cancelled]  (Staff A cancels)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The three parties
  requester_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  replacement_id UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  approver_id    UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Leave details
  leave_type_id  UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  total_days     INT  NOT NULL CHECK (total_days > 0),
  -- Working days only; calculated by mobile app. Excludes weekends + public holidays.
  reason         TEXT,
  attachment_url TEXT,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'pending_replacement',
      'replacement_rejected',
      'pending_approval',
      'approved',
      'rejected',
      'cancelled'
    )),

  -- Staff B (replacement) response
  replacement_response     TEXT CHECK (replacement_response IN ('pending', 'agreed', 'rejected')),
  replacement_responded_at TIMESTAMPTZ,
  replacement_notes        TEXT,

  -- Staff C (approver) response
  approver_response     TEXT CHECK (approver_response IN ('pending', 'approved', 'rejected')),
  approver_responded_at TIMESTAMPTZ,
  approver_notes        TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_date_range         CHECK (end_date >= start_date),
  CONSTRAINT requester_not_replacement CHECK (requester_id != replacement_id),
  CONSTRAINT requester_not_approver    CHECK (requester_id != approver_id)
);

COMMENT ON TABLE  public.leave_requests            IS 'Core leave request table. One row per application. status column drives the workflow.';
COMMENT ON COLUMN public.leave_requests.total_days IS 'Working days only. Excludes weekends and public holidays. Calculated by the mobile app.';
COMMENT ON COLUMN public.leave_requests.status     IS 'Workflow state: draft > pending_replacement > pending_approval > approved/rejected. Can be cancelled at any pre-approved stage.';

CREATE INDEX IF NOT EXISTS idx_lr_requester   ON public.leave_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_lr_replacement ON public.leave_requests (replacement_id);
CREATE INDEX IF NOT EXISTS idx_lr_approver    ON public.leave_requests (approver_id);
CREATE INDEX IF NOT EXISTS idx_lr_status      ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_lr_dates       ON public.leave_requests (start_date, end_date);


-- ============================================================
-- TABLE 6: NOTIFICATIONS
-- In-app notification log. Also used to trigger Expo Push.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id     UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_request_id UUID             REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  type             TEXT    NOT NULL
    CHECK (type IN (
      'replacement_requested',
      'replacement_agreed',
      'replacement_rejected',
      'approval_requested',
      'request_approved',
      'request_rejected',
      'request_cancelled'
    )),
  title      TEXT    NOT NULL,
  body       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'In-app notification log. Powers the bell icon and Supabase Realtime feed. Expo Push sent separately by app.';

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON public.notifications (recipient_id, is_read, created_at DESC);


-- ============================================================
-- TABLE 7: AUDIT LOG
-- Append-only. Written automatically by trigger on status change.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID        NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  changed_by       UUID                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status       TEXT,
  new_status       TEXT        NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.leave_audit_log IS
  'Append-only audit trail. One row per status change. Written automatically by trigger.';

CREATE INDEX IF NOT EXISTS idx_audit_request ON public.leave_audit_log (leave_request_id, created_at DESC);


-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Trigger 1: Auto-stamp updated_at on every UPDATE
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


-- Trigger 2: Auto-create profile row when a new auth user is created.
-- Admin passes full_name, role, phone, jawatan, department in user_metadata.
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
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Trigger 3: Write audit log row on every status change.
CREATE OR REPLACE FUNCTION public.log_leave_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
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
-- Called by the mobile app replacement picker.
-- Returns all active users eligible to be nominated as a replacement.
-- All roles (staff, approver, admin) can be selected as replacement.
--
-- Excludes users who are:
--   1. Inactive
--   2. The requester themselves
--   3. Already on approved leave during the period
--   4. Already assigned as replacement in One-to-One mode
--   5. Date range has zero working days
--
-- NOTE: WHERE system_settings.id = 1 must be table-qualified to avoid
--       ambiguity with the RETURNS TABLE output column also named "id".
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
  SELECT allow_multiple_replacements
    INTO v_allow_multiple
    FROM public.system_settings
   WHERE system_settings.id = 1;
   -- Note: must qualify with table name to avoid ambiguity with
   -- the RETURNS TABLE output column also named "id".

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
    AND p.id   != p_requester_id

    -- Exclude anyone already on approved leave during this period
    AND NOT EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.requester_id = p.id
        AND lr.status       = 'approved'
        AND lr.start_date  <= p_end_date
        AND lr.end_date    >= p_start_date
    )

    -- In One-to-One mode, exclude anyone already assigned as a replacement
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

    -- The date range must contain at least one working day
    AND (
      SELECT COUNT(*)
      FROM generate_series(p_start_date, p_end_date, INTERVAL '1 day') AS gs(d)
      WHERE EXTRACT(DOW FROM gs.d) NOT IN (0, 6)
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
-- VIEWS
-- ============================================================

-- leave_schedule: all approved leave; used by the mobile app calendar
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
FROM public.leave_requests lr
JOIN public.profiles    p  ON p.id  = lr.requester_id
JOIN public.leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.status = 'approved'
ORDER BY lr.start_date;

COMMENT ON VIEW public.leave_schedule IS
  'All approved leave. Query with date range filters for day/week/month views in the mobile app.';


-- staff_on_leave_today: shortcut view for today's on-leave list
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


-- leave_statistics: per-staff per-leave-type per-year summary for admin reporting
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
  COALESCE(SUM(lr.total_days) FILTER (WHERE lr.status = 'approved'), 0)
                                                                 AS total_days_taken,
  COUNT(*)   FILTER (WHERE lr.status = 'rejected')               AS rejected_count,
  COUNT(*)   FILTER (WHERE lr.status = 'cancelled')              AS cancelled_count
FROM public.profiles p
LEFT JOIN public.leave_requests lr ON lr.requester_id = p.id
LEFT JOIN public.leave_types    lt ON lt.id = lr.leave_type_id
WHERE p.role IN ('staff', 'approver', 'admin')
GROUP BY
  p.id, p.full_name, p.department, p.jawatan,
  lt.id, lt.name,
  EXTRACT(YEAR FROM lr.start_date);

COMMENT ON VIEW public.leave_statistics IS
  'Leave usage summary per staff per leave type per year. Used by admin dashboard reporting.';


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_audit_log ENABLE ROW LEVEL SECURITY;


-- Helper: returns current user's role. SECURITY DEFINER avoids RLS recursion.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- Drop existing policies before re-creating (makes script re-runnable)
DO $$ BEGIN
  -- system_settings
  DROP POLICY IF EXISTS "settings: authenticated read" ON public.system_settings;
  DROP POLICY IF EXISTS "settings: admin update"       ON public.system_settings;
  -- profiles
  DROP POLICY IF EXISTS "profiles: own read"           ON public.profiles;
  DROP POLICY IF EXISTS "profiles: admin read all"     ON public.profiles;
  DROP POLICY IF EXISTS "profiles: staff read active"  ON public.profiles;
  DROP POLICY IF EXISTS "profiles: admin insert"       ON public.profiles;
  DROP POLICY IF EXISTS "profiles: admin update"       ON public.profiles;
  DROP POLICY IF EXISTS "profiles: own update"         ON public.profiles;
  -- leave_types
  DROP POLICY IF EXISTS "leave_types: authenticated read" ON public.leave_types;
  DROP POLICY IF EXISTS "leave_types: admin all"          ON public.leave_types;
  -- public_holidays
  DROP POLICY IF EXISTS "holidays: authenticated read" ON public.public_holidays;
  DROP POLICY IF EXISTS "holidays: admin all"          ON public.public_holidays;
  -- leave_requests
  DROP POLICY IF EXISTS "leave_requests: all read approved"       ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: requester read own"      ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: replacement read assigned" ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: approver read assigned"  ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: admin read all"          ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: staff insert"            ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: requester update"        ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: replacement update"      ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: approver update"         ON public.leave_requests;
  DROP POLICY IF EXISTS "leave_requests: admin update"            ON public.leave_requests;
  -- notifications
  DROP POLICY IF EXISTS "notifications: own read"      ON public.notifications;
  DROP POLICY IF EXISTS "notifications: own insert"    ON public.notifications;
  DROP POLICY IF EXISTS "notifications: own update"    ON public.notifications;
  DROP POLICY IF EXISTS "notifications: admin read all" ON public.notifications;
  -- audit log
  DROP POLICY IF EXISTS "audit: requester read own" ON public.leave_audit_log;
  DROP POLICY IF EXISTS "audit: parties read own"   ON public.leave_audit_log;
  DROP POLICY IF EXISTS "audit: admin read all"     ON public.leave_audit_log;
END $$;


-- ── system_settings policies ──────────────────────────────────
CREATE POLICY "settings: authenticated read"
  ON public.system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings: admin update"
  ON public.system_settings FOR UPDATE
  USING (public.current_user_role() = 'admin');


-- ── profiles policies ─────────────────────────────────────────
CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: admin read all"
  ON public.profiles FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles: staff read active"
  ON public.profiles FOR SELECT
  USING (is_active = TRUE AND public.current_user_role() IN ('staff', 'approver'));

CREATE POLICY "profiles: admin insert"
  ON public.profiles FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "profiles: admin update"
  ON public.profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());


-- ── leave_types policies ──────────────────────────────────────
CREATE POLICY "leave_types: authenticated read"
  ON public.leave_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "leave_types: admin all"
  ON public.leave_types FOR ALL
  USING (public.current_user_role() = 'admin');


-- ── public_holidays policies ──────────────────────────────────
CREATE POLICY "holidays: authenticated read"
  ON public.public_holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "holidays: admin all"
  ON public.public_holidays FOR ALL
  USING (public.current_user_role() = 'admin');


-- ── leave_requests policies ───────────────────────────────────
CREATE POLICY "leave_requests: all read approved"
  ON public.leave_requests FOR SELECT
  USING (status = 'approved' AND auth.uid() IS NOT NULL);

CREATE POLICY "leave_requests: requester read own"
  ON public.leave_requests FOR SELECT
  USING (requester_id = auth.uid());

CREATE POLICY "leave_requests: replacement read assigned"
  ON public.leave_requests FOR SELECT
  USING (replacement_id = auth.uid());

CREATE POLICY "leave_requests: approver read assigned"
  ON public.leave_requests FOR SELECT
  USING (approver_id = auth.uid());

CREATE POLICY "leave_requests: admin read all"
  ON public.leave_requests FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "leave_requests: staff insert"
  ON public.leave_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid() AND auth.uid() IS NOT NULL);

CREATE POLICY "leave_requests: requester update"
  ON public.leave_requests FOR UPDATE
  USING (
    requester_id = auth.uid()
    AND status IN ('draft', 'pending_replacement', 'replacement_rejected', 'pending_approval')
  )
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "leave_requests: replacement update"
  ON public.leave_requests FOR UPDATE
  USING (replacement_id = auth.uid() AND status = 'pending_replacement')
  WITH CHECK (replacement_id = auth.uid());

CREATE POLICY "leave_requests: approver update"
  ON public.leave_requests FOR UPDATE
  USING (approver_id = auth.uid() AND status = 'pending_approval')
  WITH CHECK (approver_id = auth.uid());

CREATE POLICY "leave_requests: admin update"
  ON public.leave_requests FOR UPDATE
  USING (public.current_user_role() = 'admin');


-- ── notifications policies ────────────────────────────────────
CREATE POLICY "notifications: own read"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications: own insert"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notifications: own update"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications: admin read all"
  ON public.notifications FOR SELECT
  USING (public.current_user_role() = 'admin');


-- ── leave_audit_log policies ──────────────────────────────────
CREATE POLICY "audit: parties read own"
  ON public.leave_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.id = leave_request_id
        AND (
          lr.requester_id   = auth.uid() OR
          lr.replacement_id = auth.uid() OR
          lr.approver_id    = auth.uid()
        )
    )
  );

CREATE POLICY "audit: admin read all"
  ON public.leave_audit_log FOR SELECT
  USING (public.current_user_role() = 'admin');

-- No INSERT policy needed: audit rows written by SECURITY DEFINER trigger.


-- ============================================================
-- GRANTS
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
