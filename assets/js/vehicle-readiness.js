// Google Sheets Configuration for Vehicle Readiness
const READINESS_CONFIG = {
  apiKey: 'AIzaSyCbwWuijHsYZbe7xObLhZdZrN5y215w1mk',
  clientId: '798228996956-klknfdqcehur1i4utmdvuug4pnesf1rh.apps.googleusercontent.com',
  spreadsheetId: '1NQjYtL1Q-fZbqwcCv3CNkG8t9wqHhET3LmIK-9yTFyk',
  range: 'Form Responses!A:M',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  scope: 'https://www.googleapis.com/auth/spreadsheets'
};

let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;
let isSignedIn = false;
let autoRefreshInterval = null;

// Pagination variables
let currentPage = 1;
let rowsPerPage = 50;
let allIssuesData = [];

// Initialize Google API
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: READINESS_CONFIG.apiKey,
    discoveryDocs: READINESS_CONFIG.discoveryDocs,
  });
  gapiInited = true;
  
  // Check for stored token
  const storedToken = localStorage.getItem('google_access_token');
  const tokenExpiry = localStorage.getItem('google_token_expiry');
  
  if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
    accessToken = storedToken;
    gapi.client.setToken({access_token: accessToken});
  }
  
  // Check if elements exist, if not wait
  const checkAndLoad = () => {
    const grid = document.getElementById('readinessGrid');
    const tbody = document.getElementById('issuesTableBody');
    
    if (grid && tbody) {
      updateSigninStatus(true);
      loadReadinessData();
    } else {
      setTimeout(checkAndLoad, 100);
    }
  };
  
  checkAndLoad();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: READINESS_CONFIG.clientId,
    scope: READINESS_CONFIG.scope,
    callback: (response) => {
      accessToken = response.access_token;
      const expiryTime = Date.now() + (8 * 3600 * 1000);
      localStorage.setItem('google_access_token', accessToken);
      localStorage.setItem('google_token_expiry', expiryTime);
      gapi.client.setToken({access_token: accessToken});
      loadReadinessData();
    },
  });
  gisInited = true;
}

function handleSignIn() {
  if (!tokenClient) {
    const checkInterval = setInterval(() => {
      if (tokenClient) {
        clearInterval(checkInterval);
        tokenClient.requestAccessToken({prompt: 'consent'});
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!tokenClient) {
        alert('Authentication system failed to load. Please refresh the page.');
      }
    }, 5000);
  } else {
    tokenClient.requestAccessToken({prompt: 'consent'});
  }
}

function updateSigninStatus(ready) {
  // Always show content for public access
  document.getElementById('summaryStats').style.display = 'flex';
  document.getElementById('readinessGrid').style.display = 'grid';
  
  // Start auto-refresh every 60 seconds
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    loadReadinessData();
  }, 60000);
}

function handleSignOut() {
  accessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expiry');
  gapi.client.setToken(null);
  loadReadinessData();
  alert('You have been signed out.');
}

// Load readiness data from Google Sheets
let isLoading = false;
async function loadReadinessData() {
  if (isLoading) return;
  
  isLoading = true;
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: READINESS_CONFIG.range
    });

    const rows = response.result.values || [];
    
    if (rows.length === 0) {
      document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #7f8c8d;">No data found.</p>';
      return;
    }
    
    if (rows.length === 1) {
      document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #7f8c8d;">No issues reported yet. All vehicles are ready!</p>';
      updateSummaryCounts(8, 0, 0);
      return;
    }

    const issuesByVehicle = {};
    
    rows.slice(1).forEach((row, index) => {
      const vehicleMake = (row[1] || '').trim();
      const vehicleModel = (row[2] || '').trim();
      const vehicleName = `${vehicleMake} ${vehicleModel}`.trim().replace(/\s+/g, ' ');
      
      if (!vehicleName) return;
      
      const issue = {
        rowIndex: index + 2,
        question: row[0] || '',
        division: row[3] || '',
        date: row[4] || '',
        mainIssue: row[5] || '',
        writtenBy: row[6] || '',
        priority: (row[7] || '').toLowerCase(),
        submittedBy: row[8] || '',
        timestamp: row[9] || '',
        manualStatus: row[10] || '',
        dateReviewed: row[11] || '',
        notedIssues: row[12] || ''
      };
      
      if (!issuesByVehicle[vehicleName]) {
        issuesByVehicle[vehicleName] = [];
      }
      
      issuesByVehicle[vehicleName].push(issue);
    });

    displayReadinessCards(issuesByVehicle, rows);
    displayIssuesTable(rows);
  } catch (error) {
    console.error('Error loading readiness data:', error);
    document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #e74c3c;">Error loading data. Please try again.</p>';
  } finally {
    isLoading = false;
  }
}

