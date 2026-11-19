# Engineer Expenses and Timesheets

Phone-friendly expense claims with receipt photos, free local OCR, individual receipt checking, a finger signature pad, claim preview, editable Word claim forms and separate receipt PDFs.

## Publish with GitHub Pages

Upload the contents of this folder to the root of a new GitHub repository. On a free GitHub account, use a public repository.

In Settings → Pages, choose Deploy from a branch, then main and / (root). Save and wait for GitHub to show the published website link. No build command is required.

Share the website link with engineers. Visitors do not need GitHub or ChatGPT accounts.

## How data is stored

Receipt reading, Word generation and receipt PDF generation run in the browser. Receipts, details and signatures are saved in IndexedDB on the engineer's device. They are not committed to the repository or uploaded to a shared expenses server. Use Export backup before changing browsers or devices. Clearing browser site data removes saved drafts.

Drafts on the original ChatGPT-hosted trial do not transfer automatically to the GitHub Pages address. Export a backup on the old app, restore it on the new one and check the restored receipt items again.

Each form exports an editable .docx claim with employee details, Expense Type, Notes, amounts, mileage and totals, plus a separate PDF of receipt photos. The files share a stable generated claim reference and expense item numbers. Word generation uses the included JSZip library and runs entirely in the browser without a Word installation. The drawn signature is embedded in the Word form. Claim preview permits incomplete drafts and flags unchecked receipts.

Expense Type and Notes are required for every receipt to be checked. Edits clear the check, and checked valid items collapse to one line. Existing draft photos, amounts, notes and signatures are carried into a Personal form. Older receipts missing newly required fields need completion and rechecking. The first migration also keeps the original snapshot under the device's IndexedDB draft store.

Use New form to create additional Personal or Company card forms. Transactions, totals, claim references and exports are owned by each form. Company card expenditure always contributes �0 to employee reimbursement. Forms and timesheets remain stored separately on the same device.

Personal vehicle mileage is available on Personal forms only. Enter the work date, journey notes, distance, fuel type, engine band and personal vehicle confirmation. Company rates are selected automatically for journeys from 1 April 2026; earlier journeys are left for accounts to calculate. Mileage calculations round each item to the nearest penny using integer arithmetic. Company vans are excluded.

Export all forms backup creates a version 2 backup. Import supports original version 1 backups and version 2 collections, adding forms and requiring review again. Existing forms are retained. A duplicate imported form receives a fresh reference. Office submission and approval tracking remain manual.

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

VAT: Each receipt requires an explicit No VAT, 20% VAT shown, or Custom VAT choice before checking. Custom VAT is the VAT amount, not a percentage, and must be between zero and the receipt total. The 20% option calculates VAT as gross / 6, rounded per receipt to pennies; excluding VAT is the remaining amount. Changes clear review. Existing receipts without a choice keep their data and require VAT review before export. Word and preview have receipt-only ex VAT, VAT and inc VAT totals; personal vehicle journeys and miles are in a separate section. Mileage is excluded from receipt VAT totals.

Company mileage schedule effective 1 April 2026: petrol 27p/31p/35p, diesel 27p/30p/33p for <=1600cc / 1601-2000cc / >2000cc. Each personal vehicle journey records fuel and engine band. The app selects the rate by journey date; earlier journeys remain unpriced for accounts. Mileage edits clear review. Legacy mileage fields and stored amounts are retained; missing vehicle selection or a rate inconsistent with the schedule prevents final export until reviewed. The separate Word mileage section includes fuel, engine band, miles, rate and payment.

Duplicate receipt photos: uploads are compared only with photos already in the current form and earlier photos in the same batch. Exact images and conservatively matching resized/recompressed copies prompt a two-photo comparison with Skip duplicate or Keep both. This is a warning, not an automatic deletion; OCR date, merchant and amount matches are not used. Other forms and devices are outside the check. Cropped, rotated or retaken images may not match. No new receipt data or migration is required.

Word claim tables use a fixed 9006-twip width with left alignment and zero indent. Receipt, mileage, summary and approval sections line up; AutoFit is disabled and content wraps inside the fixed columns. Refresh and regenerate existing downloaded claims to apply layout updates.

Duplicate-check update: original uploaded files now carry a local SHA-256 fingerprint, so repeat selections also match when browser image encoding varies. Sparse mostly-white screenshots are eligible for conservative visual comparison. Opening a form or finishing an upload scans existing photos, including checked receipts; Check duplicate photos reruns the scan. Results offer comparisons only and never delete receipts or change their checked status.
