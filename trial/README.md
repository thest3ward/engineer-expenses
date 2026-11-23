# Shared expenses trial

This is an additive pilot at `/trial/`. The current root expenses app and timesheets are unchanged. Trial drafts use a separate IndexedDB database for each signed-in user on each device. Only **Submit checked claim to finance** uploads a checked snapshot and receipt photographs; local drafts do not sync between devices.

## Accounts

Create trial accounts privately under Supabase Authentication → Users → Add user → Create new user, with confirmed email. Add their `auth.users.id` to `expense_members` for the correct company, with role `engineer`, `finance` or `admin`. Dashboard project access and app access are separate. Never grant project dashboard membership just to use this app. No self-service registration or password reset is supplied in this pilot; agree provisioning and configure email delivery before wider rollout.

Engineers see their own submissions. Finance/admin see submitted claims in their company, can approve or return them with a note, and mark approved personal claims paid / card claims reconciled. Submitted snapshots are immutable. Correct returned claims in the original local draft and submit a new version; earlier submissions remain in the history. Personal and card forms stay separate; card expenditure is never owed to the engineer.

## Storage and security

`config.js` contains the public browser publishable key, which is intended for client use. Never place database passwords, service-role or secret API keys here. Database RLS scopes claims and receipt access by company and owner; the private `expense-receipts` bucket stores JPEGs under company/user/claim/item paths. The server validates checked fields, VAT choices and company mileage rates, recalculates totals and records status changes. Storage remains on the project's existing Ireland region.

Source database SQL and rollback access tests are maintained locally in `work/expenses-trial/`. Hosted migration history is authoritative. The browser SDK is pinned to `@supabase/supabase-js` 2.119.2 (MIT), downloaded from the official package's UMD distribution on jsDelivr. Shared app dependencies and Word template resolve from the existing app directory.

## Trial limitations

Start with test receipts. Upload requires internet; failed uploads keep the local draft and can be retried. Incomplete cloud uploads remain visible only to their owner; this pilot has no discard/retention UI. Each listing shows the newest 200 matching claims. Pre-April-2026 mileage has no configured rate and is flagged for accounts; settle that before approving such claims. This pilot covers expense submissions, not shared timesheets. Finance Word/receipt PDF exports reuse the existing app export functions.

Before wider use: exercise upload, finance review and downloads with real test logins on iPhone, agree retention/backups and account recovery, and review project usage/hosting limits. No paid plan upgrade is made by this change.