function displayReadinessCards(issuesByVehicle, allRows) {
  try {
    const grid = document.getElementById('readinessGrid');
    
    if (!grid) {
      console.error('readinessGrid element not found!');
      return;
    }
    
    grid.innerHTML = '';
  
  let readyCount = 0;
  let warningCount = 0;
  let notReadyCount = 0;

  const allVehicles = new Set();
  
  if (allRows && allRows.length > 1) {
    allRows.slice(1).forEach((row) => {
      const vehicleMake = (row[1] || '').trim();
      const vehicleModel = (row[2] || '').trim();
      const vehicleName = `${vehicleMake} ${vehicleModel}`.trim().replace(/\s+/g, ' ');
      if (vehicleName) {
        allVehicles.add(vehicleName);
      }
    });
  }
  
  const sortedVehicles = Array.from(allVehicles).sort();
  
  populateVehicleDropdown(sortedVehicles);
  
  Array.from(allVehicles).sort().forEach(vehicleName => {
    const issues = issuesByVehicle[vehicleName] || [];
    const unreviewedIssues = issues.filter(issue => !issue.dateReviewed);
    const highPriorityIssues = unreviewedIssues.filter(issue => issue.priority.includes('high'));
    
    const latestStatusOverride = issues
      .filter(issue => issue.manualStatus)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    let status = 'ready';
    let statusText = 'Ready';
    let cardClass = 'vehicle-card';
    
    const mediumHighPriorityIssues = unreviewedIssues.filter(issue => 
      !issue.priority.includes('low')
    );
    
    if (highPriorityIssues.length > 0) {
      status = 'not-ready';
      statusText = 'Not Ready';
      cardClass = 'vehicle-card not-ready';
      notReadyCount++;
    } else if (mediumHighPriorityIssues.length > 0) {
      status = 'warning';
      statusText = 'Needs Attention';
      cardClass = 'vehicle-card warning';
      warningCount++;
    } else if (latestStatusOverride) {
      if (latestStatusOverride.manualStatus.toLowerCase().includes('not ready')) {
        status = 'not-ready';
        statusText = 'Not Ready (Manual)';
        cardClass = 'vehicle-card not-ready';
        notReadyCount++;
      } else {
        status = 'ready';
        statusText = 'Ready (Manual)';
        cardClass = 'vehicle-card';
        readyCount++;
      }
    } else {
      readyCount++;
    }

    const card = document.createElement('div');
    card.className = cardClass;
    
    let issuesHtml = '';
    if (unreviewedIssues.length > 0) {
      issuesHtml = '<div style="margin-top: 12px;">';
      issuesHtml += '<div style="font-weight: 600; color: #34495e; margin-bottom: 8px;">Open Issues:</div>';
      unreviewedIssues.forEach(issue => {
        const priorityClass = issue.priority.includes('high') ? 'priority-high' : 
                            issue.priority.includes('medium') ? 'priority-medium' : 'priority-low';
        issuesHtml += `
          <div class="issue-item ${priorityClass}">
            <div class="issue-title">${issue.mainIssue || 'No description'}</div>
            <div class="issue-meta">
              Priority: ${issue.priority || 'Not specified'} | 
              Date: ${issue.date || 'N/A'} |
              By: ${issue.writtenBy || 'Unknown'}
            </div>
            ${accessToken ? `
              <button onclick="markAsReviewed(${issue.rowIndex})" 
                style="margin-top: 8px; padding: 6px 12px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                ✓ Mark as Reviewed
              </button>
            ` : ''}
          </div>
        `;
      });
      issuesHtml += '</div>';
    } else {
      issuesHtml = '<div class="no-issues">✓ No open issues</div>';
    }

    card.innerHTML = `
      <div class="vehicle-name">${vehicleName}</div>
      <span class="status-badge status-${status}">${statusText}</span>
      ${unreviewedIssues.length > 0 ? `<div style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 8px;">${unreviewedIssues.length} open issue${unreviewedIssues.length !== 1 ? 's' : ''}</div>` : ''}
      ${issuesHtml}
      ${accessToken ? `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ecf0f1; display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="setVehicleStatus('${vehicleName}', 'ready')" style="flex: 1; min-width: 100px; padding: 8px 12px; background: #27ae60; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Mark Ready</button>
          <button onclick="setVehicleStatus('${vehicleName}', 'not-ready')" style="flex: 1; min-width: 100px; padding: 8px 12px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">Mark Not Ready</button>
        </div>
      ` : ''}
    `;
    
    grid.appendChild(card);
  });

  // Update summary stats
  document.getElementById('readyCount').textContent = readyCount;
  document.getElementById('warningCount').textContent = warningCount;
  document.getElementById('notReadyCount').textContent = notReadyCount;
  console.log('displayReadinessCards completed successfully');
  } catch (error) {
    console.error('Error in displayReadinessCards:', error);
  }
}

function displayIssuesTable(rows) {
  try {
    const tbody = document.getElementById('issuesTableBody');
    
    if (!tbody) {
      console.error('issuesTableBody element not found!');
      return;
    }
    
    tbody.innerHTML = '';
  
  if (rows.length <= 1) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding: 20px; text-align: center; color: #7f8c8d;">No issues reported yet.</td></tr>';
    updatePaginationControls(0);
    return;
  }
  
  // Store all data
  allIssuesData = rows.slice(1).reverse();
  
  // Calculate pagination
  const totalIssues = allIssuesData.length;
  const totalPages = Math.ceil(totalIssues / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalIssues);
  const pageData = allIssuesData.slice(startIndex, endIndex);
  
  // Render current page
  pageData.forEach((row, index) => {
    const actualIndex = startIndex + index;
    const vehicleMake = row[1] || '';
    const vehicleModel = row[2] || '';
    const vehicleName = `${vehicleMake} ${vehicleModel}`.trim();
    const division = row[3] || '';
    const date = row[4] || '';
    const mainIssue = row[5] || '';
    const writtenBy = row[6] || '';
    const priority = row[7] || '';
    const submittedBy = row[8] || '';
    const dateReviewed = row[11] || '';
    const notedIssues = row[12] || '';
    
    const tr = document.createElement('tr');
    tr.style.background = index % 2 === 0 ? '#f8f9fa' : '#fff';
    
    // Color code by priority
    let priorityColor = '#95a5a6';
    if (priority.toLowerCase().includes('high')) {
      priorityColor = '#e74c3c';
    } else if (priority.toLowerCase().includes('medium')) {
      priorityColor = '#f39c12';
    } else if (priority.toLowerCase().includes('low')) {
      priorityColor = '#3498db';
    }
    
    // Highlight unreviewed issues
    if (!dateReviewed) {
      tr.style.borderLeft = `4px solid ${priorityColor}`;
    }
    
    // Calculate row index for edit/delete (counting from end of original array)
    const rowIndexForAction = rows.length - actualIndex;
    
    tr.innerHTML = `
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${date}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${vehicleName}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${division}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${mainIssue}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; color: ${priorityColor}; font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${priority}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${writtenBy}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${submittedBy}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; ${dateReviewed ? '' : 'color: #e74c3c; font-weight: 600;'} font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${dateReviewed || 'Not Reviewed'}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis;">${notedIssues}</td>
      <td style="padding: 6px 8px; border: 1px solid #ecf0f1; white-space: nowrap;">
        ${accessToken ? `
          <button onclick="editIssue(${rowIndexForAction})" style="padding: 5px 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Edit</button>
        ` : `<button onclick="alert('Please sign in to edit issues.'); handleSignIn();" style="padding: 5px 10px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Sign In</button>`}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  updatePaginationControls(totalIssues);
  } catch (error) {
    console.error('Error displaying issues table:', error);
  }
}

function updatePaginationControls(totalIssues) {
  const totalPages = Math.ceil(totalIssues / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(currentPage * rowsPerPage, totalIssues);
  
  // Update info text
  const infoEl = document.getElementById('paginationInfo');
  if (infoEl) {
    if (totalIssues === 0) {
      infoEl.textContent = 'Showing 0 of 0 issues';
    } else {
      infoEl.textContent = `Showing ${startIndex}-${endIndex} of ${totalIssues} issues`;
    }
  }
  
  // Update buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
    prevBtn.style.opacity = currentPage <= 1 ? '0.5' : '1';
    prevBtn.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
  }
  
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.style.opacity = currentPage >= totalPages ? '0.5' : '1';
    nextBtn.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
  }
}

function nextPage() {
  const totalPages = Math.ceil(allIssuesData.length / rowsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    displayIssuesTable([['header'], ...allIssuesData.slice().reverse()]);
  }
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    displayIssuesTable([['header'], ...allIssuesData.slice().reverse()]);
  }
}

