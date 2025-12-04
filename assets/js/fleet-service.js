// Shared JS extracted from fleet_service_log pages
// Sections: utilities, filters, events, add/edit, totals, storage, CSV import/export, init

// Google Sheets Configuration
const GOOGLE_SHEETS_CONFIG = {
  apiKey: 'AIzaSyCbwWuijHsYZbe7xObLhZdZrN5y215w1mk',
  clientId: '798228996956-klknfdqcehur1i4utmdvuug4pnesf1rh.apps.googleusercontent.com',
  spreadsheetId: '1LoisqqngNaheCz17KR7SmrDXOTt1V8bOD673lQRKd3Q',
  range: 'Sheet1!A:F',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  scope: 'https://www.googleapis.com/auth/spreadsheets'
};

let gapiInitialized = false;
let isSignedIn = false;
let accessToken = null;
let tokenClient = null;

// Initialize Google API with new GIS
function initGoogleAPI() {
  return new Promise((resolve, reject) => {
    if (gapiInitialized) {
      resolve();
      return;
    }
    if (typeof gapi === 'undefined') {
      reject(new Error('Google API not loaded'));
      return;
    }
    
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: GOOGLE_SHEETS_CONFIG.apiKey,
          discoveryDocs: GOOGLE_SHEETS_CONFIG.discoveryDocs
        });
        
        // Initialize Google Identity Services token client
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
              // Store token with expiry (8 hours)
              const expiryTime = Date.now() + (8 * 3600 * 1000);
              localStorage.setItem('google_access_token', accessToken);
              localStorage.setItem('google_token_expiry', expiryTime.toString());
              gapi.client.setToken({access_token: accessToken});
              updateSigninStatus(true);
            }
          });
        }
        
        gapiInitialized = true;
        
        // Check for stored token
        const storedToken = localStorage.getItem('google_access_token');
        const tokenExpiry = localStorage.getItem('google_token_expiry');
        
        if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
          // Token still valid, restore session
          accessToken = storedToken;
          gapi.client.setToken({access_token: accessToken});
          updateSigninStatus(true);
        } else {
          // Clear expired token
          localStorage.removeItem('google_access_token');
          localStorage.removeItem('google_token_expiry');
          updateSigninStatus(false);
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function updateSigninStatus(signedIn) {
  isSignedIn = signedIn;
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const serviceForm = document.getElementById('serviceForm');
  const actionsDiv = document.querySelector('.actions');
  
  if (signedIn) {
    if (signInBtn) signInBtn.style.display = 'none';
    if (signOutBtn) signOutBtn.style.display = 'inline-block';
    if (serviceForm) serviceForm.style.display = 'block';
    if (actionsDiv) actionsDiv.style.display = 'block';
    
    // Load data after sign-in
    loadTableFromGoogleSheets();
  } else {
    if (signInBtn) signInBtn.style.display = 'inline-block';
    if (signOutBtn) signOutBtn.style.display = 'none';
    if (serviceForm) serviceForm.style.display = 'none';
    if (actionsDiv) actionsDiv.style.display = 'none';
    
    // Try to load data in read-only mode
    loadTableFromGoogleSheets().catch(() => {
      console.log('Not signed in - viewing in read-only mode');
    });
  }
}

function handleSignIn() {
  if (tokenClient) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  }
}

function handleSignOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log('Access token revoked');
    });
    accessToken = null;
    gapi.client.setToken(null);
  }
  // Clear stored token
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expiry');
  updateSigninStatus(false);
}

// Helpers
function parseCost(str) {
  return parseFloat(String(str).replace(/[^0-9.-]+/g, '')) || 0;
}

function formatCost(n) {
  return '$' + Number(n || 0).toFixed(2);
}

function createEditButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Edit';
  btn.classList.add('edit-btn');
  return btn;
}

function createSaveButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Save';
  btn.classList.add('save-btn');
  return btn;
}

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
function toggleOtherVehicle() {
  const select = document.getElementById('vehicleIdSelect');
  const otherInput = document.getElementById('vehicleIdOther');
  otherInput.style.display = select.value === 'other' ? '' : 'none';
  otherInput.required = select.value === 'other';
}

