// Fleet Service Log - Main Frontend Script
// Purpose: Handles all frontend logic for the Fleet Service Log web app.
// Sections: Google Sheets integration, UI logic, filters, events, add/edit, totals, storage, CSV import/export, and initialization.
// Dependencies: Google Sheets API, Google Identity Services, HTML structure (IDs/classes)

// --- Google Sheets API Configuration ---
// Holds all credentials and settings for Google Sheets access
const GOOGLE_SHEETS_CONFIG = {
  apiKey: 'AIzaSyCbwWuijHsYZbe7xObLhZdZrN5y215w1mk', // Google API key for Sheets
  clientId: '798228996956-klknfdqcehur1i4utmdvuug4pnesf1rh.apps.googleusercontent.com', // OAuth2 client ID
  spreadsheetId: '1LoisqqngNaheCz17KR7SmrDXOTt1V8bOD673lQRKd3Q', // Main Fleet Service Log sheet
  range: 'Sheet1!A:F', // Data range for service log
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'], // API discovery
  scope: 'https://www.googleapis.com/auth/spreadsheets' // Full Sheets access
};

// --- Global State Variables ---
let gapiInitialized = false; // True after Google API is loaded
let isSignedIn = false;      // True if user is signed in
let accessToken = null;      // Stores Google OAuth access token
let tokenClient = null;      // Google Identity Services token client
let autoRefreshInterval = null; // Interval for auto-refreshing data

// --- Add global state for user email and domain restriction ---
let userEmail = null;        // Stores signed-in user's email
let isAuthorizedUser = false; // True if user is in Authorized Users sheet
let authorizedEmails = [];   // List of authorized emails from sheet

// --- Google API Initialization ---
// Loads Google API and sets up OAuth token client. (Legacy: used to restore session from localStorage)
function initGoogleAPI() {
  return new Promise((resolve, reject) => {
    if (gapiInitialized) { // Already initialized
      resolve();
      return;
    }
    if (typeof gapi === 'undefined') { // Google API not loaded
      reject(new Error('Google API not loaded'));
      return;
    }
    // Load Google API client
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: GOOGLE_SHEETS_CONFIG.apiKey,
          discoveryDocs: GOOGLE_SHEETS_CONFIG.discoveryDocs
        });
        // Set up OAuth token client for sign-in
        if (typeof google !== 'undefined' && google.accounts) {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_SHEETS_CONFIG.clientId,
            scope: GOOGLE_SHEETS_CONFIG.scope,
            callback: (response) => {
              if (response.error) {
                console.error('Token error:', response);
                return;
              }
              accessToken = response.access_token;
              // Store token and expiry in localStorage (8 hours) [LEGACY: Commented out]
              // const expiryTime = Date.now() + (8 * 3600 * 1000);
              // localStorage.setItem('google_access_token', accessToken);
              // localStorage.setItem('google_token_expiry', expiryTime.toString());
              gapi.client.setToken({access_token: accessToken});
              updateSigninStatus(true); // Update UI for signed-in state
            }
          });
        }
        gapiInitialized = true;
        // Restore session if token is still valid
        // const storedToken = localStorage.getItem('google_access_token');
        // const tokenExpiry = localStorage.getItem('google_token_expiry');
        // if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        //   accessToken = storedToken;
        //   gapi.client.setToken({access_token: accessToken});
        //   updateSigninStatus(true);
        // } else {
        //   // Clear expired token
        //   localStorage.removeItem('google_access_token');
        //   localStorage.removeItem('google_token_expiry');
        //   updateSigninStatus(false);
        // }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// --- Helper to fetch Google user email ---
async function fetchGoogleUserEmail(token) {
  if (!token) return null;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.email || null;
  } catch (e) {
    return null;
  }
}