// Delete an issue row
async function deleteIssue(rowIndex) {
  if (!accessToken) {
    alert('Please sign in with Google to delete issues.');
    handleSignIn();
    return;
  }
  
  if (!confirm('Are you sure you want to delete this issue? This cannot be undone.')) {
    return;
  }
  
  try {
    // Delete the row by clearing all values
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!A${rowIndex}:M${rowIndex}`
    });
    
    alert('Issue deleted successfully!');
    loadReadinessData();
  } catch (error) {
    console.error('Error deleting issue:', error);
    alert('Failed to delete issue. Please try again.');
  }
}

// Edit an issue
let editingRowData = null;

async function editIssue(rowIndex) {
  if (!accessToken) {
    alert('Please sign in with Google to edit issues.');
    handleSignIn();
    return;
  }
  
  try {
    // Fetch the specific row data
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!A${rowIndex}:M${rowIndex}`
    });
    
    const rowData = response.result.values[0];
    if (!rowData) {
      alert('Could not load issue data.');
      return;
    }
    
    editingRowData = { rowIndex, data: rowData };
    
    // Populate edit modal
    const vehicleMake = rowData[1] || '';
    const vehicleModel = rowData[2] || '';
    const vehicleName = `${vehicleMake} ${vehicleModel}`.trim();
    
    document.getElementById('editRowIndex').value = rowIndex;
    document.getElementById('editVehicle').value = vehicleName;
    document.getElementById('editDivision').value = rowData[3] || '';
    document.getElementById('editDate').value = rowData[4] || '';
    document.getElementById('editMainIssue').value = rowData[5] || '';
    document.getElementById('editWrittenBy').value = rowData[6] || '';
    document.getElementById('editPriority').value = rowData[7] || 'Low';
    document.getElementById('editNotes').value = rowData[12] || '';
    
    // Populate vehicle dropdown
    const response2 = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: 'Form Responses!A:M'
    });
    
    const allRows = response2.result.values || [];
    const vehicles = new Set();
    allRows.slice(1).forEach(row => {
      const make = (row[1] || '').trim();
      const model = (row[2] || '').trim();
      const name = `${make} ${model}`.trim().replace(/\s+/g, ' ');
      if (name) vehicles.add(name);
    });
    
    const vehicleSelect = document.getElementById('editVehicle');
    vehicleSelect.innerHTML = '<option value="">Select Vehicle</option>';
    Array.from(vehicles).sort().forEach(v => {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = v;
      if (v === vehicleName) option.selected = true;
      vehicleSelect.appendChild(option);
    });
    
    // Show modal
    document.getElementById('editIssueModal').style.display = 'flex';
  } catch (error) {
    console.error('Error loading issue for edit:', error);
    alert('Failed to load issue data.');
  }
}