function toggleOtherServiceType() {
  const select = document.getElementById('serviceTypeSelect');
  const otherInput = document.getElementById('serviceTypeOther');
  otherInput.style.display = select.value === 'other' ? '' : 'none';
  otherInput.required = select.value === 'other';
}

// ========================================
// SECTION 2: FILTER FUNCTIONS - Populate and apply filters
// ========================================
function populateFilterVehicles() {
  const filterSelect = document.getElementById('filterVehicleId');
  const vehicles = new Set();
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  for (let i = 0; i < table.rows.length; i++) {
    const vehicleId = table.rows[i].cells[1].innerText;
    if (vehicleId) vehicles.add(vehicleId);
  }
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  Array.from(vehicleSelect.options).forEach(opt => {
    if (opt.value && opt.value !== 'other') vehicles.add(opt.value);
  });
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
}

function applyFilters() {
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const vehicleFilter = document.getElementById('filterVehicleId').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  let totalCost = 0;
  let visibleCount = 0;
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.classList.contains('total-row')) continue;
    const vehicleId = row.cells[1].innerText;
    const serviceDate = row.cells[3].innerText;
    const cost = parseCost(row.cells[4].innerText);
    let showRow = true;
    if (vehicleFilter && vehicleId !== vehicleFilter) showRow = false;
    if (showRow && dateFrom && serviceDate < dateFrom) showRow = false;
    if (showRow && dateTo && serviceDate > dateTo) showRow = false;
    row.style.display = showRow ? '' : 'none';
    if (showRow) { totalCost += cost; visibleCount++; }
  }
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
document.addEventListener('DOMContentLoaded', function() {
  // Use event delegation for table edit/save if needed later
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  if (vehicleSelect) vehicleSelect.addEventListener('change', toggleOtherVehicle);
  const serviceTypeSelect = document.getElementById('serviceTypeSelect');
  if (serviceTypeSelect) serviceTypeSelect.addEventListener('change', toggleOtherServiceType);
  const filterBtn = document.getElementById('filterBtn');
  if (filterBtn) filterBtn.addEventListener('click', applyFilters);
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  if (clearFilterBtn) clearFilterBtn.addEventListener('click', clearFilters);
});

// ========================================
// SECTION 4: ADD SERVICE
// ========================================
document.addEventListener('submit', function(e) {
  const target = e.target;
  if (!target || target.id !== 'serviceForm') return;
  e.preventDefault();
  const vehicleSelect = document.getElementById('vehicleIdSelect');
  let vehicleId = vehicleSelect.value;
  if (vehicleId === 'other') {
    vehicleId = document.getElementById('vehicleIdOther').value;
    if (vehicleId && !Array.from(vehicleSelect.options).some(opt => opt.value === vehicleId)) {
      const newOption = document.createElement('option');
      newOption.value = vehicleId;
      newOption.textContent = vehicleId;
      vehicleSelect.insertBefore(newOption, vehicleSelect.options[vehicleSelect.options.length - 1]);
    }
  }
  const serviceTypeSelect = document.getElementById('serviceTypeSelect');
  let serviceType = serviceTypeSelect.value;
  if (serviceType === 'other') {
    serviceType = document.getElementById('serviceTypeOther').value;
    if (serviceType && !Array.from(serviceTypeSelect.options).some(opt => opt.value === serviceType)) {
      const newOption = document.createElement('option');
      newOption.value = serviceType;
      newOption.textContent = serviceType;
      serviceTypeSelect.insertBefore(newOption, serviceTypeSelect.options[serviceTypeSelect.options.length - 1]);
    }
  }
  const serviceDate = document.getElementById('serviceDate').value;
  const serviceCost = Number(document.getElementById('serviceCost').value).toFixed(2);
  const serviceCause = document.getElementById('serviceCause').value;
  const serviceNotes = document.getElementById('serviceNotes').value;
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
  document.getElementById('serviceForm').reset();
  toggleOtherVehicle();
  toggleOtherServiceType();
  updateTotals();
  populateFilterVehicles();
  saveTableToStorage();
});

// ========================================
// SECTION 5: EDIT/SAVE with Event Delegation
// ========================================
function editRow(row) {
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
  saveTableToStorage();
}

