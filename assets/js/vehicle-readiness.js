// Google Sheets Configuration for Vehicle Readiness
const READINESS_CONFIG = {
  apiKey: 'AIzaSyCbwWuijHsYZbe7xObLhZdZrN5y215w1mk',
  clientId: '798228996956-klknfdqcehur1i4utmdvuug4pnesf1rh.apps.googleusercontent.com',
  spreadsheetId: '1NQjYtL1Q-fZbqwcCv3CNkG8t9wqHhET3LmIK-9yTFyk',
  range: 'Form Responses!A:M',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly'
};

let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;
let isSignedIn = false;

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
    document.getElementById('authNotification').style.display = 'block';
  }
}

function handleSignIn() {
  tokenClient.requestAccessToken({prompt: 'consent'});
}

function updateSigninStatus(signedIn) {
  isSignedIn = signedIn;
  if (signedIn) {
    document.getElementById('authNotification').style.display = 'none';
    document.getElementById('summaryStats').style.display = 'flex';
  } else {
    document.getElementById('authNotification').style.display = 'block';
    document.getElementById('summaryStats').style.display = 'none';
  }
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
    
    rows.slice(1).forEach((row) => {
      const vehicleMake = row[1] || '';
      const vehicleModel = row[2] || '';
      const vehicleName = `${vehicleMake} ${vehicleModel}`.trim();
      
      if (!vehicleName) return; // Skip empty rows
      
      const issue = {
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

// Initialize when scripts load
if (typeof gapi !== 'undefined') {
  gapiLoaded();
}
if (typeof google !== 'undefined') {
  gisLoaded();
}
