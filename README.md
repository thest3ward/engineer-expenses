# Engineer Expenses and Timesheets

Phone-friendly expense claims with receipt photos, free local OCR, individual receipt checking, a finger signature pad, PDF preview and PDF download.

## Publish with GitHub Pages

Upload the contents of this folder to the root of a new GitHub repository. On a free GitHub account, use a public repository.

In Settings → Pages, choose Deploy from a branch, then main and / (root). Save and wait for GitHub to show the published website link. No build command is required.

Share the website link with engineers. Visitors do not need GitHub or ChatGPT accounts.

## How data is stored

Receipt reading and PDF generation run in the browser. Receipts, details and signatures are saved in IndexedDB on the engineer's device. They are not committed to the repository or uploaded to a shared expenses server. Use Export backup before changing browsers or devices. Clearing browser site data removes saved drafts.

Drafts on the original ChatGPT-hosted trial do not transfer automatically to the GitHub Pages address. Export a backup on the old app, restore it on the new one and check the restored receipt items again.

The PDF includes claim details, any drawn employee signature, office approval lines and numbered receipt photos. Preview allows incomplete drafts, with red NOT CHECKED stamps on unchecked photos. Final download requires all receipts to be valid and checked. Office submission and approval tracking are not connected.

## Dependencies

Vendored browser libraries and English OCR data are included so there is no paid AI service or per-receipt API charge. Third-party license files are in vendor.

This repository package contains the application files only. It excludes the private trial's hosting configuration, Git history, credentials, receipts and test outputs.

## Timesheets

The Timesheets tab records start and finish timestamps in a separate IndexedDB database on the same device. It supports multiple work periods and call-outs, manual corrections, overlap checks, day-by-day review, UK time and calendar-month Excel exports. A saved running period continues when the app is closed; it calculates elapsed time from its stored start timestamp on return.

Record breaks by finishing and starting again. Timesheets do not deduct breaks automatically or calculate overtime, allowances, rounding or payable hours. On-call, bank holiday and nights flags are recorded for later rules. The old supplied workbook is a reference only and is not included in this public repository.

The monthly Excel file has a daily summary and a separate Work periods sheet. Overnight entries are split at UK midnight and month boundaries. Hours are actual elapsed hours, including UK daylight-saving changes. Summary formulas update if detail hours are edited. The detail hours exported from the app are source values; changing an Excel start/finish cell alone does not recalculate those source hours. Make time corrections in the app and export again. The export supports up to 2,000 daily work-period segments per month and blocks larger exports without dropping data. Manual entry rejects the ambiguous repeated UK clock-change hour; automatic clock recording retains its exact timestamp.

Every recorded day must be checked before exporting. Editing a period, name or flags clears affected checks. The file is saved through the device save/share options and does not submit itself to the office. The new calendar-month layout has not been validated against an external payroll upload system.

Time log backups are separate from expense backups. Restore merges non-conflicting entries and requires review again. Finish active periods before moving a log to another device. All records remain local; there is no shared server or automatic device sync. Browser data clearing removes local logs, so export backups for safekeeping.

`time-template.xlsx` is a blank workbook generated with the spreadsheet tooling. JSZip fills it locally in the browser. Third-party JSZip licensing is included in vendor.
