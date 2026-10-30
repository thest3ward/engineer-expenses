# Engineer Expenses

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