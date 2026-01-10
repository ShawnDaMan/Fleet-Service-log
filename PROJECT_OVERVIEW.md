# Fleet Service Log - Project Overview

## Purpose
This website is designed to help Brays Motor Museum Shop services track, manage, and analyze vehicle service records. It provides a simple, web-based interface for logging service events, viewing costs, and monitoring vehicle readiness, all powered by Google Sheets for data storage.

## Key Features
- **Google Sheets Integration:** All service data is stored and synced live with a Google Sheet, ensuring easy backup, sharing, and editing.
- **Dashboard Summary:** The homepage displays summary cards for total vehicles serviced, service records, monthly costs, and vehicles ready.
- **Service Log Table:** Users can view, filter, and add service records directly from the web interface.
- **Vehicle Readiness:** The site pulls readiness data from a separate Google Sheet to show how many vehicles are ready for use.
- **Charts and Reports:** Additional pages provide cost breakdowns and trends using data from the Google Sheet.
- **Google Sign-In:** Only signed-in users can add, edit, or delete records. View-only mode is available for others.
- **CSV Export/Import:** Users can export all data to CSV for backup or import data from CSV if needed.

## How It Works
1. **Data Storage:**
   - All service records are stored in a Google Sheet (Sheet1!A:F).
   - Vehicle readiness data is pulled from a separate Google Sheet (Form Responses).
2. **Frontend Logic:**
   - The main logic is in `assets/js/fleet-service.js`, which handles Google API integration, UI updates, filtering, and data sync.
   - The site uses Bootstrap for styling and Google Fonts for a modern look.
3. **User Flow:**
   - Users sign in with Google to unlock full functionality.
   - Data is loaded from Google Sheets and displayed in tables and summary cards.
   - Users can add, edit, or delete service records, which are immediately synced to Google Sheets.
   - Filters and charts help users analyze service history and costs.
4. **Backup:**
   - The site includes a PowerShell script (`backup.ps1`) to quickly back up the entire project to GitHub.
   - Data can also be exported from Google Sheets or the app as CSV for local backup.

## Security Notes
- API keys and client IDs should be kept private and not exposed in public repositories.
- Only authorized users can modify data; others have view-only access.
- Regular backups of both the code and Google Sheet are recommended.

## Maintenance
- To update vehicle/service lists, edit the Google Sheet directly.
- For code changes, use the provided backup script before making modifications.
- If Google API credentials change, update them in the config section of `fleet-service.js`.

## Contact
For questions or issues, see Shawn Nicholson or the Brays Motor Museum Shop services team.