function closeEditIssueModal() {
  document.getElementById('editIssueModal').style.display = 'none';
  editingRowData = null;
}

async function deleteIssueFromModal() {
  if (!accessToken) {
    alert('Please sign in with Google to delete issues.');
    handleSignIn();
    return;
  }
  
  if (!confirm('Are you sure you want to delete this issue? This cannot be undone.')) {
    return;
  }
  
  const rowIndex = document.getElementById('editRowIndex').value;
  
  try {
    // Delete the row by clearing all values
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!A${rowIndex}:M${rowIndex}`
    });
    
    alert('Issue deleted successfully!');
    closeEditIssueModal();
    loadReadinessData(); // Reload data
  } catch (error) {
    console.error('Error deleting issue:', error);
    alert('Failed to delete issue. Please try again.');
  }
}

async function saveEditedIssue() {
  if (!accessToken) {
    alert('Please sign in with Google to save changes.');
    handleSignIn();
    return;
  }
  
  const rowIndex = document.getElementById('editRowIndex').value;
  const vehicleName = document.getElementById('editVehicle').value;
  const division = document.getElementById('editDivision').value;
  const date = document.getElementById('editDate').value;
  const mainIssue = document.getElementById('editMainIssue').value;
  const priority = document.getElementById('editPriority').value;
  const writtenBy = document.getElementById('editWrittenBy').value;
  const notes = document.getElementById('editNotes').value;
  
  if (!vehicleName || !mainIssue) {
    alert('Please fill in vehicle and main issue fields.');
    return;
  }
  
  // Parse vehicle name into Make and Model
  const parts = vehicleName.split(' ');
  const make = parts[0] || '';
  const model = parts.slice(1).join(' ') || '';
  
  try {
    // Keep original data for columns we're not editing
    const originalData = editingRowData.data;
    
    const values = [[
      originalData[0] || '', // Question
      make, // Vehicle Make
      model, // Vehicle Model
      division, // Division
      date, // Date
      mainIssue, // Main Issue
      writtenBy, // Written Up By
      priority, // Priority
      originalData[8] || '', // Submitted By (keep original)
      originalData[9] || '', // Timestamp (keep original)
      originalData[10] || '', // Manual Status (keep original)
      originalData[11] || '', // Date Reviewed (keep original)
      notes // Noted Issues
    ]];
    
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!A${rowIndex}:M${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: values }
    });
    
    alert('Issue updated successfully!');
    closeEditIssueModal();
    loadReadinessData();
  } catch (error) {
    console.error('Error updating issue:', error);
    alert('Failed to update issue. Please try again.');
  }
}

// Set vehicle status manually (updates column K for the vehicle's most recent entry)
async function setVehicleStatus(vehicleName, status) {
  if (!accessToken) {
    alert('Please sign in with Google to update vehicle status.');
    handleSignIn();
    return;
  }
  
  const statusText = status === 'ready' ? 'Ready' : 'Not Ready';
  if (!confirm(`Mark ${vehicleName} as ${statusText}?`)) {
    return;
  }
  
  try {
    // Get current data to find the row for this vehicle
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: READINESS_CONFIG.range
    });
    
    const rows = response.result.values || [];
    
    // Find the most recent row for this vehicle (search from bottom up)
    let targetRowIndex = -1;
    for (let i = rows.length - 1; i > 0; i--) {
      const row = rows[i];
      const vehicleMake = row[1] || '';
      const vehicleModel = row[2] || '';
      const rowVehicleName = `${vehicleMake} ${vehicleModel}`.trim();
      
      if (rowVehicleName === vehicleName) {
        targetRowIndex = i + 1; // +1 for 1-based indexing
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      alert(`No entries found for ${vehicleName}. Please report an issue first.`);
      return;
    }
    
    // Update column K (index 10, which is column K in A1 notation)
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!K${targetRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[statusText]]
      }
    });
    
    console.log('Vehicle status updated successfully');
    alert(`${vehicleName} marked as ${statusText}!`);
    
    // Reload the data
    loadReadinessData();
  } catch (error) {
    console.error('Error updating vehicle status:', error);
    alert('Failed to update vehicle status. Please try again.');
  }
}

function updateSummaryCounts(ready, warning, notReady) {
  document.getElementById('readyCount').textContent = ready;
  document.getElementById('warningCount').textContent = warning;
  document.getElementById('notReadyCount').textContent = notReady;
}

// Mark an issue as reviewed
async function markAsReviewed(rowIndex) {
  if (!accessToken) {
    alert('Please sign in with Google to mark issues as reviewed.');
    handleSignIn();
    return;
  }
  
  if (!confirm('Mark this issue as reviewed?')) return;
  
  try {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    // Update the "Date Reviewed" column (column L, index 11)
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: `Form Responses!L${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[today]]
      }
    });
    
    console.log('Issue marked as reviewed successfully');
    
    // Reload the data
    loadReadinessData();
  } catch (error) {
    console.error('Error marking issue as reviewed:', error);
    alert('Failed to update issue. Please try again.');
  }
}

