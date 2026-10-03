# Project Context: Taskly

## Current Status
- Scheduling web application for bulk messages/emails/Whatsapps.
- Project structure:
  - Frontend: Root directory (uses `Scripts/` for JS/utils/services).
  - Backend: `backend/` directory (uses Express).
- Dependencies initialized with `pnpm`:
  - `@supabase/supabase-js`
  - `dotenv`
  - `express` (backend only)

## Rules & Constraints
- **Supabase Integration:** I am to assist with auth logic and services.
- **Data Integrity:** **DO NOT** modify the database schema or perform destructive operations without explicit, direct permission from the user.
- **Documentation:** This memory file acts as the project's source of truth for the AI.
- **Quality Assurance:** "Completed" tasks must pass verification on every prompt around a logic for security, error handling, edge-case robustness, integration requirements to find mistakes, issues, uncaught even minute mistakes previous changes or agent edit didnt catch.

## Project Strategy & Architecture
- **Payment Strategy:** Hybrid approach using Paystack (Africa/Primary) and Stripe (Global).
- **Payment Flow:**
  1. Frontend SDK triggers provider modal.
  2. Modal callback triggers frontend UI update (loading/close).
  3. Provider sends server-to-server Webhook to Supabase Edge Function.
  4. Edge Function verifies signature, updates `payments` table (Service Role).
  5. Supabase Realtime broadcasts change to frontend (authenticated).
- **Backend:** Decoupled. Listens to DB changes for post-payment logic (emails, provisioning).
- **Emailing:** Using Resend (Free tier) for business emails/domains.
- **Infrastructure:** Supabase Free Tier (Edge Functions, Realtime, RLS).

## Quality Assurance
- "Completed" tasks must pass verification for security, error handling, edge-case robustness, and integration requirements.

## Next Expected Tasks (Pick one)
- [x] Design DB schema for `payments` and `users` (Required before coding).
- [ ] Implement client-side Supabase authentication in `Scripts/`.
- [ ] Setup Resend integration and Edge Function scaffolding.

# Database Schema
## users
- id (uuid, PK, references auth.users)
- created_at (timestamptz)
- email (text)
- phone (text)
- business_name (text)
- plan_tier (text, default 'free')
- billing_cycle_ends_at (timestamptz)
- total_schedules (int, default 0)
- one_time_run_count (int, default 0)
- last_login_at (timestamptz)

## schedules
- id (uuid, PK)
- user_id (uuid, FK references users)
- job_type (text)
- status (text, enum: active, paused, completed, cancelled)
- schedule_expression (text)
- timezone (text, default 'UTC')
- config (jsonb)
- scheduled_for (timestamptz)
- next_run_at (timestamptz)
- last_run_at (timestamptz)
- run_count (int, default 0)
- retry_count (int, default 0)
- last_failure_reason (text)
- created_at (timestamptz)
- updated_at (timestamptz)
- schedule_type (text, enum: one_time, recurring)

## payments
- id (uuid, PK)
- user_id (uuid, FK references users)
- provider (text)
- provider_transaction_ref (text, UNIQUE)
- amount (numeric(12,2))
- currency (text, default 'NGN')
- status (text, enum: pending, succeeded, failed)
- initiated_at (timestamptz)
- resolved_at (timestamptz)

## email_connections
- id (uuid, PK)
- user_id (uuid, FK references users)
- provider (text, enum: google, microsoft, yahoo, custom)
- connection_type (text, enum: oauth, smtp)
- email_address (text)
- credentials (jsonb)
- status (text, enum: active, expired, revoked)
- last_used_at (timestamptz)
- created_at (timestamptz)
- updated_at (timestamptz)

## schedule_runs
- id (uuid, PK)
- schedule_id (uuid, FK references schedules)
- status (text, enum: running, succeeded, failed)
- attempt (int, default 1)
- response_status (int)
- started_at (timestamptz)
- completed_at (timestamptz)
- error (text)
