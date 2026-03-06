# Leave Replacement Form

A leave management system for organisations with a 3-party approval workflow: the **requester** (Staff A) nominates a **replacement** (Staff B), who must agree before the **approver** (Staff C) can approve the leave.

## Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `leave-admin/` | Next.js 16 · TypeScript · Tailwind · shadcn/ui | Admin dashboard |
| `leave-app/` | Expo SDK 54 · React Native · NativeWind | Staff mobile app (iOS & Android) |

Both apps connect to the same **Supabase** project (Postgres · Auth · Storage · Realtime).

---

## Workflow

```
draft
  └─> pending_replacement   (Staff B notified to agree/reject)
        ├─> pending_approval   (Staff C notified to approve/reject)
        │     ├─> approved
        │     └─> rejected
        ├─> replacement_rejected   (Staff A can re-send or cancel)
        └─> cancelled
```

Any request before `approved` can be cancelled by the requester or overridden by an admin.

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Admin dashboard — manages staff, leave types, holidays, settings, and can force-override any request |
| `approver` | Mobile app — approves or rejects requests assigned to them |
| `staff` | Mobile app — applies for leave and acts as replacement for others |

---

## Prerequisites

- Node.js 20 LTS
- [Supabase](https://supabase.com) project (free tier works)
- [Expo Go](https://expo.dev/go) app on your phone (SDK 54)

---

## Setup

### 1. Supabase

1. Create a new Supabase project
2. Run `supabase_schema.sql` in the Supabase SQL editor to create all tables, views, functions, and RLS policies
3. Copy your **Project URL** and **anon key** from *Project Settings → API*

### 2. Admin Dashboard (`leave-admin/`)

```bash
cd leave-admin
cp .env.example .env.local   # or create manually
npm install
npm run dev
```

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Open [http://localhost:3000/setup](http://localhost:3000/setup) to create the first admin account. The setup page self-seals after the first admin is registered.

### 3. Mobile App (`leave-app/`)

```bash
cd leave-app
cp .env.example .env.local   # or create manually
npm install
npx expo start --clear
```

`.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Scan the QR code with **Expo Go** on your phone.

> **Note:** Push notifications are not supported in Expo Go on Android (Expo SDK 53+ limitation). Use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) for full push notification support.

---

## Admin Dashboard Pages

| Page | Description |
|------|-------------|
| `/setup` | First-time admin registration (self-seals after use) |
| `/login` | Admin login |
| `/dashboard` | Overview — stats, who's on leave today, recent requests |
| `/dashboard/staff` | Manage staff accounts (add, edit, activate/deactivate) |
| `/dashboard/requests` | All leave requests with status filter; detail view with admin override and approver reassignment |
| `/dashboard/leave-types` | Configure leave types (name, max days, colour, requires replacement) |
| `/dashboard/holidays` | Manage public holidays (used for working-day calculations) |
| `/dashboard/settings` | One-to-One vs One-to-Many replacement mode |

---

## Mobile App Screens

| Screen | Description |
|--------|-------------|
| Login | Email/password login |
| Home | Pending actions, who's on leave today, upcoming leaves (14 days) |
| Requests | My leave requests with filter tabs |
| Request Detail | Agree/reject (Staff B), approve/reject (Staff C), cancel (Staff A), audit timeline |
| Apply | 3-step flow: leave details → pick replacement → pick approver & submit |
| Schedule | Day/week/month calendar of approved leaves |
| Notifications | In-app notification feed with deep links |
| Profile | View profile, sign out |

---

## Database

The full schema is in `supabase_schema.sql`. Key tables:

- `profiles` — extends Supabase Auth users; stores role, department, push token
- `leave_types` — admin-configured leave categories
- `leave_requests` — core table; tracks requester, replacement, approver, status
- `public_holidays` — used to exclude non-working days from leave counts
- `notifications` — in-app notification log
- `leave_audit_log` — append-only status change history (written by DB trigger)

---

## Project Structure

```
leave-replacement-form/
├── leave-admin/          # Next.js admin dashboard
│   ├── app/              # App Router pages & API routes
│   ├── components/       # Shared UI components
│   └── lib/              # Supabase clients, types
├── leave-app/            # Expo mobile app
│   ├── app/              # Expo Router screens
│   ├── components/       # Shared RN components
│   ├── context/          # Auth & Apply context providers
│   └── lib/              # Supabase client, utilities
├── supabase_schema.sql   # Full database schema
└── workflow.txt          # Detailed workflow specification
```