// Modal functions
function showAddIssueModal() {
  if (!accessToken) {
    alert('Please sign in with Google to report issues.');
    handleSignIn();
    return;
  }
  document.getElementById('addIssueModal').style.display = 'flex';
}

function closeAddIssueModal() {
  document.getElementById('addIssueModal').style.display = 'none';
  // Reset form
  document.getElementById('issueVehicle').value = '';
  document.getElementById('issueType').value = '';
  document.getElementById('otherIssueText').value = '';
  document.getElementById('issuePriority').value = 'Low';
  document.getElementById('reporterName').value = '';
  document.getElementById('issueNotes').value = '';
  document.getElementById('otherIssueField').style.display = 'none';
}

function toggleOtherField() {
  const issueType = document.getElementById('issueType').value;
  const otherField = document.getElementById('otherIssueField');
  otherField.style.display = issueType === 'Other' ? 'block' : 'none';
}

// Populate vehicle dropdown with actual vehicles from the dashboard
function populateVehicleDropdown(vehicles) {
  const vehicleSelect = document.getElementById('issueVehicle');
  if (!vehicleSelect) return;
  
  vehicleSelect.innerHTML = '<option value="">Select Vehicle</option>';
  vehicles.forEach(vehicleName => {
    const option = document.createElement('option');
    option.value = vehicleName;
    option.textContent = vehicleName;
    vehicleSelect.appendChild(option);
  });
}

