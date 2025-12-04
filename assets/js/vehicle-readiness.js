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
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: READINESS_CONFIG.apiKey,
    discoveryDocs: READINESS_CONFIG.discoveryDocs,
  });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
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
      updateSigninStatus(true);
      loadReadinessData();
    },
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    // Load data immediately without requiring authentication
    updateSigninStatus(true);
    loadReadinessData();
  }
}

function handleSignIn() {
  tokenClient.requestAccessToken({prompt: 'consent'});
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
async function loadReadinessData() {
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

    displayReadinessCards(issuesByVehicle);
  } catch (error) {
    console.error('Error loading readiness data:', error);
    document.getElementById('readinessGrid').innerHTML = '<p style="text-align: center; color: #e74c3c;">Error loading data. Please try again.</p>';
  }
}

function displayReadinessCards(issuesByVehicle) {
  const grid = document.getElementById('readinessGrid');
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
            ${isSignedIn ? `
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
    `;
    
    grid.appendChild(card);
  });

  // Update summary stats
  document.getElementById('readyCount').textContent = readyCount;
  document.getElementById('warningCount').textContent = warningCount;
  document.getElementById('notReadyCount').textContent = notReadyCount;
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
if (typeof gapi !== 'undefined') {
  gapiLoaded();
}
if (typeof google !== 'undefined') {
  gisLoaded();
}
