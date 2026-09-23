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
- [ ] Design DB schema for `payments` and `users` (Required before coding).
- [ ] Implement client-side Supabase authentication in `Scripts/`.
- [ ] Setup Resend integration and Edge Function scaffolding.
