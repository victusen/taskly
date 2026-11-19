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

## Project insights and spreadsheet access

- Project-card insight slides are presentation placeholders only. Live schedule counts, delivery activity, and performance analytics are not connected yet.
- Google OAuth scopes authorize access to Google APIs; they do not restrict access to a user's selected spreadsheet rows, columns, or tabs. Those selections must be validated and enforced by the backend whenever spreadsheet data is read or a schedule is delivered.
- Google Sheets is a separate project-level OAuth connection, stored encrypted in the existing `schedule_databases` table. It does not use or replace the project's Gmail sender connection. Spreadsheet schedules retain the selected Sheets connection ID, spreadsheet, worksheet, recipient-email column, and template-variable mappings in their schedule config.
- Configure `GOOGLE_PICKER_API_KEY` and `GOOGLE_CLOUD_PROJECT_NUMBER` on the backend to enable Google Picker. Restrict the API key to the deployed frontend origin and the Google Picker API; the cloud project number is the numeric project ID shown in Google Cloud. Keep the existing Google OAuth callback URI registered for the backend. The frontend receives only a short-lived access token for Picker; refresh tokens remain encrypted server-side.
- Google Sheets OAuth requests `drive.file`, which lets the user explicitly select a spreadsheet through Google Picker and limits Taskly to that file. The Sheets API reads the selected file using that per-file grant; no Gmail send access is requested. Account selection is independent, so a user may authorize any Google account. Disconnecting locally clears the encrypted credentials and pauses active schedules that use that connection; it does not revoke the shared OAuth grant or affect Gmail. Previously-created spreadsheet schedules without a Sheets connection are paused with a reconnect-and-edit requirement when next checked by the scheduler.