function deleteRow(row) {
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
    saveTableToStorage();
  }
}

// Delegated event listener for Edit/Save/Delete buttons on the table
document.getElementById('serviceTable').addEventListener('click', function(e) {
  if (e.target.classList.contains('edit-btn')) {
    const row = e.target.closest('tr');
    if (row && row.parentElement.id !== 'serviceTable') editRow(row);
  } else if (e.target.classList.contains('save-btn')) {
    const row = e.target.closest('tr');
    if (row && row.parentElement.id !== 'serviceTable') saveRow(row);
  } else if (e.target.classList.contains('delete-btn')) {
    const row = e.target.closest('tr');
    if (row && row.parentElement.id !== 'serviceTable') deleteRow(row);
  }
});

// ========================================
// SECTION 6: TOTALS
// ========================================
function updateTotals() {
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const totals = {};
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.classList.contains('grand-total-row') || row.classList.contains('total-row')) continue;
    const vehicleId = row.cells[1].innerText;
    let cost = parseCost(row.cells[4].innerText);
    if (!totals[vehicleId]) totals[vehicleId] = 0;
    totals[vehicleId] += cost;
  }
  const existingGrandTotal = table.querySelector('.grand-total-row');
  if (existingGrandTotal) existingGrandTotal.remove();
  const totalsTable = document.getElementById('totalsTable').getElementsByTagName('tbody')[0];
  totalsTable.innerHTML = '';
  Object.keys(totals).forEach(vehicle => {
    const tr = document.createElement('tr');
    const tdVehicle = document.createElement('td'); tdVehicle.innerText = vehicle;
    const tdTotal = document.createElement('td'); tdTotal.innerText = formatCost(totals[vehicle]);
    tr.appendChild(tdVehicle); tr.appendChild(tdTotal); totalsTable.appendChild(tr);
  });
}

// ========================================
// SECTION 7: GOOGLE SHEETS STORAGE
// ========================================
async function saveTableToGoogleSheets() {
  try {
    await initGoogleAPI();
    const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
    const values = [];
    
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      if (row.classList.contains('total-row') || row.classList.contains('grand-total-row')) continue;
      values.push([
        row.cells[1].innerText, // Vehicle ID → Sheet column A
        row.cells[2].innerText, // Service Type → Sheet column B
        row.cells[3].innerText, // Date → Sheet column C
        row.cells[4].innerText, // Cost → Sheet column D
        row.cells[5].innerText, // Cause → Sheet column E
        row.cells[6].innerText  // Notes → Sheet column F
      ]);
    }
    
    // Clear existing data first
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: 'Sheet1!A2:F1000'
    });
    
    // Write new data
    if (values.length > 0) {
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
        range: 'Sheet1!A2',
        valueInputOption: 'USER_ENTERED',
        resource: { values: values }
      });
    }
    
    console.log('Data saved to Google Sheets successfully');
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    alert('Failed to save to Google Sheets. Check console for details.');
  }
}

async function loadTableFromGoogleSheets() {
  try {
    await initGoogleAPI();
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      range: GOOGLE_SHEETS_CONFIG.range
    });
    
    const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
    table.innerHTML = '';
    
    const rows = response.result.values || [];
    // Skip header row (index 0)
    rows.slice(1).forEach((rowData, idx) => {
      if (!rowData[0] || rowData[0] === '' || rowData[0]?.includes('TOTAL')) return;
      
      const newRow = table.insertRow();
      newRow.insertCell(0).innerText = idx + 1; // Row number
      newRow.insertCell(1).innerText = rowData[0] || ''; // Vehicle ID from Sheet column A
      newRow.insertCell(2).innerText = rowData[1] || ''; // Service Type from Sheet column B
      newRow.insertCell(3).innerText = rowData[2] || ''; // Date from Sheet column C
      newRow.insertCell(4).innerText = rowData[3] || '$0.00'; // Cost from Sheet column D
      newRow.insertCell(5).innerText = rowData[4] || ''; // Cause from Sheet column E
      newRow.insertCell(6).innerText = rowData[5] || ''; // Notes from Sheet column F
      
      const editCell = newRow.insertCell(7);
      editCell.appendChild(createEditButton());
      editCell.appendChild(createDeleteButton());
    });
    
    // Show/hide buttons based on sign-in status
    if (isSignedIn) {
      const allButtons = table.querySelectorAll('.edit-btn, .delete-btn');
      allButtons.forEach(btn => btn.style.display = 'inline-block');
    } else {
      const allButtons = table.querySelectorAll('.edit-btn, .delete-btn');
      allButtons.forEach(btn => btn.style.display = 'none');
    }
    
    updateTotals();
    console.log('Data loaded from Google Sheets successfully');
  } catch (error) {
    console.error('Error loading from Google Sheets:', error);
    console.error('Error details:', error.result ? error.result.error : error.message);
    
    // Only show alert if signed in (otherwise it's expected to fail)
    if (isSignedIn) {
      alert('Failed to load from Google Sheets: ' + (error.result?.error?.message || error.message || 'Unknown error'));
    }
  }
}