async function submitNewIssue() {
  if (!accessToken) {
    alert('Please sign in with Google to submit issues.');
    handleSignIn();
    return;
  }
  
  const vehicleName = document.getElementById('issueVehicle').value;
  const issueType = document.getElementById('issueType').value;
  const otherText = document.getElementById('otherIssueText').value;
  const priority = document.getElementById('issuePriority').value;
  const reporterName = document.getElementById('reporterName').value.trim();
  const notes = document.getElementById('issueNotes').value;
  
  if (!vehicleName || !issueType || !reporterName) {
    alert('Please fill in all required fields (Vehicle, Issue Type, and Your Name).');
    return;
  }
  
  // Parse vehicle name into Make and Model (e.g., "Chevrolet Camaro" -> Make: "Chevrolet", Model: "Camaro")
  const parts = vehicleName.split(' ');
  const make = parts[0] || '';
  const model = parts.slice(1).join(' ') || '';
  
  if (issueType === 'Other' && !otherText) {
    alert('Please describe the issue.');
    return;
  }
  
  const mainIssue = issueType === 'Other' ? otherText : issueType;
  const today = new Date().toLocaleDateString('en-US');
  
  try {
    // Append to Google Sheet - Form Responses format:
    // Example question, Vehicle Make, Vehicle Model, Division, Date, Main Issue, 
    // Written Up By, Priority of Issue, Submitted By, Timestamp, [blank], Date Reviewed, Noted Issues
    
    const values = [[
      '', // Example question (empty)
      make, // Vehicle Make
      model, // Vehicle Model
      '', // Division (empty for now)
      today, // Date
      mainIssue, // Main Issue
      reporterName, // Written Up By
      priority, // Priority of Issue
      reporterName, // Submitted By
      new Date().toISOString(), // Timestamp
      '', // blank column
      '', // Date Reviewed (empty - new issue)
      notes // Noted Issues
    ]];
    
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: 'Form Responses!A:M',
      valueInputOption: 'USER_ENTERED',
      resource: { values: values }
    });
    
    alert('Issue reported successfully!');
    closeAddIssueModal();
    loadReadinessData(); // Reload to show new issue
  } catch (error) {
    console.error('Error submitting issue:', error);
    alert('Failed to submit issue. Please try again.');
  }
}

// Initialize when scripts load
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;

// Poll for script availability
const checkScriptsLoaded = setInterval(() => {
  if (typeof gapi !== 'undefined' && !gapiInited) {
    clearInterval(checkScriptsLoaded);
    gapiLoaded();
  }
  if (typeof google !== 'undefined' && google.accounts && !gisInited) {
    gisLoaded();
  }
  if (gapiInited && gisInited) {
    clearInterval(checkScriptsLoaded);
  }
}, 100);