// --- Update UI and Data State on Sign-in/Sign-out ---
// Controls visibility of UI elements and triggers data loading based on sign-in status.
// Also manages auto-refresh interval for live data.
async function updateSigninStatus(signedIn) {
  isSignedIn = signedIn;
  userEmail = null;
  isAuthorizedUser = false;
  authorizedEmails = [];
  // Get references to key UI elements
  const signInBtn = document.getElementById('signInBtn'); // Google sign-in button
  const signOutBtn = document.getElementById('signOutBtn'); // Google sign-out button
  const serviceForm = document.getElementById('serviceForm'); // Add service form
  const actionsDiv = document.querySelector('.actions'); // CSV import/export controls
  const summaryCards = document.getElementById('summaryCards'); // Dashboard summary cards

  // Helper to set all edit/export UI to read-only
  function setViewOnlyMode() {
    if (serviceForm) serviceForm.style.display = 'none';
    // Hide all edit/delete buttons
    document.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => btn.style.display = 'none');
    // Hide CSV import/export
    if (actionsDiv) actionsDiv.style.display = 'none';
  }

  // Helper to fetch authorized emails from Google Sheet
  async function fetchAuthorizedEmails() {
    try {
      await initGoogleAPI();
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: '1NQjYtL1Q-fZbqwcCv3CNkG8t9wqHhET3LmIK-9yTFyk',
        range: 'Authorized Users!A:A'
      });
      const rows = response.result.values || [];
      return rows.map(r => (r[0] || '').trim().toLowerCase()).filter(email => email);
    } catch (e) {
      return [];
    }
  }

  if (signedIn) {
    // Fetch user email using Google OAuth2 userinfo endpoint
    userEmail = await fetchGoogleUserEmail(accessToken);
    // Fetch authorized emails from sheet
    authorizedEmails = await fetchAuthorizedEmails();
    isAuthorizedUser = userEmail && authorizedEmails.includes(userEmail.toLowerCase());

    // Show/hide UI for signed-in state
    if (signInBtn) signInBtn.style.display = 'none';
    if (signOutBtn) signOutBtn.style.display = 'inline-block';
    if (summaryCards) summaryCards.style.display = 'grid';

    if (isAuthorizedUser) {
      if (serviceForm) serviceForm.style.display = 'block';
      if (actionsDiv) actionsDiv.style.display = 'block';
    } else {
      setViewOnlyMode();
      // Optionally show a warning
      if (!document.getElementById('viewOnlyMsg')) {
        const msg = document.createElement('div');
        msg.id = 'viewOnlyMsg';
        msg.textContent = 'View-only: You are not authorized to edit or export data.';
        msg.style.color = 'red';
        msg.style.margin = '10px 0';
        (serviceForm?.parentElement || document.body).insertBefore(msg, serviceForm);
      }
    }

    // Load data from Google Sheets and update filters
    loadTableFromGoogleSheets().then(() => {
      populateFilterVehicles();
    });

    // Start auto-refresh every 12 minutes (720,000 ms)
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
      loadTableFromGoogleSheets();
    }, 720000);
  } else {
    // Show/hide UI for signed-out (read-only) state
    if (signInBtn) signInBtn.style.display = 'inline-block';
    if (signOutBtn) signOutBtn.style.display = 'none';
    if (serviceForm) serviceForm.style.display = 'none';
    if (actionsDiv) actionsDiv.style.display = 'none';
    if (summaryCards) summaryCards.style.display = 'none';

    // Remove view-only message if present
    const msg = document.getElementById('viewOnlyMsg');
    if (msg) msg.remove();

    // Stop auto-refresh if running
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
    // Try to load data in read-only mode (no sign-in required)
    loadTableFromGoogleSheets()
      .then(() => {
        populateFilterVehicles();
      })
      .catch(() => {
        console.log('Not signed in - viewing in read-only mode');
      });
  }
}

// --- Google Sign-in Handler ---
// Triggers OAuth flow to request access token from Google
function handleSignIn() {
  if (tokenClient) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  }
}

// --- Google Sign-out Handler ---
// Revokes access token, clears localStorage, and updates UI to signed-out state
function handleSignOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log('Access token revoked');
    });
    accessToken = null;
    gapi.client.setToken(null);
  }
  // Remove token from localStorage [LEGACY: Commented out]
  // localStorage.removeItem('google_access_token');
  // localStorage.removeItem('google_token_expiry');
  updateSigninStatus(false);
}

// --- Helper Functions ---
// parseCost: Converts a string (e.g. "$1,234.56") to a float number. Used for cost calculations.
function parseCost(str) {
  return parseFloat(String(str).replace(/[^0-9.-]+/g, '')) || 0;
}

