# Shared expenses trial

This is an additive pilot at `/trial/`. The current root expenses app and timesheets are unchanged. Trial drafts use a separate IndexedDB database for each signed-in user on each device. Only **Submit checked claim to finance** uploads a checked snapshot and receipt photographs; local drafts do not sync between devices.

## Accounts

Administrators can open **Team logins** and create an engineer, manager or accounts login with a name, email and temporary password. A unique temporary password is generated; the administrator can replace it with another password of at least eight characters. Give the login details privately: this flow sends no email. New users must choose their own password (at least ten characters in the app) before opening claims. Existing accounts are unaffected. Dashboard project access and app access are separate; never grant project dashboard membership just to use this app. Email invitations and forgotten-password recovery remain future configuration.

The **People and access** list in Team logins shows existing team members. Choose Engineer, Manager, Senior management or Accounts and click **Save access**. Administrator logins cannot be changed here. Existing passwords, expense records and approval history stay intact. Server permissions use the new role on subsequent requests; ask the affected person to refresh to update their visible tabs. A stale edit is rejected and requires refreshing the people list. The list shows up to 200 people.

Email addresses for this list are retrieved server-side only after verifying administrator access and company membership. Role changes use the guarded `expense_set_member_role` RPC; authenticated browsers still have no direct UPDATE permission on the membership table. The RPC rejects other-company targets, protected administrators, non-admin callers and administrator promotion.

Engineers see their own submissions. Ordinary team claims go to a manager and then accounts. Managers' own claims go directly to senior management and then accounts: they do not need another manager's approval, and ordinary team claims do not need senior management approval. Reviewers work company-wide within their route. Accounts cannot skip the assigned first reviewer. Returning a claim requires a reason. Approval dates and actors are retained. Administrators have separate Managers, Senior management and Accounts views for trial testing.

The database sets the route from the submitter's role when they submit and keeps it fixed on that submitted copy, even if their access changes later. Pending manager-owned claims from before this change now await senior management; their previous manager approval, financial data, status and audit history are preserved. Claims already accounts-approved or paid stay completed. Admin, engineer, senior-management and accounts users currently submit through the ordinary manager route; only the manager role has the special senior route.

Submitted snapshots are immutable. Correct returned claims in the original local draft and submit a new version; earlier submissions remain in the history and both approval stages restart. Personal and card forms stay separate; card expenditure is never owed to the engineer.

## Receipt review on a computer

Open a claim from Managers, Senior management or Accounts. The desktop review desk shows one large receipt photo with zoom, rotate and fit controls, beside its claimed amount, ex VAT, VAT choice, date, type and notes. A receipt list and Previous / Next controls let reviewers move between items. Mileage shows journey, distance, vehicle and rate details in place of a photograph.

Use **Checked & next** to save your check and advance. Checks are separate for each reviewer and approval stage; another manager's checks or a previous stage's checks do not count as your own. All items, including mileage, must be checked before approving. This is enforced by the database as well as the interface. Only the currently active reviewer stage can change checks. Completed-stage records are read-only, with reviewer names and times. Existing historical approvals are preserved even if they predate item checks.

**Flag an issue** saves an item-specific reason. Flagged items block approval; use Return for correction to send the claim back, or mark an item checked after resolving its issue. New submitted copies start with fresh checks. Original Word and receipt PDF downloads and whole-claim preview remain available; this update adds in-app review records, without changing the Word form layout.

## Storage and security

`config.js` contains the public browser publishable key, which is intended for client use. Never place database passwords, service-role or secret API keys here. The server-side `expense-provision-user` Edge Function verifies the current Auth token and an unlocked administrator membership before creating a user in that administrator's company. Its service-role key stays in Supabase's server environment. It does not send invitation emails or allow public signup into a company.

Database RLS scopes claims and receipt access by company, owner and approval stage; the private `expense-receipts` bucket stores JPEGs under company/user/claim/item paths. A password-change-required membership cannot access claims or photos; an Auth password-hash change clears this server flag. Profile metadata and direct member updates cannot bypass it. The server validates checked fields, VAT choices and company mileage rates, recalculates totals and records status changes. Storage remains on the project's existing Ireland region.

Source database SQL and rollback access tests are maintained locally in `work/expenses-trial/`. Hosted migration history is authoritative. The browser SDK is pinned to `@supabase/supabase-js` 2.119.2 (MIT), downloaded from the official package's UMD distribution on jsDelivr. Shared app dependencies and Word template resolve from the existing app directory.

## Trial limitations

Start with test receipts. Upload requires internet; failed uploads keep the local draft and can be retried. Incomplete cloud uploads remain visible only to their owner; this pilot has no discard/retention UI. Each listing shows the newest 200 matching claims. Pre-April-2026 mileage has no configured rate and is flagged for accounts; settle that before approving such claims. This pilot covers expense submissions, not shared timesheets. Finance Word/receipt PDF exports reuse the existing app export functions.

Before wider use: exercise first login/password replacement, management and accounts review, upload and downloads with real test logins on iPhone; agree retention/backups and account recovery; review project usage/hosting limits. Supabase currently reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid plan upgrade is made by this change.
