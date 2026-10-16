## Taskly / Bzade

Taskly (Bzade) is a scheduling web application that allows small business owners and developers to schedule emails, messages, and payloads at precise times in the future.

## Key Features

- **Project & Business Management**: Organize schedules across multiple business profiles and projects.
- **Asymmetric Responsive Layout**: Professional dashboard layout featuring project-level navigation (Projects, Audiences, Team members, Settings, API keys, Billing, Sign out), a 3-column desktop grid for project info, tasks, and tools, and a mobile slide-in sidebar.
- **Email & SMTP Dispatch**: Securely connect Google OAuth Gmail accounts or custom SMTP servers to automate scheduled emails.
- **Flexible Scheduling**: Support for one-time and recurring (daily, weekly, monthly, etc.) email schedules with live status tracking (Active, Paused, New).

## Architecture

- **Frontend**: Vanilla JavaScript modules, responsive CSS design, UI toast notifications, and Supabase client authentication.
- **Backend**: Node.js & Express API with security middleware (Helmet, CORS, Rate Limiting), Supabase Auth middleware, and cron/scheduler integration.
