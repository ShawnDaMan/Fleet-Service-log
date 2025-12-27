// Fleet Service Log V2 - Local-only, efficient app core
// All data is stored in localStorage
// No Google Sheets or cloud dependencies

(function() {
  const STORAGE_KEY = 'fleetServiceLogV2';
  let data = [];

  // Utility: Save to localStorage
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // Utility: Load from localStorage
  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    data = raw ? JSON.parse(raw) : [];
  }

  // Render table efficiently
  function renderTable() {
    const tbody = document.querySelector('#serviceTable tbody');
    tbody.innerHTML = '';
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${row.vehicleId}</td>
        <td>${row.serviceType}</td>
        <td>${row.serviceDate}</td>
        <td>${row.serviceCost}</td>
        <td>${row.serviceCause}</td>
        <td>${row.serviceNotes}</td>
        <td><button class="delete-btn" data-index="${i}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Event delegation for delete
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-btn')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        data.splice(idx, 1);
        saveData();
        renderTable();
      }
    }
  });

  // Initial load
  loadData();
  renderTable();

  // TODO: Add form handling, summary cards, and further optimizations
})();