// formatCost: Formats a number as a currency string (e.g. 1234.56 → "$1,234.56")
function formatCost(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// createEditButton: Returns a styled Edit button element for table rows
function createEditButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Edit';
  btn.classList.add('edit-btn');
  return btn;
}

// createSaveButton: Returns a styled Save button element for table rows
function createSaveButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Save';
  btn.classList.add('save-btn');
  return btn;
}

// createDeleteButton: Returns a styled Delete button element for table rows
function createDeleteButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Delete';
  btn.classList.add('delete-btn');
  btn.style.marginLeft = '8px';
  btn.style.background = '#e74c3c';
  return btn;
}

// ========================================
// SECTION 1: UTILITY FUNCTIONS - Show/Hide "Other" inputs
// ========================================
// Shows or hides the "Other" vehicle input based on dropdown selection
function toggleOtherVehicle() {
  const select = document.getElementById('vehicleIdSelect');
  const otherInput = document.getElementById('vehicleIdOther');
  otherInput.style.display = select.value === 'other' ? '' : 'none';
  otherInput.required = select.value === 'other';
}

// Shows or hides the "Other" service type input based on dropdown selection
function toggleOtherServiceType() {
  const select = document.getElementById('serviceTypeSelect');
  const otherInput = document.getElementById('serviceTypeOther');
  otherInput.style.display = select.value === 'other' ? '' : 'none';
  otherInput.required = select.value === 'other';
}

// ========================================
// SECTION 2: FILTER FUNCTIONS - Populate and apply filters
// ========================================
// Populates the filter dropdowns for Vehicle ID and Service Type using data from the tables
function populateFilterVehicles() {
  const filterSelect = document.getElementById('filterVehicleId');
  const filterServiceType = document.getElementById('filterServiceType');
  const vehicles = new Set();
  const serviceTypes = new Set();
  // Use vehicle IDs and service types from Totals by Vehicle table for filter dropdowns
  const totalsTable = document.getElementById('totalsTable').getElementsByTagName('tbody')[0];
  const serviceTable = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  for (let i = 0; i < totalsTable.rows.length; i++) {
    const vehicleId = totalsTable.rows[i].cells[0].innerText.trim();
    if (vehicleId) vehicles.add(vehicleId);
  }
  for (let i = 0; i < serviceTable.rows.length; i++) {
    const serviceType = serviceTable.rows[i].cells[2].innerText.trim();
    if (serviceType) serviceTypes.add(serviceType);
  }
  // Add any vehicles from the add form dropdown
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  Array.from(vehicleSelect.options).forEach(opt => {
    if (opt.value && opt.value !== 'other') vehicles.add(opt.value);
  });
  // Clear and repopulate vehicle filter dropdown
  while (filterSelect.options.length > 1) {
    filterSelect.remove(1);
  }
  const sortedVehicles = Array.from(vehicles).sort();
  sortedVehicles.forEach(vehicle => {
    const option = document.createElement('option');
    option.value = vehicle;
    option.textContent = vehicle;
    filterSelect.appendChild(option);
  });
  // Populate service type filter
  while (filterServiceType.options.length > 1) {
    filterServiceType.remove(1);
  }
  const sortedTypes = Array.from(serviceTypes).sort();
  sortedTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    filterServiceType.appendChild(option);
  });
}

function applyFilters() {
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const vehicleFilter = document.getElementById('filterVehicleId').value;
  const serviceTypeFilter = document.getElementById('filterServiceType').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  let totalCost = 0;
  let visibleCount = 0;
  // Filter rows and update display
  let filteredRows = [];
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.classList.contains('total-row')) continue;
    const vehicleId = row.cells[1].innerText;
    const serviceType = row.cells[2].innerText;
    const serviceDate = row.cells[3].innerText;
    const cost = parseCost(row.cells[4].innerText);
    let showRow = true;
    if (vehicleFilter && vehicleId !== vehicleFilter) showRow = false;
    if (showRow && serviceTypeFilter && serviceType !== serviceTypeFilter) showRow = false;
    if (showRow && dateFrom && serviceDate < dateFrom) showRow = false;
    if (showRow && dateTo && serviceDate > dateTo) showRow = false;
    row.style.display = showRow ? '' : 'none';
    if (showRow) {
      totalCost += cost;
      visibleCount++;
      filteredRows.push(row);
    }
  }
  // Remove any existing total row
  const existingTotalRow = table.querySelector('.total-row');
  if (existingTotalRow) existingTotalRow.remove();
  if (visibleCount > 0) {
    const totalRow = table.insertRow();
    totalRow.classList.add('total-row');
    totalRow.style.fontWeight = 'bold';
    totalRow.style.background = '#eaf1f7';
    totalRow.insertCell(0).innerText = '';
    totalRow.insertCell(1).innerText = '';
    totalRow.insertCell(2).innerText = '';
    totalRow.insertCell(3).innerText = 'TOTAL (' + visibleCount + '):';
    totalRow.insertCell(4).innerText = formatCost(totalCost);
    totalRow.insertCell(5).innerText = '';
    totalRow.insertCell(6).innerText = '';
    totalRow.insertCell(7).innerText = '';
  }
  // Update paging to only use filtered rows
  if (typeof window.allServiceRows !== 'undefined') {
    window.allServiceRows = filteredRows;
    if (typeof window.showServicePage === 'function') {
      window.showServicePage(1);
    }
  }
}