// Keep localStorage functions for backward compatibility / offline mode
function saveTableToStorage() {
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const data = [];
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    if (row.classList.contains('total-row') || row.classList.contains('grand-total-row')) continue;
    data.push({
      number: row.cells[0].innerText,
      vehicleId: row.cells[1].innerText,
      serviceType: row.cells[2].innerText,
      serviceDate: row.cells[3].innerText,
      serviceCost: row.cells[4].innerText,
      serviceCause: row.cells[5].innerText,
      serviceNotes: row.cells[6].innerText
    });
  }
  localStorage.setItem('fleetServiceLog', JSON.stringify(data));
  // Also save to Google Sheets
  saveTableToGoogleSheets();
}

function loadTableFromStorage() {
  // Load from Google Sheets instead
  loadTableFromGoogleSheets();
}

// ========================================
// SECTION 8: EXPORT/IMPORT CSV
// ========================================
document.addEventListener('click', function(e) {
  if (!e.target) return;
  if (e.target.id === 'exportCsvBtn') {
    const data = JSON.parse(localStorage.getItem('fleetServiceLog') || '[]');
    let csv = 'Row,Vehicle ID,Service Type,Date,Cost (USD),Cause,Notes\n';
    data.forEach((r, i) => {
      const rowData = [i+1, r.vehicleId, r.serviceType, r.serviceDate, r.serviceCost, r.serviceCause, r.serviceNotes];
      csv += rowData.map(v => '"' + String(v || '').replace(/"/g,'""') + '"').join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fleet_service_log.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  else if (e.target.id === 'importCsvBtn') {
    const input = document.getElementById('importCsvInput');
    if (!input.files.length) { alert('Please select a CSV file to import.'); return; }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(ev) { importFromCSV(ev.target.result); };
    reader.readAsText(file);
  }
});

function importFromCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return;
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  table.innerHTML = '';
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (row.length < 7) continue;
    const firstCell = row[0].replace(/(^"|"$)/g, '').replace(/""/g, '"');
    if (firstCell === '' || firstCell.includes('TOTAL')) continue;
    const newRow = table.insertRow();
    for (let j = 0; j < 7; j++) {
      let cellText = row[j].replace(/(^"|"$)/g, '').replace(/""/g, '"');
      newRow.insertCell(j).innerText = cellText;
    }
    const editCell = newRow.insertCell(7);
    editCell.appendChild(createEditButton());
  }
  updateTotals();
  saveTableToStorage();
}

// ========================================
// SECTION 9: PAGE INITIALIZATION
// ========================================
window.onload = function() {
  // Initialize Google API and then load data
  initGoogleAPI().catch(error => {
    console.error('Failed to initialize Google API:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    if (error.details) console.error('Error details object:', error.details);
    // Fallback: show sign-in button anyway
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) signInBtn.style.display = 'inline-block';
  });
  
  populateFilterVehicles();
  toggleOtherVehicle();
  toggleOtherServiceType();
  const defaultFrom = document.getElementById('filterDateFrom');
  if (defaultFrom) defaultFrom.value = '2025-01-01';
  const today = new Date();
  const todayFormatted = today.toISOString().split('T')[0];
  const toEl = document.getElementById('filterDateTo');
  if (toEl) toEl.value = todayFormatted;
};
