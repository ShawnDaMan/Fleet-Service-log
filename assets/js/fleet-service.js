// Shared JS extracted from fleet_service_log pages
// Sections: utilities, filters, events, add/edit, totals, storage, CSV import/export, init

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
  updateTotals();
  saveTableToStorage();
}

// Delegated event listener for Edit/Save buttons on the table
document.getElementById('serviceTable').addEventListener('click', function(e) {
  if (e.target.classList.contains('edit-btn')) {
    const row = e.target.closest('tr');
    if (row && row.parentElement.id !== 'serviceTable') editRow(row);
  } else if (e.target.classList.contains('save-btn')) {
    const row = e.target.closest('tr');
    if (row && row.parentElement.id !== 'serviceTable') saveRow(row);
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
// SECTION 7: STORAGE
// ========================================
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
}

function loadTableFromStorage() {
  const table = document.getElementById('serviceTable').getElementsByTagName('tbody')[0];
  const data = JSON.parse(localStorage.getItem('fleetServiceLog') || '[]');
  table.innerHTML = '';
  data.forEach((rowData, idx) => {
    if (rowData.vehicleId === '' || rowData.vehicleId.includes('TOTAL')) return;
    const newRow = table.insertRow();
    newRow.insertCell(0).innerText = idx + 1;
    newRow.insertCell(1).innerText = rowData.vehicleId;
    newRow.insertCell(2).innerText = rowData.serviceType;
    newRow.insertCell(3).innerText = rowData.serviceDate;
    newRow.insertCell(4).innerText = rowData.serviceCost;
    newRow.insertCell(5).innerText = rowData.serviceCause;
    newRow.insertCell(6).innerText = rowData.serviceNotes;
    const editCell = newRow.insertCell(7);
    editCell.appendChild(createEditButton());
  });
  updateTotals();
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
  loadTableFromStorage();
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