function clearFilters() {
  document.getElementById('filterVehicleId').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  for (let i = 0; i < table.rows.length; i++) table.rows[i].style.display = '';
  const existingTotalRow = table.querySelector('.total-row');
  if (existingTotalRow) existingTotalRow.remove();
}

// ========================================
// SECTION 3: EVENT LISTENERS
// ========================================
// Set up event listeners for dropdowns and filter buttons after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Show/hide "Other" input fields when dropdowns change
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  if (vehicleSelect) vehicleSelect.addEventListener('change', toggleOtherVehicle);
  const serviceTypeSelect = document.getElementById('serviceTypeSelect');
  if (serviceTypeSelect) serviceTypeSelect.addEventListener('change', toggleOtherServiceType);
  // Filter and clear filter buttons
  const filterBtn = document.getElementById('filterBtn');
  if (filterBtn) filterBtn.addEventListener('click', applyFilters);
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  if (clearFilterBtn) clearFilterBtn.addEventListener('click', clearFilters);

  // CSV Export/Import event listeners
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!isAuthorizedUser) {
      alert('Only authorized users can export data.');
      return;
    }
    let csv = 'Row,Vehicle ID,Service Type,Date,Cost (USD),Cause,Notes\n';
    data.forEach((r, i) => {
      const rowData = [i+1, r.vehicleId, r.serviceType, r.serviceDate, r.serviceCost, r.serviceCause, r.serviceNotes];
      csv += rowData.map(v => '"' + String(v || '').replace(/"/g,'""') + '"').join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fleet_service_log.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  });

  const importBtn = document.getElementById('importCsvBtn');
  if (importBtn) importBtn.addEventListener('click', function() {
    if (!isAuthorizedUser) {
      alert('Only authorized users can import data.');
      return;
    }
    const input = document.getElementById('importCsvInput');
    if (!input.files.length) { alert('Please select a CSV file to import.'); return; }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(ev) { importFromCSV(ev.target.result); };
    reader.readAsText(file);
  });
});

// ========================================
// SECTION 4: ADD SERVICE
// ========================================
// Handles form submission for adding a new service record
document.addEventListener('submit', function(e) {
  const target = e.target;
  if (!target || target.id !== 'serviceForm') return;
  e.preventDefault();
  if (!isAuthorizedUser) {
    alert('Only authorized users can add new records.');
    return;
  }
  // Get vehicle ID (handle "Other" case)
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  let vehicleId = vehicleSelect.value;
  if (vehicleId === 'other') {
    vehicleId = document.getElementById('vehicleIdOther').value;
    // Add new vehicle to dropdown if not present
    if (vehicleId && !Array.from(vehicleSelect.options).some(opt => opt.value === vehicleId)) {
      const newOption = document.createElement('option');
      newOption.value = vehicleId;
      newOption.textContent = vehicleId;
      vehicleSelect.insertBefore(newOption, vehicleSelect.options[vehicleSelect.options.length - 1]);
    }
  }
  // Get service type (handle "Other" case)
  const serviceTypeSelect = document.getElementById('serviceTypeSelect');
  let serviceType = serviceTypeSelect.value;
  if (serviceType === 'other') {
    serviceType = document.getElementById('serviceTypeOther').value;
    // Add new service type to dropdown if not present
    if (serviceType && !Array.from(serviceTypeSelect.options).some(opt => opt.value === serviceType)) {
      const newOption = document.createElement('option');
      newOption.value = serviceType;
      newOption.textContent = serviceType;
      serviceTypeSelect.insertBefore(newOption, serviceTypeSelect.options[serviceTypeSelect.options.length - 1]);
    }
  }
  // Get other form values
  const serviceDate = document.getElementById('serviceDate').value;
  const serviceCost = Number(document.getElementById('serviceCost').value).toFixed(2);
  const serviceCause = document.getElementById('serviceCause').value;
  const serviceNotes = document.getElementById('serviceNotes').value;
  // Add new row to service table
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const rowCount = table.rows.length + 1;
  const newRow = table.insertRow();
  newRow.insertCell(0).innerText = rowCount;
  newRow.insertCell(1).innerText = vehicleId;
  newRow.insertCell(2).innerText = serviceType;
  newRow.insertCell(3).innerText = serviceDate;
  newRow.insertCell(4).innerText = formatCost(serviceCost);
  newRow.insertCell(5).innerText = serviceCause;
  newRow.insertCell(6).innerText = serviceNotes;
  const editCell = newRow.insertCell(7);
  editCell.appendChild(createEditButton());
  editCell.appendChild(createDeleteButton());
  // Reset form and update UI
  document.getElementById('serviceForm').reset();
  toggleOtherVehicle();
  toggleOtherServiceType();
  updateTotals();
  populateFilterVehicles();
  // saveTableToStorage(); // [LEGACY: Commented out]
});

// ========================================
// SECTION 5: EDIT/SAVE with Event Delegation
// ========================================
function editRow(row) {
  if (!isAuthorizedUser) {
    alert('Only authorized users can edit data.');
    return;
  }
  for (let i = 1; i <= 6; i++) {
    const cell = row.cells[i];
    const value = cell.innerText;
    let input;
    if (i === 3) { input = document.createElement('input'); input.type = 'date'; input.value = value; }
    else if (i === 4) { input = document.createElement('input'); input.type = 'number'; input.step = '0.01'; input.value = value.replace('$',''); }
    else { input = document.createElement('input'); input.type = 'text'; input.value = value; }
    cell.innerHTML = '';
    cell.appendChild(input);
  }
  const editCell = row.cells[7];
  editCell.innerHTML = '';
  editCell.appendChild(createSaveButton());
}

function saveRow(row) {
  if (!isAuthorizedUser) {
    alert('Only authorized users can save data.');
    return;
  }
  for (let i = 1; i <= 6; i++) {
    const cell = row.cells[i];
    const input = cell.querySelector('input');
    let value = input.value;
    if (i === 4) value = formatCost(parseFloat(value));
    cell.innerHTML = value;
  }
  const editCell = row.cells[7];
  editCell.innerHTML = '';
  editCell.appendChild(createEditButton());
  editCell.appendChild(createDeleteButton());
  updateTotals();
  // saveTableToStorage(); // [LEGACY: Commented out]
}

function deleteRow(row) {
  if (!isAuthorizedUser) {
    alert('Only authorized users can delete data.');
    return;
  }
  if (confirm('Are you sure you want to delete this service record?')) {
    row.remove();
    // Renumber rows
    const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
    for (let i = 0; i < table.rows.length; i++) {
      if (!table.rows[i].classList.contains('total-row') && !table.rows[i].classList.contains('grand-total-row')) {
        table.rows[i].cells[0].innerText = i + 1;
      }
    }
    updateTotals();
    populateFilterVehicles();
    // saveTableToStorage(); // [LEGACY: Commented out]
  }
}

// Delegated event listener for Edit/Save/Delete buttons on the table
document.getElementById('serviceTable').addEventListener('click', function(e) {
  if (e.target.classList.contains('edit-btn')) {
    const row = e.target.closest('tr');
    if (!isAuthorizedUser) {
      alert('Only authorized users can edit data.');
      return;
    }
    editRow(row);
  } else if (e.target.classList.contains('save-btn')) {
    const row = e.target.closest('tr');
    saveRow(row);
  } else if (e.target.classList.contains('delete-btn')) {
    const row = e.target.closest('tr');
    deleteRow(row);
  }
});
