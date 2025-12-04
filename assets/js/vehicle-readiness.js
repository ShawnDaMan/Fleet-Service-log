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

// Initialize Google API
function gapiLoaded() {
  console.log('gapiLoaded called');
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  console.log('initializeGapiClient called');
  console.log('document.readyState:', document.readyState);
  await gapi.client.init({
    apiKey: READINESS_CONFIG.apiKey,
    discoveryDocs: READINESS_CONFIG.discoveryDocs,
  });
  gapiInited = true;
  console.log('GAPI initialized successfully');
  
  // Check for stored token
  const storedToken = localStorage.getItem('google_access_token');
  const tokenExpiry = localStorage.getItem('google_token_expiry');
  
  if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
    // Token is still valid, restore session
    accessToken = storedToken;
    gapi.client.setToken({access_token: accessToken});
    console.log('Restored stored access token');
  }
  
  // Check if elements exist, if not wait a bit
  const checkAndLoad = () => {
    const grid = document.getElementById('readinessGrid');
    const tbody = document.getElementById('issuesTableBody');
    console.log('Checking for elements - grid:', grid, 'tbody:', tbody);
    
    if (grid && tbody) {
      console.log('Elements found, loading data');
      updateSigninStatus(true);
      loadReadinessData();
    } else {
      console.log('Elements not found yet, waiting...');
      setTimeout(checkAndLoad, 100);
    }
  };
  
  checkAndLoad();
}

function gisLoaded() {
  console.log('gisLoaded called');
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: READINESS_CONFIG.clientId,
    scope: READINESS_CONFIG.scope,
    callback: (response) => {
      accessToken = response.access_token;
      // Store token with expiry time (8 hours)
      const expiryTime = Date.now() + (8 * 3600 * 1000);
      localStorage.setItem('google_access_token', accessToken);
      localStorage.setItem('google_token_expiry', expiryTime);
      gapi.client.setToken({access_token: accessToken});
      console.log('User authenticated successfully');
      loadReadinessData(); // Reload to show "Mark as Reviewed" buttons
    },
  });
  gisInited = true;
  console.log('GIS initialized successfully');
}

function handleSignIn() {
  console.log('handleSignIn called, tokenClient:', tokenClient);
  if (!tokenClient) {
    // Wait for GIS to load
    const checkInterval = setInterval(() => {
      if (tokenClient) {
        clearInterval(checkInterval);
        tokenClient.requestAccessToken({prompt: 'consent'});
      }
    }, 100);
    // Timeout after 5 seconds
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

// Load readiness data from Google Sheets
let isLoading = false;
async function loadReadinessData() {
  if (isLoading) {
    console.log('Already loading, skipping...');
    return;
  }
  
  isLoading = true;
  try {
    console.log('Loading readiness data...');
    console.log('gapiInited:', gapiInited);
    console.log('gapi.client:', typeof gapi !== 'undefined' ? gapi.client : 'undefined');
    
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: READINESS_CONFIG.range
    });

    console.log('Response received:', response);
    const rows = response.result.values || [];
    console.log('Rows found:', rows.length);
    console.log('First few rows:', rows.slice(0, 3));
    
    if (rows.length === 0) {
      document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #7f8c8d;">No data found.</p>';
      return;
    }
    
    if (rows.length === 1) {
      document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #7f8c8d;">No issues reported yet. All vehicles are ready!</p>';
      updateSummaryCounts(8, 0, 0); // All 8 vehicles ready
      return;
    }

    console.log('About to process rows and display...');
    // Skip header row and process data
    // Columns: Example question, Vehicle Make, Vehicle Model, Division, Date, Main Issue, 
    // Written Up By, Priority of Issue, Submitted By, Timestamp, [blank], Date Reviewed, Noted Issues
    const issuesByVehicle = {};
    
    rows.slice(1).forEach((row, index) => {
      const vehicleMake = row[1] || '';
      const vehicleModel = row[2] || '';
      const vehicleName = `${vehicleMake} ${vehicleModel}`.trim();
      
      if (!vehicleName) return; // Skip empty rows
      
      const issue = {
        rowIndex: index + 2, // +2 because: +1 for header, +1 for 1-based indexing
        question: row[0] || '',
        division: row[3] || '',
        date: row[4] || '',
        mainIssue: row[5] || '',
        writtenBy: row[6] || '',
        priority: (row[7] || '').toLowerCase(),
        submittedBy: row[8] || '',
        timestamp: row[9] || '',
        dateReviewed: row[11] || '',
        notedIssues: row[12] || ''
      };
      
      if (!issuesByVehicle[vehicleName]) {
        issuesByVehicle[vehicleName] = [];
      }
      
      issuesByVehicle[vehicleName].push(issue);
    });

    console.log('Issues by vehicle:', issuesByVehicle);
    console.log('Calling displayReadinessCards...');
    displayReadinessCards(issuesByVehicle);
    console.log('Calling displayIssuesTable...');
    displayIssuesTable(rows);
    console.log('Display functions completed');
  } catch (error) {
    console.error('Error loading readiness data:', error);
    console.error('Error stack:', error.stack);
    document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #e74c3c;">Error loading data. Please try again.</p>';
  } finally {
    isLoading = false;
  }
}

