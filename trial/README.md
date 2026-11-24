# Shared expenses trial

This is an additive pilot at `/trial/`. The current root expenses app and timesheets are unchanged. Trial drafts use a separate IndexedDB database for each signed-in user on each device. Only **Submit checked claim to finance** uploads a checked snapshot and receipt photographs; local drafts do not sync between devices.

## Accounts

Administrators can open **Team logins** and create an engineer, manager or accounts login with a name, email and temporary password. A unique temporary password is generated; the administrator can replace it with another password of at least eight characters. Give the login details privately: this flow sends no email. New users must choose their own password (at least ten characters in the app) before opening claims. Existing accounts are unaffected. Dashboard project access and app access are separate; never grant project dashboard membership just to use this app. Email invitations and forgotten-password recovery remain future configuration.

Engineers see their own submissions. All managers can review every submitted claim in their company; one management approval sends it to accounts. Accounts can then approve or return it and mark approved personal claims paid / card claims reconciled. Accounts cannot skip management approval. Either stage requires a reason when returning a claim. Management and accounts approval dates and actors are retained. Administrators have separate Management and Accounts views for trial testing. No special restriction on managers' own expenses is implemented yet, as requested.

Submitted snapshots are immutable. Correct returned claims in the original local draft and submit a new version; earlier submissions remain in the history and both approval stages restart. Personal and card forms stay separate; card expenditure is never owed to the engineer.

## Storage and security

`config.js` contains the public browser publishable key, which is intended for client use. Never place database passwords, service-role or secret API keys here. The server-side `expense-provision-user` Edge Function verifies the current Auth token and an unlocked administrator membership before creating a user in that administrator's company. Its service-role key stays in Supabase's server environment. It does not send invitation emails or allow public signup into a company.

Database RLS scopes claims and receipt access by company, owner and approval stage; the private `expense-receipts` bucket stores JPEGs under company/user/claim/item paths. A password-change-required membership cannot access claims or photos; an Auth password-hash change clears this server flag. Profile metadata and direct member updates cannot bypass it. The server validates checked fields, VAT choices and company mileage rates, recalculates totals and records status changes. Storage remains on the project's existing Ireland region.

Source database SQL and rollback access tests are maintained locally in `work/expenses-trial/`. Hosted migration history is authoritative. The browser SDK is pinned to `@supabase/supabase-js` 2.119.2 (MIT), downloaded from the official package's UMD distribution on jsDelivr. Shared app dependencies and Word template resolve from the existing app directory.

## Trial limitations

Start with test receipts. Upload requires internet; failed uploads keep the local draft and can be retried. Incomplete cloud uploads remain visible only to their owner; this pilot has no discard/retention UI. Each listing shows the newest 200 matching claims. Pre-April-2026 mileage has no configured rate and is flagged for accounts; settle that before approving such claims. This pilot covers expense submissions, not shared timesheets. Finance Word/receipt PDF exports reuse the existing app export functions.

Before wider use: exercise first login/password replacement, management and accounts review, upload and downloads with real test logins on iPhone; agree retention/backups and account recovery; review project usage/hosting limits. Supabase currently reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid plan upgrade is made by this change.