function displayReadinessCards(issuesByVehicle) {
  try {
    console.log('displayReadinessCards called with:', issuesByVehicle);
    const grid = document.getElementById('readinessGrid');
    console.log('Grid element:', grid);
    
    if (!grid) {
      console.error('readinessGrid element not found!');
      return;
    }
    
    grid.innerHTML = '';
  
  let readyCount = 0;
  let warningCount = 0;
  let notReadyCount = 0;

  // Get all unique vehicle names from both sheets
  const allVehicles = [
    '2023 Chevrolet Z06',
    '2023 Chevrolet Z51',
    '2023 Ford GT 500',
    '1972 Chevrolet el Camino',
    '1969 Chevrolet Camaro',
    '1968 Plymouth roadrunner',
    '2015 Dodge Challenger',
    '2017 Dodge Charger'
  ];

  allVehicles.forEach(vehicleName => {
    const issues = issuesByVehicle[vehicleName] || [];
    const unreviewedIssues = issues.filter(issue => !issue.dateReviewed);
    const highPriorityIssues = unreviewedIssues.filter(issue => issue.priority.includes('high'));
    
    let status = 'ready';
    let statusText = 'Ready';
    let cardClass = 'vehicle-card';
    
    if (highPriorityIssues.length > 0) {
      status = 'not-ready';
      statusText = 'Not Ready';
      cardClass = 'vehicle-card not-ready';
      notReadyCount++;
    } else if (unreviewedIssues.length > 0) {
      status = 'warning';
      statusText = 'Needs Attention';
      cardClass = 'vehicle-card warning';
      warningCount++;
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
    console.log('displayIssuesTable called with rows:', rows.length);
    const tbody = document.getElementById('issuesTableBody');
    console.log('Table body element:', tbody);
    
    if (!tbody) {
      console.error('issuesTableBody element not found!');
      return;
    }
    
    tbody.innerHTML = '';
  
  if (rows.length <= 1) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding: 20px; text-align: center; color: #7f8c8d;">No issues reported yet.</td></tr>';
    return;
  }
  
  // Skip header row and reverse to show newest first
  const dataRows = rows.slice(1).reverse();
  
  console.log('accessToken for buttons:', accessToken);
  console.log('Will show action buttons:', !!accessToken);
  
  dataRows.forEach((row, index) => {
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
    
    tr.innerHTML = `
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${date}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1; font-weight: 600;">${vehicleName}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${division}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${mainIssue}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1; color: ${priorityColor}; font-weight: 600;">${priority}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${writtenBy}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${submittedBy}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1; ${dateReviewed ? '' : 'color: #e74c3c; font-weight: 600;'}">${dateReviewed || 'Not Reviewed'}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1;">${notedIssues}</td>
      <td style="padding: 10px; border: 1px solid #ecf0f1; white-space: nowrap;">
        ${accessToken ? `
          <button onclick="deleteIssue(${rows.length - index})" style="padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-right: 5px;">Delete</button>
        ` : `<button onclick="alert('Please sign in to delete issues.'); handleSignIn();" style="padding: 5px 10px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Sign In</button>`}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  console.log('displayIssuesTable completed successfully');
  } catch (error) {
    console.error('Error in displayIssuesTable:', error);
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
    
    console.log('Issue deleted successfully');
    alert('Issue deleted successfully!');
    
    // Reload the data
    loadReadinessData();
  } catch (error) {
    console.error('Error deleting issue:', error);
    alert('Failed to delete issue. Please try again.');
  }
}

// Set vehicle status manually (creates a status override entry)
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
    const timestamp = new Date().toLocaleString();
    const priority = status === 'ready' ? 'Low' : 'High';
    const mainIssue = status === 'ready' ? 'Vehicle Status: Ready for service' : 'Vehicle Status: Not ready for service';
    
    // Parse vehicle name
    const parts = vehicleName.split(' ');
    const make = parts.slice(0, -1).join(' ') || vehicleName;
    const model = parts[parts.length - 1] || '';
    
    // Append new row with status update
    const values = [
      ['Status Override', make, model, 'Fleet', new Date().toLocaleDateString(), mainIssue, 'System', priority, 'Manual Override', timestamp, '', '', `Manual status set to: ${statusText}`]
    ];
    
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: READINESS_CONFIG.spreadsheetId,
      range: 'Form Responses!A:M',
      valueInputOption: 'USER_ENTERED',
      resource: { values }
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
  document.getElementById('issueVehicleMake').value = '';
  document.getElementById('issueVehicleModel').value = '';
  document.getElementById('issueType').value = '';
  document.getElementById('otherIssueText').value = '';
  document.getElementById('issuePriority').value = 'Low';
  document.getElementById('issueNotes').value = '';
  document.getElementById('otherIssueField').style.display = 'none';
}

function toggleOtherField() {
  const issueType = document.getElementById('issueType').value;
  const otherField = document.getElementById('otherIssueField');
  otherField.style.display = issueType === 'Other' ? 'block' : 'none';
}

// Vehicle model mapping
const vehicleModels = {
  '2023 Chevrolet': ['Z06', 'Z51'],
  '2023 Ford': ['GT 500'],
  '1972 Chevrolet': ['el Camino'],
  '1969 Chevrolet': ['Camaro'],
  '1968 Plymouth': ['roadrunner'],
  '2015 Dodge': ['Challenger'],
  '2017 Dodge': ['Charger']
};

document.getElementById('issueVehicleMake').addEventListener('change', function() {
  const make = this.value;
  const modelSelect = document.getElementById('issueVehicleModel');
  modelSelect.innerHTML = '<option value="">Select Vehicle Model</option>';
  
  if (make && vehicleModels[make]) {
    vehicleModels[make].forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
  }
});

async function submitNewIssue() {
  if (!accessToken) {
    alert('Please sign in with Google to submit issues.');
    handleSignIn();
    return;
  }
  
  const make = document.getElementById('issueVehicleMake').value;
  const model = document.getElementById('issueVehicleModel').value;
  const issueType = document.getElementById('issueType').value;
  const otherText = document.getElementById('otherIssueText').value;
  const priority = document.getElementById('issuePriority').value;
  const notes = document.getElementById('issueNotes').value;
  
  if (!make || !model || !issueType) {
    alert('Please fill in all required fields.');
    return;
  }
  
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
      'Web Dashboard', // Written Up By
      priority, // Priority of Issue
      'Dashboard User', // Submitted By
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
    console.log('GAPI detected, calling gapiLoaded()');
    clearInterval(checkScriptsLoaded);
    gapiLoaded();
  }
  if (typeof google !== 'undefined' && google.accounts && !gisInited) {
    console.log('GIS detected, calling gisLoaded()');
    gisLoaded();
  }
  // Stop checking after both are loaded
  if (gapiInited && gisInited) {
    clearInterval(checkScriptsLoaded);
  }
}, 100);
