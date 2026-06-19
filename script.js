// Storage keys
const STORAGE_KEYS = {
    mod: { schedule: 'mod_schedule_data', escalation: 'mod_escalation_data' },
    oncall: { schedule: 'oncall_schedule_data', escalation: 'oncall_escalation_data', contacts: 'oncall_contacts_data' },
    l2: { schedule: 'l2_schedule_data' }
};

// Contact details data
let contactsData = null;
let contactEditMode = false;

// Data stores for each screen
const appData = {
    mod: { primaryMods: [], secondaryMods: [], savedSchedule: null },
    oncall: { primaryMods: [], secondaryMods: [], savedSchedule: null },
    l2: { mods: [], savedSchedule: null }
};

// Color maps
const colorMaps = { mod: new Map(), oncall: new Map(), l2: new Map() };
let colorIndices = { mod: 1, oncall: 1, l2: 1 };

// Current screen
let currentScreen = 'mod';

// Drag state
let draggedItem = null;
let draggedList = null;
let draggedScreen = null;

// Check if using database
const useDatabase = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Show loading indicator if using database
    if (useDatabase) {
        console.log('Using Supabase database');
        showToast('Connecting to database...', 'info');
    } else {
        console.log('Using localStorage (Supabase not configured)');
    }
    
    loadAllData();
    initializeFileUploads();
    initializeDatePickers();
    await initializeModPersonnelData();
    await initializeContactsData();
    await initializeEscalationMatrixData();
    await initializeRosterData();
    await initializeStaffDirectory();
    
    if (useDatabase) {
        showToast('Connected to database', 'success');
    }
});

// Switch main screen
function switchMainScreen(screen) {
    currentScreen = screen;
    
    document.querySelectorAll('.main-screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-screen-tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(`${screen}Screen`).classList.add('active');
    event.target.closest('.main-screen-tab').classList.add('active');
}

// Toggle team section (hide/show)
function toggleTeamSection(headerEl) {
    const tableContainer = headerEl.nextElementSibling;
    const toggleBtn = headerEl.querySelector('.toggle-btn');
    
    if (tableContainer.classList.contains('hidden')) {
        tableContainer.classList.remove('hidden');
        headerEl.classList.remove('collapsed');
        toggleBtn.title = 'Hide';
    } else {
        tableContainer.classList.add('hidden');
        headerEl.classList.add('collapsed');
        toggleBtn.title = 'Show';
    }
}

// Show tab within a screen
function showTab(screen, tabName) {
    const screenEl = document.getElementById(`${screen}Screen`);
    
    screenEl.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    screenEl.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${screen}-${tabName}Tab`).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'details' || tabName === 'contacts') {
        displayDetails(screen);
    }
}

// ==================== MOD DETAILS CRUD ====================
let modDetailsEditMode = false;
let modPersonnelData = {
    onsite: [],
    offshore: []
};

// Initialize MOD Personnel Data
async function initializeModPersonnelData() {
    if (useDatabase) {
        try {
            const dbData = await db.getModPersonnel();
            console.log('MOD Personnel from DB:', dbData);
            if (dbData && (dbData.onsite.length > 0 || dbData.offshore.length > 0)) {
                modPersonnelData = dbData;
            } else {
                console.log('No MOD personnel in database, using empty state');
                modPersonnelData = { onsite: [], offshore: [] };
            }
        } catch (err) {
            console.error('Error loading MOD personnel from database:', err);
            modPersonnelData = { onsite: [], offshore: [] };
        }
    } else {
        const saved = localStorage.getItem('mod_personnel_data');
        if (saved) {
            modPersonnelData = JSON.parse(saved);
        } else {
            // Default data
            modPersonnelData = {
                onsite: [
                    { name: 'Vikramjeet Saini', email: 'VSAINI@amdocs.com', phone: '+61 434516369' },
                    { name: 'Sachin Banjara', email: 'SBanjara@amdocs.com', phone: '+61 478 016 068' }
                ],
                offshore: [
                    { name: 'Ashwani Aggarwal', email: 'Ashwani.Aggarwal@ama.optusvendor.com.au', phone: '+61 478 015 240' },
                    { name: 'Mak John Tadulan', email: 'MakJohn.Tadulan@ama.optusvendor.com.au', phone: '+63 917 847 2898' }
                ]
            };
            saveModPersonnelData();
        }
    }
    renderModPersonnelTables();
}

function saveModPersonnelData() {
    if (!useDatabase) {
        localStorage.setItem('mod_personnel_data', JSON.stringify(modPersonnelData));
    }
}

function renderModPersonnelTables() {
    renderModPersonnelTable('onsite');
    renderModPersonnelTable('offshore');
}

function renderModPersonnelTable(type) {
    const tbody = document.getElementById(`mod${type.charAt(0).toUpperCase() + type.slice(1)}DetailsBody`);
    if (!tbody) return;
    
    const data = modPersonnelData[type] || [];
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:2rem;">No ${type} MOD personnel added yet.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map((person, index) => `
        <tr>
            <td>${escapeHtml(person.name)}</td>
            <td>${person.email ? `<a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>` : '-'}</td>
            <td>${person.phone || '-'}</td>
            <td class="actions-col">
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editModPersonnel('${type}', ${index})" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteModPersonnel('${type}', ${index})" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function toggleModDetailsEditMode() {
    modDetailsEditMode = !modDetailsEditMode;
    
    const editModeText = document.getElementById('modDetailsEditModeText');
    const addBtn = document.getElementById('addModPersonnelBtn');
    const tables = document.querySelectorAll('#mod-detailsTab .details-table');
    
    if (modDetailsEditMode) {
        editModeText.textContent = 'Exit Edit Mode';
        addBtn.classList.remove('hidden');
        tables.forEach(t => t.classList.add('edit-mode'));
    } else {
        editModeText.textContent = 'Edit Mode';
        addBtn.classList.add('hidden');
        tables.forEach(t => t.classList.remove('edit-mode'));
    }
}

function openModPersonnelModal(type = '', index = -1) {
    const modal = document.getElementById('modPersonnelModal');
    const title = document.getElementById('modPersonnelModalTitle');
    const form = document.getElementById('modPersonnelForm');
    
    form.reset();
    document.getElementById('modPersonnelEditIndex').value = index;
    document.getElementById('modPersonnelEditType').value = type;
    
    if (index >= 0 && type && modPersonnelData[type] && modPersonnelData[type][index]) {
        const person = modPersonnelData[type][index];
        title.textContent = 'Edit MOD Personnel';
        document.getElementById('modPersonnelType').value = type;
        document.getElementById('modPersonnelType').disabled = true;
        document.getElementById('modPersonnelName').value = person.name || '';
        document.getElementById('modPersonnelEmail').value = person.email || '';
        document.getElementById('modPersonnelPhone').value = person.phone || '';
    } else {
        title.textContent = 'Add MOD Personnel';
        document.getElementById('modPersonnelType').disabled = false;
    }
    
    modal.classList.remove('hidden');
}

function closeModPersonnelModal() {
    document.getElementById('modPersonnelModal').classList.add('hidden');
    document.getElementById('modPersonnelType').disabled = false;
}

async function saveModPersonnel(event) {
    event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('modPersonnelEditIndex').value);
    const editType = document.getElementById('modPersonnelEditType').value;
    const type = document.getElementById('modPersonnelType').value;
    
    const person = {
        name: document.getElementById('modPersonnelName').value.trim(),
        email: document.getElementById('modPersonnelEmail').value.trim(),
        phone: document.getElementById('modPersonnelPhone').value.trim()
    };
    
    if (useDatabase) {
        try {
            if (editIndex >= 0 && editType && modPersonnelData[editType] && modPersonnelData[editType][editIndex]) {
                const id = modPersonnelData[editType][editIndex]._id;
                await db.updateModPersonnel(id, person);
                showToast('MOD personnel updated');
            } else {
                const result = await db.saveModPersonnel(type, person, modPersonnelData[type]?.length || 0);
                console.log('Save result:', result);
                showToast('MOD personnel added');
            }
            // Reload data from database
            const freshData = await db.getModPersonnel();
            console.log('Fresh data from DB:', freshData);
            if (freshData && (freshData.onsite.length > 0 || freshData.offshore.length > 0)) {
                modPersonnelData = freshData;
            } else {
                // Fallback: add locally if DB fetch returns empty
                if (!modPersonnelData[type]) modPersonnelData[type] = [];
                if (editIndex >= 0 && editType) {
                    modPersonnelData[editType][editIndex] = person;
                } else {
                    modPersonnelData[type].push(person);
                }
            }
        } catch (err) {
            console.error('Error saving to database:', err);
            // Fallback to local storage
            if (!modPersonnelData[type]) modPersonnelData[type] = [];
            if (editIndex >= 0 && editType) {
                modPersonnelData[editType][editIndex] = person;
            } else {
                modPersonnelData[type].push(person);
            }
            showToast('Saved locally (database error)');
        }
    } else {
        if (editIndex >= 0 && editType) {
            modPersonnelData[editType][editIndex] = person;
            showToast('MOD personnel updated');
        } else {
            if (!modPersonnelData[type]) {
                modPersonnelData[type] = [];
            }
            modPersonnelData[type].push(person);
            showToast('MOD personnel added');
        }
        saveModPersonnelData();
    }
    
    renderModPersonnelTables();
    closeModPersonnelModal();
}

function editModPersonnel(type, index) {
    openModPersonnelModal(type, index);
}

async function deleteModPersonnel(type, index) {
    if (!confirm('Are you sure you want to delete this MOD personnel?')) return;
    
    if (useDatabase) {
        const id = modPersonnelData[type][index]._id;
        await db.deleteModPersonnel(id);
        modPersonnelData = await db.getModPersonnel();
    } else {
        modPersonnelData[type].splice(index, 1);
        saveModPersonnelData();
    }
    
    renderModPersonnelTables();
    showToast('MOD personnel deleted');
}

// ==================== MOD SCHEDULE CRUD ====================
let modScheduleEditMode = false;

function toggleModScheduleEditMode() {
    modScheduleEditMode = !modScheduleEditMode;
    
    const editModeText = document.getElementById('modScheduleEditModeText');
    const addBtn = document.getElementById('addModScheduleEntryBtn');
    const table = document.querySelector('#modScheduleContent .mod-schedule-table');
    
    if (modScheduleEditMode) {
        editModeText.textContent = 'Exit Edit Mode';
        addBtn.classList.remove('hidden');
        if (table) table.classList.add('edit-mode');
        // Re-render with edit buttons
        displaySavedSchedule('mod');
    } else {
        editModeText.textContent = 'Edit Mode';
        addBtn.classList.add('hidden');
        if (table) table.classList.remove('edit-mode');
        displaySavedSchedule('mod');
    }
}

function openModScheduleModal(index = -1) {
    const modal = document.getElementById('modScheduleModal');
    const title = document.getElementById('modScheduleModalTitle');
    const form = document.getElementById('modScheduleForm');
    
    form.reset();
    document.getElementById('modScheduleEditIndex').value = index;
    
    // Populate dropdowns with MOD personnel
    populateModScheduleDropdowns();
    
    const data = appData.mod.savedSchedule;
    
    if (index >= 0 && data && data.entries && data.entries[index]) {
        const entry = data.entries[index];
        title.textContent = 'Edit Schedule Entry';
        document.getElementById('modScheduleDate').value = entry.date;
        document.getElementById('modScheduleOnsite').value = entry.primaryName || '';
        document.getElementById('modScheduleOffshore').value = entry.secondaryName || '';
    } else {
        title.textContent = 'Add Schedule Entry';
        // Set default date to today
        document.getElementById('modScheduleDate').value = formatDateForInput(new Date());
    }
    
    modal.classList.remove('hidden');
}

function closeModScheduleModal() {
    document.getElementById('modScheduleModal').classList.add('hidden');
}

function populateModScheduleDropdowns() {
    const onsiteSelect = document.getElementById('modScheduleOnsite');
    const offshoreSelect = document.getElementById('modScheduleOffshore');
    
    // Clear existing options
    onsiteSelect.innerHTML = '<option value="">Select Onsite MOD</option>';
    offshoreSelect.innerHTML = '<option value="">Select Offshore MOD</option>';
    
    // Add onsite MOD options
    if (modPersonnelData.onsite) {
        modPersonnelData.onsite.forEach(person => {
            onsiteSelect.innerHTML += `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`;
        });
    }
    
    // Add offshore MOD options
    if (modPersonnelData.offshore) {
        modPersonnelData.offshore.forEach(person => {
            offshoreSelect.innerHTML += `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`;
        });
    }
}

function saveModScheduleEntry(event) {
    event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('modScheduleEditIndex').value);
    const date = document.getElementById('modScheduleDate').value;
    const onsiteName = document.getElementById('modScheduleOnsite').value;
    const offshoreName = document.getElementById('modScheduleOffshore').value;
    
    // Initialize schedule data if not exists
    if (!appData.mod.savedSchedule) {
        appData.mod.savedSchedule = {
            entries: [],
            primaryShiftLabel: '7am to 7pm AEST',
            secondaryShiftLabel: '7pm to 7am AEST',
            primaryMods: modPersonnelData.onsite || [],
            secondaryMods: modPersonnelData.offshore || []
        };
    }
    
    const entry = {
        date: date,
        primaryName: onsiteName,
        primaryDisplay: onsiteName,
        secondaryName: offshoreName,
        secondaryDisplay: offshoreName
    };
    
    if (editIndex >= 0) {
        // Edit existing entry
        appData.mod.savedSchedule.entries[editIndex] = entry;
        showToast('Schedule entry updated');
    } else {
        // Add new entry
        appData.mod.savedSchedule.entries.push(entry);
        // Sort by date
        appData.mod.savedSchedule.entries.sort((a, b) => new Date(a.date) - new Date(b.date));
        showToast('Schedule entry added');
    }
    
    // Save to storage
    saveScheduleToStorage('mod', appData.mod.savedSchedule);
    displaySavedSchedule('mod');
    closeModScheduleModal();
}

function editModScheduleEntry(index) {
    openModScheduleModal(index);
}

function deleteModScheduleEntry(index) {
    if (!confirm('Are you sure you want to delete this schedule entry?')) return;
    
    if (appData.mod.savedSchedule && appData.mod.savedSchedule.entries) {
        appData.mod.savedSchedule.entries.splice(index, 1);
        saveScheduleToStorage('mod', appData.mod.savedSchedule);
        displaySavedSchedule('mod');
        showToast('Schedule entry deleted');
    }
}

// Load all saved data
function loadAllData() {
    ['mod', 'oncall'].forEach(screen => {
        loadSavedSchedule(screen);
        loadEscalationContacts(screen);
    });
}

// Load saved schedule
function loadSavedSchedule(screen) {
    try {
        const savedData = localStorage.getItem(STORAGE_KEYS[screen].schedule);
        if (savedData) {
            appData[screen].savedSchedule = JSON.parse(savedData);
            displaySavedSchedule(screen);
        }
    } catch (e) {
        console.error(`Error loading ${screen} schedule:`, e);
    }
}

// Save schedule to storage
function saveScheduleToStorage(screen, scheduleData) {
    try {
        localStorage.setItem(STORAGE_KEYS[screen].schedule, JSON.stringify(scheduleData));
        appData[screen].savedSchedule = scheduleData;
    } catch (e) {
        console.error(`Error saving ${screen} schedule:`, e);
    }
}

// Display saved schedule
function displaySavedSchedule(screen) {
    const data = appData[screen].savedSchedule;
    const prefix = screen;
    
    if (!data || !data.entries || data.entries.length === 0) {
        document.getElementById(`${prefix}NoScheduleMessage`).style.display = 'block';
        document.getElementById(`${prefix}ScheduleTableContainer`).classList.add('hidden');
        document.getElementById(`${prefix}ScheduleInfo`).textContent = '';
        return;
    }
    
    colorMaps[screen].clear();
    colorIndices[screen] = 1;
    
    const startDate = new Date(data.entries[0].date);
    const endDate = new Date(data.entries[data.entries.length - 1].date);
    const dateRange = `${formatDateShort(startDate)} to ${formatDateShort(endDate)}`;
    const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Unknown';
    
    document.getElementById(`${prefix}ScheduleInfo`).innerHTML = `<strong>${dateRange}</strong> | Last updated: ${lastUpdated}`;
    
    const scheduleHTML = generateScheduleHTMLFromSaved(screen, data);
    document.getElementById(`${prefix}ScheduleContent`).innerHTML = scheduleHTML;
    
    document.getElementById(`${prefix}NoScheduleMessage`).style.display = 'none';
    document.getElementById(`${prefix}ScheduleTableContainer`).classList.remove('hidden');
}

// Generate schedule HTML from saved data
function generateScheduleHTMLFromSaved(screen, data) {
    const primaryLabel = data.primaryShiftLabel || (screen === 'mod' ? '7Am to 7pm AEST' : 'Primary On-Call');
    const secondaryLabel = data.secondaryShiftLabel || (screen === 'mod' ? '7pm to 7am AEST' : 'Secondary On-Call');
    const primaryHeader = screen === 'mod' ? 'Onsite MOD' : 'Primary On-Call';
    const secondaryHeader = screen === 'mod' ? 'Offshore MOD' : 'Secondary On-Call';
    
    // Check if MOD schedule edit mode is active
    const showActions = screen === 'mod' && modScheduleEditMode;
    
    let html = `
        <table class="mod-schedule-table ${showActions ? 'edit-mode' : ''}">
            <thead>
                <tr>
                    <th class="days-header">Days</th>
                    <th class="onsite-header">${primaryHeader}<br>(${escapeHtml(primaryLabel)})</th>
                    <th class="offshore-header">${secondaryHeader}<br>(${escapeHtml(secondaryLabel)})</th>
                    ${showActions ? '<th class="actions-header">Actions</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;
    
    // Helper to get week number of the year
    function getWeekNumber(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    
    data.entries.forEach((entry, index) => {
        const entryDate = new Date(entry.date);
        const weekNum = getWeekNumber(entryDate);
        const weekClass = `week-bg-${(weekNum % 4) + 1}`;
        
        const primaryColorClass = entry.primaryName ? getColorClass(screen, entry.primaryName) : '';
        const secondaryColorClass = entry.secondaryName ? getColorClass(screen, entry.secondaryName) : '';
        
        // Strip email from display (show only name)
        const primaryDisplayName = (entry.primaryDisplay || '').split('<')[0].trim();
        const secondaryDisplayName = (entry.secondaryDisplay || '').split('<')[0].trim();
        
        html += `
            <tr class="${weekClass}">
                <td class="date-cell">${formatDateShort(entryDate)}</td>
                <td class="onsite-cell ${primaryColorClass}">${escapeHtml(primaryDisplayName)}</td>
                <td class="offshore-cell ${secondaryColorClass}">${escapeHtml(secondaryDisplayName)}</td>
                ${showActions ? `
                <td class="actions-cell">
                    <div class="action-btns">
                        <button class="btn-icon btn-edit" onclick="editModScheduleEntry(${index})" title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteModScheduleEntry(${index})" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
                ` : ''}
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    return html;
}

// Toggle admin panel
function toggleAdminPanel(screen) {
    const adminPanel = document.getElementById(`${screen}AdminPanel`);
    const toggleBtn = document.getElementById(`${screen}AdminToggleBtn`);
    
    if (adminPanel.classList.contains('hidden')) {
        adminPanel.classList.remove('hidden');
        toggleBtn.textContent = 'Hide Admin';
        adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        adminPanel.classList.add('hidden');
        toggleBtn.textContent = 'Admin Settings';
    }
}

// Initialize date pickers
function initializeDatePickers() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    
    ['mod', 'oncall'].forEach(screen => {
        const startId = screen === 'mod' ? 'modStartDate' : 'oncallStartDate';
        const endId = screen === 'mod' ? 'modEndDate' : 'oncallEndDate';
        document.getElementById(startId).value = formatDateForInput(firstDay);
        document.getElementById(endId).value = formatDateForInput(lastDay);
    });
}

// Initialize file uploads
function initializeFileUploads() {
    ['mod', 'oncall'].forEach(screen => {
        const uploadZone = document.getElementById(`${screen}UploadZone`);
        const csvFileInput = document.getElementById(`${screen}CsvFile`);
        
        uploadZone.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', (e) => handleFileSelect(e, screen));
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0], screen);
        });
    });
}

// Handle file selection
function handleFileSelect(e, screen) {
    const file = e.target.files[0];
    if (file) processFile(file, screen);
}

// Process uploaded CSV file
function processFile(file, screen) {
    if (!file.name.endsWith('.csv')) {
        showToast('Please upload a CSV file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target.result, screen);
    reader.onerror = () => showToast('Error reading file', 'error');
    reader.readAsText(file);
}

// Parse CSV content
function parseCSV(csvContent, screen) {
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
        showToast('CSV file is empty or has no data rows', 'error');
        return;
    }
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    
    const colMap = {
        location: findColumnIndex(headers, ['location', 'type', 'role']),
        name: findColumnIndex(headers, ['mod name', 'name', 'modname', 'person']),
        email: findColumnIndex(headers, ['email', 'e-mail']),
        contact: findColumnIndex(headers, ['contact', 'contact number', 'phone', 'mobile'])
    };
    
    const newPrimary = [];
    const newSecondary = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;
        
        const person = {
            id: Date.now() + i,
            name: getValue(values, colMap.name),
            email: getValue(values, colMap.email),
            contact: getValue(values, colMap.contact)
        };
        
        if (!person.name.trim()) continue;
        
        const location = getValue(values, colMap.location).toLowerCase();
        
        if (screen === 'mod') {
            if (location.includes('offshore') || location.includes('off-shore')) {
                newSecondary.push(person);
            } else {
                newPrimary.push(person);
            }
        } else {
            if (location.includes('secondary') || location.includes('backup')) {
                newSecondary.push(person);
            } else {
                newPrimary.push(person);
            }
        }
    }
    
    if (newPrimary.length === 0 && newSecondary.length === 0) {
        showToast('No valid entries found in the CSV', 'error');
        return;
    }
    
    appData[screen].primaryMods = removeDuplicates(newPrimary);
    appData[screen].secondaryMods = removeDuplicates(newSecondary);
    
    renderModLists(screen);
    showConfigSection(screen);
    updateStartIndexDropdowns(screen);
    
    const primaryLabel = screen === 'mod' ? 'Onsite' : 'Primary';
    const secondaryLabel = screen === 'mod' ? 'Offshore' : 'Secondary';
    showToast(`Imported ${appData[screen].primaryMods.length} ${primaryLabel} and ${appData[screen].secondaryMods.length} ${secondaryLabel}`);
    
    document.getElementById(`${screen}CsvFile`).value = '';
}

// Helper functions
function findColumnIndex(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h.includes(name) || h === name.replace(' ', ''));
        if (idx !== -1) return idx;
    }
    return -1;
}

function removeDuplicates(list) {
    const seen = new Map();
    return list.filter(item => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.set(key, true);
        return true;
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else current += char;
    }
    result.push(current.trim());
    return result;
}

function getValue(arr, index) {
    if (index === -1 || index >= arr.length) return '';
    return arr[index].replace(/^"|"$/g, '').trim();
}

function formatDateForInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateShort(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}`;
}

function getColorClass(screen, name) {
    if (!name || name.trim() === '') return '';
    const normalizedName = name.toLowerCase().trim();
    
    if (!colorMaps[screen].has(normalizedName)) {
        colorMaps[screen].set(normalizedName, colorIndices[screen]);
        colorIndices[screen]++;
        if (colorIndices[screen] > 16) colorIndices[screen] = 1;
    }
    return `mod-color-${colorMaps[screen].get(normalizedName)}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show config section
function showConfigSection(screen) {
    document.getElementById(`${screen}UploadedModList`).classList.remove('hidden');
    document.getElementById(`${screen}ConfigSection`).style.display = 'block';
}

// Update start index dropdowns
function updateStartIndexDropdowns(screen) {
    const primarySelect = document.getElementById(screen === 'mod' ? 'modStartOnsiteIndex' : 'oncallStartPrimaryIndex');
    const secondarySelect = document.getElementById(screen === 'mod' ? 'modStartOffshoreIndex' : 'oncallStartSecondaryIndex');
    
    primarySelect.innerHTML = appData[screen].primaryMods.map((p, idx) => 
        `<option value="${idx}">${idx + 1}. ${escapeHtml(p.name)}</option>`
    ).join('');
    
    secondarySelect.innerHTML = appData[screen].secondaryMods.map((p, idx) => 
        `<option value="${idx}">${idx + 1}. ${escapeHtml(p.name)}</option>`
    ).join('');
}

// Render MOD lists
function renderModLists(screen) {
    const primaryContainer = document.getElementById(screen === 'mod' ? 'modOnsiteModList' : 'oncallPrimaryModList');
    const secondaryContainer = document.getElementById(screen === 'mod' ? 'modOffshoreModList' : 'oncallSecondaryModList');
    const modCount = document.getElementById(`${screen}ModCount`);
    
    const primaryLabel = screen === 'mod' ? 'Onsite' : 'Primary';
    const secondaryLabel = screen === 'mod' ? 'Offshore' : 'Secondary';
    
    modCount.textContent = `${appData[screen].primaryMods.length} ${primaryLabel}, ${appData[screen].secondaryMods.length} ${secondaryLabel}`;
    
    primaryContainer.innerHTML = appData[screen].primaryMods.map((p, idx) => createModItem(p, idx, 'primary', screen)).join('');
    secondaryContainer.innerHTML = appData[screen].secondaryMods.map((p, idx) => createModItem(p, idx, 'secondary', screen)).join('');
    
    setupDragAndDrop(screen, 'primary');
    setupDragAndDrop(screen, 'secondary');
}

function createModItem(person, index, type, screen) {
    return `
        <div class="mod-rotation-item" draggable="true" data-id="${person.id}" data-type="${type}" data-screen="${screen}">
            <span class="position">${index + 1}</span>
            <div class="mod-info">
                <div class="mod-name">${escapeHtml(person.name)}</div>
                <div class="mod-email">${escapeHtml(person.email)}</div>
            </div>
            <span class="drag-handle">≡</span>
        </div>
    `;
}

function setupDragAndDrop(screen, type) {
    const containerId = screen === 'mod' 
        ? (type === 'primary' ? 'modOnsiteModList' : 'modOffshoreModList')
        : (type === 'primary' ? 'oncallPrimaryModList' : 'oncallSecondaryModList');
    
    const container = document.getElementById(containerId);
    const items = container.querySelectorAll('.mod-rotation-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedItem = this;
    draggedList = this.dataset.type;
    draggedScreen = this.dataset.screen;
    this.classList.add('dragging');
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    draggedList = null;
    draggedScreen = null;
}

function handleDragOver(e) {
    e.preventDefault();
    if (this.dataset.type !== draggedList || this.dataset.screen !== draggedScreen) return;
}

function handleDrop(e) {
    e.preventDefault();
    if (this === draggedItem || this.dataset.type !== draggedList || this.dataset.screen !== draggedScreen) return;
    
    const list = draggedList === 'primary' ? appData[draggedScreen].primaryMods : appData[draggedScreen].secondaryMods;
    const draggedId = parseInt(draggedItem.dataset.id);
    const targetId = parseInt(this.dataset.id);
    
    const draggedIndex = list.findIndex(m => m.id === draggedId);
    const targetIndex = list.findIndex(m => m.id === targetId);
    
    const [removed] = list.splice(draggedIndex, 1);
    list.splice(targetIndex, 0, removed);
    
    renderModLists(draggedScreen);
    updateStartIndexDropdowns(draggedScreen);
}

// Download CSV template
function downloadTemplate(screen) {
    const headers = screen === 'mod' 
        ? ['Location', 'MOD Name', 'Email', 'Contact Number']
        : ['Type', 'Name', 'Email', 'Contact Number'];
    
    const sampleData = screen === 'mod' ? [
        ['Onshore', 'John Smith', 'john.smith@amdocs.com', '+61 400 000 000'],
        ['Offshore', 'Jane Doe', 'jane.doe@amdocs.com', '+63 900 000 0000']
    ] : [
        ['Primary', 'John Smith', 'john.smith@amdocs.com', '+61 400 000 000'],
        ['Secondary', 'Jane Doe', 'jane.doe@amdocs.com', '+63 900 000 0000']
    ];
    
    let csvContent = headers.join(',') + '\n';
    sampleData.forEach(row => csvContent += row.map(cell => `"${cell}"`).join(',') + '\n');
    
    downloadFile(csvContent, `${screen === 'mod' ? 'MOD' : 'OnCall'}_Template.csv`, 'text/csv;charset=utf-8;');
    showToast('Template downloaded');
}

// Generate and save schedule
function generateAndSaveSchedule(screen) {
    if (appData[screen].primaryMods.length === 0 && appData[screen].secondaryMods.length === 0) {
        showToast('Please upload a list first', 'error');
        return;
    }
    
    const prefix = screen === 'mod' ? 'mod' : 'oncall';
    const startDate = new Date(document.getElementById(`${prefix}StartDate`).value);
    const endDate = new Date(document.getElementById(`${prefix}EndDate`).value);
    const rotationDays = parseInt(document.getElementById(`${prefix}RotationDays`).value);
    
    const startPrimaryIdx = parseInt(document.getElementById(screen === 'mod' ? 'modStartOnsiteIndex' : 'oncallStartPrimaryIndex').value) || 0;
    const startSecondaryIdx = parseInt(document.getElementById(screen === 'mod' ? 'modStartOffshoreIndex' : 'oncallStartSecondaryIndex').value) || 0;
    
    const primaryLabel = document.getElementById(screen === 'mod' ? 'modOnshoreShiftLabel' : 'oncallPrimaryShiftLabel').value;
    const secondaryLabel = document.getElementById(screen === 'mod' ? 'modOffshoreShiftLabel' : 'oncallSecondaryShiftLabel').value;
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        showToast('Please select valid dates', 'error');
        return;
    }
    
    // Generate schedule entries
    const entries = [];
    const currentDate = new Date(startDate);
    let dayCount = 0;
    let currentPrimaryIdx = startPrimaryIdx;
    let currentSecondaryIdx = startSecondaryIdx;
    
    while (currentDate <= endDate) {
        const primaryPerson = appData[screen].primaryMods.length > 0 
            ? appData[screen].primaryMods[currentPrimaryIdx % appData[screen].primaryMods.length] 
            : null;
        const secondaryPerson = appData[screen].secondaryMods.length > 0 
            ? appData[screen].secondaryMods[currentSecondaryIdx % appData[screen].secondaryMods.length] 
            : null;
        
        entries.push({
            date: currentDate.toISOString(),
            primaryName: primaryPerson ? primaryPerson.name : '',
            primaryDisplay: primaryPerson ? primaryPerson.name : '',
            secondaryName: secondaryPerson ? secondaryPerson.name : '',
            secondaryDisplay: secondaryPerson ? secondaryPerson.name : ''
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
        dayCount++;
        
        if (dayCount >= rotationDays) {
            dayCount = 0;
            currentPrimaryIdx++;
            currentSecondaryIdx++;
        }
    }
    
    const scheduleData = {
        entries: entries,
        primaryShiftLabel: primaryLabel,
        secondaryShiftLabel: secondaryLabel,
        rotationDays: rotationDays,
        lastUpdated: new Date().toISOString(),
        primaryMods: appData[screen].primaryMods,
        secondaryMods: appData[screen].secondaryMods
    };
    
    saveScheduleToStorage(screen, scheduleData);
    displaySavedSchedule(screen);
    
    document.getElementById(`${screen}AdminPanel`).classList.add('hidden');
    document.getElementById(`${screen}AdminToggleBtn`).textContent = 'Admin Settings';
    
    showToast('Schedule generated and saved!');
}

// Display details
function displayDetails(screen) {
    const data = appData[screen].savedSchedule;
    const prefix = screen;
    
    let primaryList = data?.primaryMods || appData[screen].primaryMods || [];
    let secondaryList = data?.secondaryMods || appData[screen].secondaryMods || [];
    
    if (primaryList.length === 0 && secondaryList.length === 0) {
        document.getElementById(`${prefix}NoDetailsMessage`).style.display = 'block';
        document.getElementById(`${prefix}DetailsContent`).classList.add('hidden');
        return;
    }
    
    document.getElementById(`${prefix}NoDetailsMessage`).style.display = 'none';
    document.getElementById(`${prefix}DetailsContent`).classList.remove('hidden');
    
    const primaryBodyId = screen === 'mod' ? 'modOnsiteDetailsBody' : 'oncallPrimaryDetailsBody';
    const secondaryBodyId = screen === 'mod' ? 'modOffshoreDetailsBody' : 'oncallSecondaryDetailsBody';
    
    document.getElementById(primaryBodyId).innerHTML = primaryList.map(p => `
        <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></td>
            <td>${escapeHtml(p.contact)}</td>
        </tr>
    `).join('');
    
    document.getElementById(secondaryBodyId).innerHTML = secondaryList.map(p => `
        <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></td>
            <td>${escapeHtml(p.contact)}</td>
        </tr>
    `).join('');
}

// Escalation functions
function loadEscalationContacts(screen) {
    try {
        const savedData = localStorage.getItem(STORAGE_KEYS[screen].escalation);
        if (savedData) {
            const escalation = JSON.parse(savedData);
            updateEscalationDisplay(screen, escalation);
            updateEscalationForm(screen, escalation);
        }
    } catch (e) {
        console.error(`Error loading ${screen} escalation:`, e);
    }
}

function updateEscalationDisplay(screen, data) {
    const prefix = screen;
    for (let i = 1; i <= 3; i++) {
        const esc = data[`esc${i}`];
        if (esc) {
            document.getElementById(`${prefix}Esc${i}Name`).textContent = esc.name || '-';
            document.getElementById(`${prefix}Esc${i}Role`).textContent = esc.role || '-';
            document.getElementById(`${prefix}Esc${i}Email`).innerHTML = esc.email ? `<a href="mailto:${esc.email}">${esc.email}</a>` : '-';
            document.getElementById(`${prefix}Esc${i}Phone`).textContent = esc.phone || '-';
        }
    }
}

function updateEscalationForm(screen, data) {
    const prefix = screen;
    for (let i = 1; i <= 3; i++) {
        const esc = data[`esc${i}`];
        if (esc) {
            document.getElementById(`${prefix}EditEsc${i}Name`).value = esc.name || '';
            document.getElementById(`${prefix}EditEsc${i}Role`).value = esc.role || '';
            document.getElementById(`${prefix}EditEsc${i}Email`).value = esc.email || '';
            document.getElementById(`${prefix}EditEsc${i}Phone`).value = esc.phone || '';
        }
    }
}

function toggleEscalationEdit(screen) {
    document.getElementById(`${screen}EscalationEditForm`).classList.toggle('hidden');
}

function saveEscalationContacts(screen) {
    const prefix = screen;
    const escalationData = {};
    
    for (let i = 1; i <= 3; i++) {
        escalationData[`esc${i}`] = {
            name: document.getElementById(`${prefix}EditEsc${i}Name`).value,
            role: document.getElementById(`${prefix}EditEsc${i}Role`).value,
            email: document.getElementById(`${prefix}EditEsc${i}Email`).value,
            phone: document.getElementById(`${prefix}EditEsc${i}Phone`).value
        };
    }
    
    try {
        localStorage.setItem(STORAGE_KEYS[screen].escalation, JSON.stringify(escalationData));
        updateEscalationDisplay(screen, escalationData);
        toggleEscalationEdit(screen);
        showToast('Escalation contacts saved!');
    } catch (e) {
        showToast('Error saving escalation contacts', 'error');
    }
}

// Export/Import
function exportScheduleJSON(screen) {
    const data = appData[screen].savedSchedule;
    if (!data || !data.entries || data.entries.length === 0) {
        showToast('No schedule to export', 'error');
        return;
    }
    
    // Prepare data for Excel export
    const excelData = data.entries.map(entry => {
        const date = new Date(entry.date);
        const primaryDisplay = entry.primaryDisplay || '';
        const secondaryDisplay = entry.secondaryDisplay || '';
        
        // Extract name and email
        const primaryName = primaryDisplay.split('<')[0].trim();
        const primaryEmail = primaryDisplay.includes('<') ? primaryDisplay.match(/<(.+?)>/)?.[1] || '' : '';
        const secondaryName = secondaryDisplay.split('<')[0].trim();
        const secondaryEmail = secondaryDisplay.includes('<') ? secondaryDisplay.match(/<(.+?)>/)?.[1] || '' : '';
        
        return {
            'Date': formatDateShort(date),
            'Day': date.toLocaleDateString('en-US', { weekday: 'long' }),
            [screen === 'mod' ? 'Onsite MOD' : 'Primary On-Call']: primaryName,
            [screen === 'mod' ? 'Onsite Email' : 'Primary Email']: primaryEmail,
            [screen === 'mod' ? 'Offshore MOD' : 'Secondary On-Call']: secondaryName,
            [screen === 'mod' ? 'Offshore Email' : 'Secondary Email']: secondaryEmail
        };
    });
    
    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    
    // Auto-size columns
    const colWidths = [
        { wch: 12 },  // Date
        { wch: 12 },  // Day
        { wch: 25 },  // Onsite/Primary Name
        { wch: 30 },  // Onsite/Primary Email
        { wch: 25 },  // Offshore/Secondary Name
        { wch: 30 }   // Offshore/Secondary Email
    ];
    ws['!cols'] = colWidths;
    
    // Generate filename and download
    const fileName = `${screen === 'mod' ? 'MOD' : 'OnCall'}_Schedule_${formatDateForInput(new Date())}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast('Schedule exported to Excel');
}

function importScheduleJSON(event, screen) {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.json')) {
        showToast('Please select a JSON file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.entries) {
                showToast('Invalid schedule file', 'error');
                return;
            }
            
            saveScheduleToStorage(screen, importedData);
            displaySavedSchedule(screen);
            
            if (importedData.primaryMods) appData[screen].primaryMods = importedData.primaryMods;
            if (importedData.secondaryMods) appData[screen].secondaryMods = importedData.secondaryMods;
            
            showToast('Schedule imported!');
        } catch (err) {
            showToast('Error reading JSON file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Clear all
function clearAll(screen) {
    if (confirm('Are you sure you want to clear all data?')) {
        localStorage.removeItem(STORAGE_KEYS[screen].schedule);
        appData[screen] = { primaryMods: [], secondaryMods: [], savedSchedule: null };
        colorMaps[screen].clear();
        colorIndices[screen] = 1;
        
        document.getElementById(`${screen}UploadedModList`).classList.add('hidden');
        document.getElementById(`${screen}ConfigSection`).style.display = 'none';
        displaySavedSchedule(screen);
        
        showToast('All data cleared');
    }
}

// Toast notification
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (type === 'error') toast.style.backgroundColor = '#ef4444';
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== L2 ROSTER FUNCTIONS ====================

// Initialize L2 upload
document.addEventListener('DOMContentLoaded', function() {
    initializeL2Upload();
    loadL2Schedule();
});

function initializeL2Upload() {
    const uploadZone = document.getElementById('l2UploadZone');
    const csvFileInput = document.getElementById('l2CsvFile');
    
    if (!uploadZone || !csvFileInput) return;
    
    uploadZone.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', (e) => handleL2FileSelect(e));
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) processL2File(e.dataTransfer.files[0]);
    });
    
    // Set default dates
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    
    const startEl = document.getElementById('l2StartDate');
    const endEl = document.getElementById('l2EndDate');
    if (startEl) startEl.value = formatDateForInput(firstDay);
    if (endEl) endEl.value = formatDateForInput(lastDay);
}

function handleL2FileSelect(e) {
    const file = e.target.files[0];
    if (file) processL2File(file);
}

function processL2File(file) {
    if (!file.name.endsWith('.csv')) {
        showToast('Please upload a CSV file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => parseL2CSV(e.target.result);
    reader.onerror = () => showToast('Error reading file', 'error');
    reader.readAsText(file);
}

function parseL2CSV(csvContent) {
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
        showToast('CSV file is empty', 'error');
        return;
    }
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    
    const colMap = {
        name: findColumnIndex(headers, ['name', 'person', 'l2 name']),
        email: findColumnIndex(headers, ['email', 'e-mail']),
        contact: findColumnIndex(headers, ['contact', 'phone', 'mobile'])
    };
    
    const newMods = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 1) continue;
        
        const person = {
            id: Date.now() + i,
            name: getValue(values, colMap.name),
            email: getValue(values, colMap.email),
            contact: getValue(values, colMap.contact)
        };
        
        if (person.name.trim()) newMods.push(person);
    }
    
    if (newMods.length === 0) {
        showToast('No valid entries found', 'error');
        return;
    }
    
    appData.l2.mods = removeDuplicates(newMods);
    renderL2List();
    document.getElementById('l2UploadedList').classList.remove('hidden');
    document.getElementById('l2ConfigSection').classList.remove('hidden');
    showToast(`Imported ${appData.l2.mods.length} L2 personnel`);
    document.getElementById('l2CsvFile').value = '';
}

function renderL2List() {
    const container = document.getElementById('l2ModList');
    const countEl = document.getElementById('l2ModCount');
    
    countEl.textContent = `${appData.l2.mods.length} personnel`;
    
    container.innerHTML = appData.l2.mods.map((p, idx) => `
        <div class="mod-rotation-item">
            <span class="position">${idx + 1}</span>
            <div class="mod-info">
                <div class="mod-name">${escapeHtml(p.name)}</div>
                <div class="mod-email">${escapeHtml(p.email)}</div>
            </div>
        </div>
    `).join('');
}

function toggleL2AdminPanel() {
    const panel = document.getElementById('l2AdminPanel');
    panel.classList.toggle('hidden');
}

function downloadL2Template() {
    const headers = ['Name', 'Email', 'Contact Number'];
    const sampleData = [
        ['John Smith', 'john.smith@amdocs.com', '+61 400 000 000'],
        ['Jane Doe', 'jane.doe@amdocs.com', '+63 900 000 0000']
    ];
    
    let csvContent = headers.join(',') + '\n';
    sampleData.forEach(row => csvContent += row.map(cell => `"${cell}"`).join(',') + '\n');
    
    downloadFile(csvContent, 'L2_Roster_Template.csv', 'text/csv;charset=utf-8;');
    showToast('L2 template downloaded');
}

function generateL2Schedule() {
    if (appData.l2.mods.length === 0) {
        showToast('Please upload L2 roster first', 'error');
        return;
    }
    
    const startDate = new Date(document.getElementById('l2StartDate').value);
    const endDate = new Date(document.getElementById('l2EndDate').value);
    const rotationDays = parseInt(document.getElementById('l2RotationDays').value);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        showToast('Please select valid dates', 'error');
        return;
    }
    
    const entries = [];
    const currentDate = new Date(startDate);
    let dayCount = 0;
    let currentIdx = 0;
    
    while (currentDate <= endDate) {
        const person = appData.l2.mods[currentIdx % appData.l2.mods.length];
        
        entries.push({
            date: currentDate.toISOString(),
            name: person.name,
            display: `${person.name}${person.email ? ` <${person.email}>` : ''}`
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
        dayCount++;
        
        if (dayCount >= rotationDays) {
            dayCount = 0;
            currentIdx++;
        }
    }
    
    const scheduleData = {
        entries: entries,
        lastUpdated: new Date().toISOString(),
        mods: appData.l2.mods
    };
    
    localStorage.setItem(STORAGE_KEYS.l2.schedule, JSON.stringify(scheduleData));
    appData.l2.savedSchedule = scheduleData;
    displayL2Schedule();
    
    document.getElementById('l2AdminPanel').classList.add('hidden');
    showToast('L2 Schedule generated!');
}

function loadL2Schedule() {
    try {
        const savedData = localStorage.getItem(STORAGE_KEYS.l2.schedule);
        if (savedData) {
            appData.l2.savedSchedule = JSON.parse(savedData);
            displayL2Schedule();
        }
    } catch (e) {
        console.error('Error loading L2 schedule:', e);
    }
}

function displayL2Schedule() {
    const data = appData.l2.savedSchedule;
    
    if (!data || !data.entries || data.entries.length === 0) {
        document.getElementById('l2NoScheduleMessage').style.display = 'block';
        document.getElementById('l2ScheduleTableContainer').classList.add('hidden');
        return;
    }
    
    colorMaps['l2'] = colorMaps['l2'] || new Map();
    colorIndices['l2'] = 1;
    colorMaps['l2'].clear();
    
    let html = `
        <table class="mod-schedule-table">
            <thead>
                <tr>
                    <th class="days-header">Days</th>
                    <th class="onsite-header">L2 On-Call</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.entries.forEach(entry => {
        const colorClass = entry.name ? getColorClass('l2', entry.name) : '';
        html += `
            <tr>
                <td class="date-cell">${formatDateShort(new Date(entry.date))}</td>
                <td class="onsite-cell ${colorClass}">${escapeHtml(entry.display || '')}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    
    document.getElementById('l2ScheduleContent').innerHTML = html;
    document.getElementById('l2NoScheduleMessage').style.display = 'none';
    document.getElementById('l2ScheduleTableContainer').classList.remove('hidden');
    
    // Update L2 contacts section
    updateL2Contacts();
}

function updateL2Contacts() {
    const data = appData.l2.savedSchedule;
    if (!data || !data.mods) return;
    
    const section = document.getElementById('l2ContactsSection');
    const tbody = document.getElementById('l2DetailsBody');
    
    if (data.mods.length > 0) {
        section.style.display = 'block';
        tbody.innerHTML = data.mods.map(p => `
            <tr>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></td>
                <td>${escapeHtml(p.contact)}</td>
            </tr>
        `).join('');
    }
}

function exportL2RosterJSON() {
    const data = appData.l2.savedSchedule;
    if (!data) {
        showToast('No L2 schedule to export', 'error');
        return;
    }
    
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `L2_Schedule_${formatDateForInput(new Date())}.json`, 'application/json');
    showToast('L2 schedule exported');
}

// ========================================
// CONTACT DETAILS CRUD FUNCTIONS
// ========================================

async function initializeContactsData() {
    if (useDatabase) {
        const data = await db.getContacts();
        if (data && Object.keys(data).length > 0) {
            contactsData = data;
        } else {
            // Initialize with default data
            contactsData = extractContactsFromHTML();
            // Save to database
            for (const [team, contacts] of Object.entries(contactsData)) {
                for (const contact of contacts) {
                    await db.saveContact(team, contact);
                }
            }
            // Reload to get IDs
            contactsData = await db.getContacts();
        }
    } else {
        const saved = localStorage.getItem(STORAGE_KEYS.oncall.contacts);
        if (saved) {
            contactsData = JSON.parse(saved);
        } else {
            contactsData = extractContactsFromHTML();
            saveContactsData();
        }
    }
    renderAllContactTables();
}

function extractContactsFromHTML() {
    const teams = {
        frontend: [], b2b: [], backend: [], anm: [], digital: [],
        infra: [], ods: [], sdm: [], senior: [], l2: []
    };
    
    const teamMap = {
        'Frontend Team': 'frontend',
        'B2B Team': 'b2b',
        'Backend Team': 'backend',
        'ANM Team': 'anm',
        'Digital Team': 'digital',
        'Infra Team': 'infra',
        'ODS Team': 'ods',
        'SDM Team': 'sdm',
        'Senior Escalation': 'senior',
        'L2 Team': 'l2'
    };
    
    document.querySelectorAll('#oncall-contactsTab .contact-team-section').forEach(section => {
        const headerText = section.querySelector('.team-header span')?.textContent?.trim();
        const teamKey = teamMap[headerText];
        if (!teamKey) return;
        
        section.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                const emailLink = cells[6].querySelector('a');
                teams[teamKey].push({
                    area: cells[0]?.textContent?.trim() || '',
                    name: cells[1]?.textContent?.trim() || '',
                    site: cells[2]?.textContent?.trim() || '',
                    escalation: cells[3]?.textContent?.trim() || '',
                    phone: cells[4]?.textContent?.trim() || '',
                    cpid: cells[5]?.textContent?.trim() || '',
                    email: emailLink ? emailLink.textContent.trim() : (cells[6]?.textContent?.trim() || '')
                });
            }
        });
    });
    
    return teams;
}

function saveContactsData() {
    localStorage.setItem(STORAGE_KEYS.oncall.contacts, JSON.stringify(contactsData));
}

// Contact Search Functions
function searchContacts(searchTerm) {
    const term = searchTerm.trim().toLowerCase();
    const resultsCount = document.getElementById('searchResultsCount');
    const teamSections = document.querySelectorAll('.contact-team-section');
    
    if (!term) {
        // Clear search - show all
        teamSections.forEach(section => {
            section.classList.remove('search-hidden');
            section.style.display = '';
            const rows = section.querySelectorAll('tbody tr');
            rows.forEach(row => {
                row.classList.remove('search-match', 'search-hidden');
                row.style.display = '';
            });
        });
        resultsCount.textContent = '';
        resultsCount.classList.remove('has-results');
        return;
    }
    
    let totalMatches = 0;
    let teamsWithMatches = 0;
    
    teamSections.forEach(section => {
        const rows = section.querySelectorAll('tbody tr');
        let sectionMatches = 0;
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let rowText = '';
            cells.forEach(cell => {
                rowText += ' ' + cell.textContent.toLowerCase();
            });
            
            if (rowText.includes(term)) {
                row.classList.add('search-match');
                row.classList.remove('search-hidden');
                row.style.display = '';
                sectionMatches++;
                totalMatches++;
            } else {
                row.classList.remove('search-match');
                row.classList.add('search-hidden');
                row.style.display = 'none';
            }
        });
        
        // Hide section if no matches
        if (sectionMatches === 0) {
            section.classList.add('search-hidden');
            section.style.display = 'none';
        } else {
            section.classList.remove('search-hidden');
            section.style.display = '';
            teamsWithMatches++;
        }
    });
    
    // Update results count
    if (totalMatches > 0) {
        resultsCount.textContent = `Found ${totalMatches} contact${totalMatches !== 1 ? 's' : ''} in ${teamsWithMatches} team${teamsWithMatches !== 1 ? 's' : ''}`;
        resultsCount.classList.add('has-results');
    } else {
        resultsCount.textContent = 'No contacts found matching your search';
        resultsCount.classList.remove('has-results');
    }
}

function clearContactSearch() {
    const searchInput = document.getElementById('contactSearchInput');
    searchInput.value = '';
    searchContacts('');
    searchInput.focus();
}

function renderAllContactTables() {
    const teamConfig = [
        { key: 'frontend', name: 'Frontend Team', headerClass: 'frontend-header' },
        { key: 'b2b', name: 'B2B Team', headerClass: 'b2b-header' },
        { key: 'backend', name: 'Backend Team', headerClass: 'backend-header' },
        { key: 'anm', name: 'ANM Team', headerClass: 'anm-header' },
        { key: 'digital', name: 'Digital Team', headerClass: 'digital-header' },
        { key: 'infra', name: 'Infra Team', headerClass: 'infra-header' },
        { key: 'ods', name: 'ODS Team', headerClass: 'ods-header' },
        { key: 'sdm', name: 'SDM Team', headerClass: 'sdm-header' },
        { key: 'senior', name: 'Senior Escalation', headerClass: 'senior-header' },
        { key: 'l2', name: 'L2 Team', headerClass: 'l2-header' }
    ];
    
    const container = document.querySelector('#oncall-contactsTab .card');
    const header = container.querySelector('.contact-details-header');
    const modal = document.getElementById('contactModal');
    
    // Remove existing team sections
    container.querySelectorAll('.contact-team-section').forEach(el => el.remove());
    
    // Render each team
    teamConfig.forEach(team => {
        const rawContacts = contactsData[team.key] || [];
        // Create sorted array with original indices
        const contacts = rawContacts
            .map((c, idx) => ({ ...c, _originalIndex: idx }))
            .sort((a, b) => (a.area || '').localeCompare(b.area || ''));
        const section = document.createElement('div');
        section.className = 'contact-team-section';
        section.innerHTML = `
            <div class="team-header ${team.headerClass}" onclick="toggleTeamSection(this)">
                <span>${team.name}</span>
                <button class="toggle-btn" title="Hide">
                    <svg class="eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                </button>
            </div>
            <div class="team-table-container">
                <table class="contact-details-table" data-team="${team.key}">
                    <thead>
                        <tr>
                            <th>Application Area</th>
                            <th>Name</th>
                            <th>Site</th>
                            <th>Escalation Point</th>
                            <th>Contact Number</th>
                            <th>CPID</th>
                            <th>Optus Email</th>
                            <th class="actions-col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderContactRows(team.key, contacts)}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(section);
    });
}

function renderContactRows(teamKey, contacts) {
    if (!contacts || contacts.length === 0) {
        return '<tr><td colspan="8" style="text-align:center;color:#666;padding:1rem;">No contacts in this team</td></tr>';
    }
    
    return contacts.map((contact) => {
        const rowClass = getContactRowClass(contact.escalation);
        const originalIndex = contact._originalIndex !== undefined ? contact._originalIndex : contacts.indexOf(contact);
        const emailDisplay = contact.email 
            ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` 
            : '';
        
        return `
            <tr class="${rowClass}" data-index="${originalIndex}">
                <td>${escapeHtml(contact.area)}</td>
                <td>${escapeHtml(contact.name)}</td>
                <td>${escapeHtml(contact.site)}</td>
                <td>${escapeHtml(contact.escalation)}</td>
                <td>${escapeHtml(contact.phone)}</td>
                <td>${escapeHtml(contact.cpid)}</td>
                <td>${emailDisplay}</td>
                <td class="actions-col">
                    <button class="action-btn edit-btn" onclick="editContact('${teamKey}', ${originalIndex})" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteContact('${teamKey}', ${originalIndex})" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getContactRowClass(escalation) {
    if (!escalation) return '';
    const lower = escalation.toLowerCase();
    if (lower.includes('first')) return 'escalation-highlight';
    if (lower.includes('second')) return 'manager-highlight';
    if (lower.includes('third')) return 'third-escalation';
    return '';
}

function toggleContactEditMode() {
    contactEditMode = !contactEditMode;
    const card = document.querySelector('#oncall-contactsTab .card');
    const editBtn = document.querySelector('#oncall-contactsTab .contact-actions .btn-secondary');
    const addBtn = document.getElementById('addContactBtn');
    const editText = document.getElementById('editModeText');
    
    if (contactEditMode) {
        card.classList.add('edit-mode');
        editBtn.classList.add('edit-mode-active');
        editText.textContent = 'Exit Edit Mode';
        addBtn.classList.remove('hidden');
    } else {
        card.classList.remove('edit-mode');
        editBtn.classList.remove('edit-mode-active');
        editText.textContent = 'Edit Mode';
        addBtn.classList.add('hidden');
    }
}

function openContactModal(teamKey = '', index = -1) {
    const modal = document.getElementById('contactModal');
    const title = document.getElementById('contactModalTitle');
    const form = document.getElementById('contactForm');
    
    form.reset();
    document.getElementById('contactEditIndex').value = index;
    document.getElementById('contactEditTeam').value = teamKey;
    
    if (index >= 0 && teamKey && contactsData[teamKey]) {
        const contact = contactsData[teamKey][index];
        title.textContent = 'Edit Contact';
        document.getElementById('contactTeam').value = teamKey;
        document.getElementById('contactTeam').disabled = true;
        document.getElementById('contactArea').value = contact.area || '';
        document.getElementById('contactName').value = contact.name || '';
        document.getElementById('contactSite').value = contact.site || '';
        document.getElementById('contactEscalation').value = contact.escalation || '';
        document.getElementById('contactPhone').value = contact.phone || '';
        document.getElementById('contactCPID').value = contact.cpid || '';
        document.getElementById('contactEmail').value = contact.email || '';
    } else {
        title.textContent = 'Add New Contact';
        document.getElementById('contactTeam').disabled = false;
    }
    
    modal.classList.remove('hidden');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.add('hidden');
    document.getElementById('contactTeam').disabled = false;
}

async function saveContact(event) {
    event.preventDefault();
    
    const teamKey = document.getElementById('contactTeam').value;
    const editIndex = parseInt(document.getElementById('contactEditIndex').value);
    const editTeam = document.getElementById('contactEditTeam').value;
    
    const contact = {
        area: document.getElementById('contactArea').value.trim(),
        name: document.getElementById('contactName').value.trim(),
        site: document.getElementById('contactSite').value,
        escalation: document.getElementById('contactEscalation').value,
        phone: document.getElementById('contactPhone').value.trim(),
        cpid: document.getElementById('contactCPID').value.trim(),
        email: document.getElementById('contactEmail').value.trim()
    };
    
    if (useDatabase) {
        if (editIndex >= 0 && editTeam && contactsData[editTeam] && contactsData[editTeam][editIndex]) {
            const id = contactsData[editTeam][editIndex]._id;
            await db.updateContact(id, contact);
            showToast('Contact updated successfully');
        } else {
            await db.saveContact(teamKey, contact);
            showToast('Contact added successfully');
        }
        // Reload from database
        contactsData = await db.getContacts();
    } else {
        if (!contactsData[teamKey]) {
            contactsData[teamKey] = [];
        }
        
        if (editIndex >= 0 && editTeam) {
            contactsData[editTeam][editIndex] = contact;
            showToast('Contact updated successfully');
        } else {
            contactsData[teamKey].push(contact);
            showToast('Contact added successfully');
        }
        saveContactsData();
    }
    
    renderAllContactTables();
    closeContactModal();
    
    if (contactEditMode) {
        document.querySelector('#oncall-contactsTab .card').classList.add('edit-mode');
    }
}

function editContact(teamKey, index) {
    openContactModal(teamKey, index);
}

async function deleteContact(teamKey, index) {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    if (contactsData[teamKey]) {
        if (useDatabase) {
            const id = contactsData[teamKey][index]._id;
            await db.deleteContact(id);
            contactsData = await db.getContacts();
        } else {
            contactsData[teamKey].splice(index, 1);
            saveContactsData();
        }
        
        renderAllContactTables();
        showToast('Contact deleted');
        
        if (contactEditMode) {
            document.querySelector('#oncall-contactsTab .card').classList.add('edit-mode');
        }
    }
}

// ========================================
// ESCALATION MATRIX CRUD FUNCTIONS
// ========================================

let escalationMatrixData = null;
let escMatrixEditMode = false;
const ESC_MATRIX_STORAGE_KEY = 'escalation_matrix_data';

async function initializeEscalationMatrixData() {
    if (useDatabase) {
        const data = await db.getEscalationMatrix();
        if (data && data.length > 0) {
            escalationMatrixData = data;
        } else {
            // Initialize with default data
            escalationMatrixData = getDefaultEscalationMatrixData();
            for (const entry of escalationMatrixData) {
                await db.saveEscalationEntry(entry);
            }
            // Reload to get IDs
            escalationMatrixData = await db.getEscalationMatrix();
        }
    } else {
        const saved = localStorage.getItem(ESC_MATRIX_STORAGE_KEY);
        if (saved) {
            escalationMatrixData = JSON.parse(saved);
        } else {
            escalationMatrixData = getDefaultEscalationMatrixData();
            saveEscalationMatrixData();
        }
    }
    renderEscalationMatrixTable();
}

function getDefaultEscalationMatrixData() {
    return [
        { app: 'Frontend', area: 'CRM/SDP/MCO', onCall: 'Software Dev', first: 'Pankaj Rahate\nPrajwal Jilate', second: 'Manisha\nAshwani', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Frontend', area: 'OMS/Fallout', onCall: 'Software Dev', first: 'Anurag', second: 'Manisha\nAshwani', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Frontend', area: 'ASOM/Fallout', onCall: 'Software Dev', first: 'Anurag', second: 'Ashwani', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Frontend', area: 'ASOM/Fallout', onCall: 'Software Dev', first: 'Ganesh', second: 'Manisha', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Frontend', area: 'MEC', onCall: 'Software Dev', first: 'Chaitanya', second: 'Manisha\nAshwani', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'B2B', area: 'C1D1', onCall: 'Software Dev', first: 'Praveen', second: 'Sandeep', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Backend', area: 'TC/RLC', onCall: 'Software Dev', first: 'Kevin Manio\nNikhil Dhage', second: 'Atmaram ( 6 PM AEST to 6 AM AEST )\nBindiya ( 6 AM to 6 PM AEST)', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Backend', area: 'AR/CM/CL', onCall: 'Software Dev', first: 'Debjyoti Ghosh\nAniket Nikam', second: 'Atmaram ( 6 PM AEST to 6 AM AEST )\nBindiya ( 6 AM to 6 PM AEST)', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'Backend', area: 'Inv/AMDD', onCall: 'Software Dev', first: 'Akashdeep', second: 'Atmaram ( 6 PM AEST to 6 AM AEST )\nBindiya ( 6 AM to 6 PM AEST)', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' },
        { app: 'ANM', area: 'ANM', onCall: 'Software Dev', first: 'Orit', second: 'Orit', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin', firstAlert: true, secondAlert: true },
        { app: 'Digital', area: 'Digital', onCall: 'Software Dev', first: '', second: 'Manisha\nPrashant', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin', firstAlert: true },
        { app: 'Infra', area: 'Infra', onCall: 'Software Dev', first: 'Rahul', second: '', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin', secondAlert: true },
        { app: 'Infra', area: 'ODS Infra', onCall: 'Software Dev', first: 'Rodel', second: '', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin', secondAlert: true },
        { app: 'ODS', area: 'ODS', onCall: 'Software Dev', first: 'Rohan Hembade', second: 'Prachi M.', third: 'MOD', fourth: 'Vikram', fifth: 'Sachin' }
    ];
}

function saveEscalationMatrixData() {
    localStorage.setItem(ESC_MATRIX_STORAGE_KEY, JSON.stringify(escalationMatrixData));
}

function renderEscalationMatrixTable() {
    const tbody = document.getElementById('escalationMatrixBody');
    if (!tbody || !escalationMatrixData) return;
    
    const appClassMap = {
        'Frontend': 'frontend', 'B2B': 'b2b', 'Backend': 'backend',
        'ANM': 'anm', 'Digital': 'digital', 'Infra': 'infra', 'ODS': 'ods'
    };
    
    // Group by application for rowspan calculation
    const appGroups = {};
    escalationMatrixData.forEach((row, idx) => {
        if (!appGroups[row.app]) appGroups[row.app] = [];
        appGroups[row.app].push({ ...row, _index: idx });
    });
    
    let html = '';
    let currentApp = null;
    
    escalationMatrixData.forEach((row, idx) => {
        const appClass = appClassMap[row.app] || 'frontend';
        const isFirstOfApp = currentApp !== row.app;
        const appRowspan = appGroups[row.app]?.length || 1;
        
        const formatCell = (text) => (text || '').replace(/\n/g, '<br>');
        
        html += `<tr data-index="${idx}">`;
        
        if (isFirstOfApp) {
            html += `<td class="app-cell app-${appClass}" rowspan="${appRowspan}">${escapeHtml(row.app)}</td>`;
            currentApp = row.app;
        }
        
        html += `<td class="area-cell area-${appClass}">${escapeHtml(row.area)}</td>`;
        html += `<td>${escapeHtml(row.onCall)}</td>`;
        html += `<td class="${row.firstAlert ? 'cell-alert' : ''}">${formatCell(escapeHtml(row.first))}</td>`;
        html += `<td class="${row.secondAlert ? 'cell-alert' : ''}">${formatCell(escapeHtml(row.second))}</td>`;
        html += `<td>${escapeHtml(row.third)}</td>`;
        html += `<td>${escapeHtml(row.fourth)}</td>`;
        html += `<td>${escapeHtml(row.fifth)}</td>`;
        html += `<td class="actions-col">
            <button class="action-btn edit-btn" onclick="editEscalationEntry(${idx})" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteEscalationEntry(${idx})" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        </td>`;
        html += '</tr>';
    });
    
    tbody.innerHTML = html;
    
    if (escMatrixEditMode) {
        document.querySelector('.escalation-matrix-card').classList.add('esc-edit-mode');
    }
}

function toggleEscalationMatrixEditMode() {
    escMatrixEditMode = !escMatrixEditMode;
    const card = document.querySelector('.escalation-matrix-card');
    const editBtn = document.querySelector('.escalation-actions .btn-secondary');
    const addBtn = document.getElementById('addEscalationBtn');
    const editText = document.getElementById('escMatrixEditModeText');
    
    if (escMatrixEditMode) {
        card.classList.add('esc-edit-mode');
        editBtn.classList.add('edit-mode-active');
        editText.textContent = 'Exit Edit Mode';
        addBtn.classList.remove('hidden');
    } else {
        card.classList.remove('esc-edit-mode');
        editBtn.classList.remove('edit-mode-active');
        editText.textContent = 'Edit Mode';
        addBtn.classList.add('hidden');
    }
}

function openEscalationModal(index = -1) {
    const modal = document.getElementById('escalationModal');
    const title = document.getElementById('escalationModalTitle');
    const form = document.getElementById('escalationForm');
    
    form.reset();
    document.getElementById('escEditIndex').value = index;
    
    if (index >= 0 && escalationMatrixData[index]) {
        const entry = escalationMatrixData[index];
        title.textContent = 'Edit Escalation Entry';
        document.getElementById('escApplication').value = entry.app || '';
        document.getElementById('escArea').value = entry.area || '';
        document.getElementById('escOnCall').value = entry.onCall || '';
        document.getElementById('escFirst').value = (entry.first || '').replace(/\n/g, ', ');
        document.getElementById('escSecond').value = (entry.second || '').replace(/\n/g, ', ');
        document.getElementById('escThird').value = entry.third || '';
        document.getElementById('escFourth').value = entry.fourth || '';
        document.getElementById('escFifth').value = entry.fifth || '';
    } else {
        title.textContent = 'Add Escalation Entry';
    }
    
    modal.classList.remove('hidden');
}

function closeEscalationModal() {
    document.getElementById('escalationModal').classList.add('hidden');
}

async function saveEscalationEntry(event) {
    event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('escEditIndex').value);
    
    const entry = {
        app: document.getElementById('escApplication').value,
        area: document.getElementById('escArea').value.trim(),
        onCall: document.getElementById('escOnCall').value.trim(),
        first: document.getElementById('escFirst').value.trim().replace(/, /g, '\n'),
        second: document.getElementById('escSecond').value.trim().replace(/, /g, '\n'),
        third: document.getElementById('escThird').value.trim(),
        fourth: document.getElementById('escFourth').value.trim(),
        fifth: document.getElementById('escFifth').value.trim(),
        firstAlert: !document.getElementById('escFirst').value.trim(),
        secondAlert: !document.getElementById('escSecond').value.trim()
    };
    
    if (useDatabase) {
        if (editIndex >= 0 && escalationMatrixData[editIndex]) {
            const id = escalationMatrixData[editIndex]._id;
            await db.updateEscalationEntry(id, entry);
            showToast('Escalation entry updated');
        } else {
            await db.saveEscalationEntry(entry);
            showToast('Escalation entry added');
        }
        // Reload from database
        escalationMatrixData = await db.getEscalationMatrix();
    } else {
        if (editIndex >= 0) {
            escalationMatrixData[editIndex] = entry;
            showToast('Escalation entry updated');
        } else {
            // Insert in correct position (grouped by app)
            const appIndex = escalationMatrixData.findIndex(e => e.app === entry.app);
            if (appIndex >= 0) {
                // Find last entry of this app
                let lastIndex = appIndex;
                for (let i = appIndex; i < escalationMatrixData.length; i++) {
                    if (escalationMatrixData[i].app === entry.app) lastIndex = i;
                    else break;
                }
                escalationMatrixData.splice(lastIndex + 1, 0, entry);
            } else {
                escalationMatrixData.push(entry);
            }
            showToast('Escalation entry added');
        }
        
        // Sort by application
        const appOrder = ['Frontend', 'B2B', 'Backend', 'ANM', 'Digital', 'Infra', 'ODS'];
        escalationMatrixData.sort((a, b) => {
            const aIdx = appOrder.indexOf(a.app);
            const bIdx = appOrder.indexOf(b.app);
            if (aIdx !== bIdx) return aIdx - bIdx;
            return (a.area || '').localeCompare(b.area || '');
        });
        
        saveEscalationMatrixData();
    }
    
    renderEscalationMatrixTable();
    closeEscalationModal();
}

function editEscalationEntry(index) {
    openEscalationModal(index);
}

async function deleteEscalationEntry(index) {
    if (!confirm('Are you sure you want to delete this escalation entry?')) return;
    
    if (useDatabase) {
        const id = escalationMatrixData[index]._id;
        await db.deleteEscalationEntry(id);
        escalationMatrixData = await db.getEscalationMatrix();
    } else {
        escalationMatrixData.splice(index, 1);
        saveEscalationMatrixData();
    }
    
    renderEscalationMatrixTable();
    showToast('Escalation entry deleted');
}

// ========================================
// ROSTER TABLE CRUD FUNCTIONS
// ========================================

let rosterData = null;
let rosterEditMode = false;
const ROSTER_STORAGE_KEY = 'oncall_roster_data';

async function initializeRosterData() {
    // Set default week to current Monday first
    goToCurrentWeek();
    
    // Then load data for that week
    await loadRosterDataForWeek();
    
    renderRosterTable();
}

async function loadRosterDataForWeek() {
    const weekStart = getCurrentWeekStart();
    
    if (useDatabase) {
        const data = await db.getRoster(weekStart);
        if (data && data.length > 0) {
            rosterData = data;
        } else {
            // No data for this week - use default template structure with empty days
            const templateData = getDefaultRosterData().map(entry => ({
                time: entry.time,
                app: entry.app,
                team: entry.team,
                days: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }
            }));
            
            // Batch insert all entries at once (much faster!)
            await db.saveRosterEntriesBatch(templateData, weekStart);
            
            // Reload to get IDs
            rosterData = await db.getRoster(weekStart);
        }
    } else {
        const storageKey = `${ROSTER_STORAGE_KEY}_${weekStart}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            rosterData = JSON.parse(saved);
        } else {
            // Use default template with empty days
            rosterData = getDefaultRosterData().map(entry => ({
                time: entry.time,
                app: entry.app,
                team: entry.team,
                days: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }
            }));
            saveRosterData();
        }
    }
}

function getCurrentWeekStart() {
    const weekStartInput = document.getElementById('rosterWeekStart');
    return weekStartInput ? weekStartInput.value : formatDateForInput(new Date());
}

function goToCurrentWeek() {
    const today = new Date();
    const monday = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + diff);
    
    document.getElementById('rosterWeekStart').value = formatDateForInput(monday);
}

async function onWeekChange() {
    await loadRosterDataForWeek();
    renderRosterTable();
}

function getDefaultRosterData() {
    return [
        // Frontend - ASOM (3 rows)
        { time: '07:00 - 16:00 (AEST) / 02:30 - 10:30 (IST)', app: 'Frontend', team: 'ASOM', days: { mon: 'Yash', tue: 'Anurag', wed: 'Anurag', thu: 'Anurag', fri: 'Jerome', sat: 'Yash', sun: 'Yash' }},
        { time: '16:00 - 02:30 (AEST) / 10:30 - 21:00 (IST)', app: 'Frontend', team: 'ASOM', days: { mon: 'Yash', tue: 'Yash', wed: 'Yash', thu: 'Yash', fri: 'Yash', sat: 'Yash', sun: 'Yash' }},
        { time: '02:30 - 07:00 (AEST) / 21:00 - 02:30 (IST)', app: 'Frontend', team: 'ASOM', days: { mon: 'Yash', tue: 'Yash', wed: 'Yash', thu: 'Yash', fri: 'Yash', sat: 'Yash', sun: 'Yash' }},
        // Frontend - OMS (3 rows)
        { time: '07:00 - 16:00 (AEST) / 02:30 - 10:30 (IST)', app: 'Frontend', team: 'OMS', days: { mon: 'Bhomesh', tue: 'Anurag', wed: 'Anurag', thu: 'Anurag', fri: 'Anurag', sat: 'Bhomesh', sun: 'Bhomesh' }},
        { time: '16:00 - 02:30 (AEST) / 10:30 - 21:00 (IST)', app: 'Frontend', team: 'OMS', days: { mon: 'Bhomesh', tue: 'Bhomesh', wed: 'Bhomesh', thu: 'Bhomesh', fri: 'Bhomesh', sat: 'Bhomesh', sun: 'Bhomesh' }},
        { time: '02:30 - 07:00 (AEST) /21:00 - 02:30 (IST)', app: 'Frontend', team: 'OMS', days: { mon: 'Bhomesh', tue: 'Bhomesh', wed: 'Bhomesh', thu: 'Bhomesh', fri: 'Bhomesh', sat: 'Bhomesh', sun: 'Bhomesh' }},
        // Frontend - CRM/SDP/MCO/WSF (3 rows)
        { time: '07:00 - 16:00 (AEST) / 02:30 - 10:30 (IST)', app: 'Frontend', team: 'CRM/SDP/MCO/WSF', days: { mon: 'Anubhav', tue: 'Anubhav', wed: 'Anubhav', thu: 'Anubhav', fri: 'Anubhav', sat: 'Anudhav', sun: 'Anudhav' }},
        { time: '16:00 - 02:30 (AEST) / 10:30 - 21:00 (IST)', app: 'Frontend', team: 'CRM/SDP/MCO/WSF', days: { mon: 'Anudhav', tue: 'Anudhav', wed: 'Anudhav', thu: 'Anudhav', fri: 'Anudhav', sat: 'Anudhav', sun: 'Anudhav' }},
        { time: '02:30 - 07:00 (AEST) / 21:00 - 02:30 (IST)', app: 'Frontend', team: 'CRM/SDP/MCO/WSF', days: { mon: 'Anudhav', tue: 'Anudhav', wed: 'Anudhav', thu: 'Anudhav', fri: 'Anudhav', sat: 'Anudhav', sun: 'Anudhav' }},
        // Digital (2 rows)
        { time: '7AM to 7PM AEST', app: 'Digital', team: 'Digital', days: { mon: 'Ankur', tue: 'Ankur', wed: 'Ankur', thu: 'Ankur', fri: 'Bien', sat: 'Bien', sun: 'Bien' }},
        { time: '7PM to 7AM AEST', app: 'Digital', team: 'Digital', days: { mon: 'Ankur', tue: 'Ankur', wed: 'Ankur', thu: 'Ankur', fri: 'Bien', sat: 'Bien', sun: 'Bien' }},
        // Infra (1 row)
        { time: 'All Shifts', app: 'Infra', team: 'Infra', days: { mon: 'Rahul More', tue: 'Rahul More', wed: 'Rahul More', thu: 'Rahul More', fri: 'Rahul More', sat: 'Rahul More', sun: 'Rahul More' }},
        // Backend - INV/AMDD (2 rows)
        { time: '7AM to 7PM AEST', app: 'Backend', team: 'INV/AMDD', days: { mon: 'Akash', tue: 'Akash', wed: 'Akash', thu: 'Akash', fri: 'Sanket', sat: 'Sanket', sun: 'Sanket' }},
        { time: '7PM to 7AM AEST', app: 'Backend', team: 'INV/AMDD', days: { mon: 'Akash', tue: 'Akash', wed: 'Deb', thu: 'Deb', fri: 'Deb', sat: 'Deb', sun: 'Deb' }},
        // Backend - CM/AR/CL (2 rows)
        { time: '7AM to 7PM AEST', app: 'Backend', team: 'CM/AR/CL', days: { mon: 'Tanvi', tue: 'Tanvi', wed: 'Tanvi', thu: 'Tanvi', fri: 'Kartik', sat: 'Kartik', sun: 'Kartik' }},
        { time: '7PM to 7AM AEST', app: 'Backend', team: 'CM/AR/CL', days: { mon: 'Tanvi', tue: 'Tanvi', wed: 'Tanvi', thu: 'Tanvi', fri: 'Kartik', sat: 'Kartik', sun: 'Kartik' }},
        // Backend - TC/AEM/OFCA (2 rows)
        { time: '7AM to 7PM AEST', app: 'Backend', team: 'TC/AEM/OFCA', days: { mon: 'Hendry', tue: 'Hendry', wed: 'Vishala', thu: 'Vishala', fri: 'Mariel', sat: 'Mariel', sun: 'Mariel' }},
        { time: '7PM to 7AM AEST', app: 'Backend', team: 'TC/AEM/OFCA', days: { mon: 'Hendry', tue: 'Hendry', wed: 'Vishala', thu: 'Vishala', fri: 'Mariel', sat: 'Mariel', sun: 'Mariel' }},
        // Backend - ANM (1 row)
        { time: 'All Shifts', app: 'Backend', team: 'ANM', days: { mon: 'Orit', tue: 'Orit', wed: 'Orit', thu: 'Orit', fri: 'Orit', sat: 'Orit', sun: 'Orit' }},
        // ODS (3 rows)
        { time: '6AM to 6PM AEST', app: 'ODS', team: 'ODS', days: { mon: 'Suraj', tue: 'Suraj', wed: 'Suraj', thu: 'Rohan', fri: 'Abhishek', sat: 'Abhishek', sun: 'Abhishek' }},
        { time: '6PM to 6AM AEST', app: 'ODS', team: 'ODS', days: { mon: 'Suraj', tue: 'Suraj', wed: 'Suraj', thu: 'Rohan', fri: 'Abhishek', sat: 'Abhishek', sun: 'Abhishek' }},
        { time: 'All Shifts', app: 'ODS', team: 'ODS Infra', days: { mon: 'Rahul More', tue: 'Rahul More', wed: 'Rahul More', thu: 'Rahul More', fri: 'Rahul More', sat: 'Rahul More', sun: 'Rahul More' }},
        // B2B (3 rows - empty)
        { time: '07:00 - 19:00 (AEST) / 02:30 - 13:30 (IST)', app: 'B2B', team: 'CPQ/COM/LCEP', days: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }},
        { time: '19:00 - 07:30 (AEST) / 13:30 - 02:30 (IST)', app: 'B2B', team: 'CPQ/COM', days: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }},
        { time: '19:00 - 07:30 (AEST) / 13:30 - 02:30 (IST)', app: 'B2B', team: 'CPQ/COM', days: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }}
    ];
}

function saveRosterData() {
    const weekStart = getCurrentWeekStart();
    const storageKey = `${ROSTER_STORAGE_KEY}_${weekStart}`;
    localStorage.setItem(storageKey, JSON.stringify(rosterData));
}

function renderRosterTable() {
    const thead = document.getElementById('rosterTableHead');
    const tbody = document.getElementById('rosterTableBody');
    if (!thead || !tbody || !rosterData) return;
    
    const weekStart = document.getElementById('rosterWeekStart').value;
    const startDate = weekStart ? new Date(weekStart) : new Date();
    
    // Generate header with dates
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dates.push(d);
    }
    
    let headerHtml = '<tr>';
    headerHtml += '<th class="time-header">Time</th>';
    headerHtml += '<th class="app-header">Application</th>';
    headerHtml += '<th class="roster-team-col">Team</th>';
    dates.forEach((d, i) => {
        const dayName = days[i];
        const dateStr = `${d.getDate()}-${d.toLocaleString('default', { month: 'short' })}`;
        const isWeekend = i >= 5;
        headerHtml += `<th class="day-header ${isWeekend ? 'weekend' : ''}">${dateStr}<br>${dayName}</th>`;
    });
    headerHtml += '<th class="actions-col">Actions</th>';
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;
    
    // Generate body
    let bodyHtml = '';
    rosterData.forEach((row, idx) => {
        const appClass = getAppClass(row.app);
        const teamClass = getTeamClass(row.team);
        
        bodyHtml += `<tr data-index="${idx}" draggable="true" ondragstart="handleRosterDragStart(event)" ondragend="handleRosterDragEnd(event)" ondragover="handleRosterDragOver(event)" ondrop="handleRosterDrop(event)" ondragleave="handleRosterDragLeave(event)">`;
        bodyHtml += `<td class="time-cell"><span class="drag-handle">☰</span> ${escapeHtml(row.time)}</td>`;
        bodyHtml += `<td class="app-cell ${appClass}">${escapeHtml(row.app)}</td>`;
        bodyHtml += `<td class="team-cell ${teamClass}">${escapeHtml(row.team)}</td>`;
        
        const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        dayKeys.forEach((key, i) => {
            const isWeekend = i >= 5;
            bodyHtml += `<td class="day-cell ${isWeekend ? 'weekend' : ''}">${escapeHtml(row.days[key] || '')}</td>`;
        });
        
        bodyHtml += `<td class="actions-col">
            <button class="action-btn edit-btn" onclick="editRosterEntry(${idx})" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteRosterEntry(${idx})" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </td>`;
        bodyHtml += '</tr>';
    });
    
    tbody.innerHTML = bodyHtml;
    
    if (rosterEditMode) {
        document.querySelector('.roster-card').classList.add('roster-edit-mode');
    }
}

function getAppClass(app) {
    const map = {
        'Frontend': 'app-frontend',
        'Backend': 'app-backend',
        'Digital': 'app-digital',
        'Infra': 'app-infra',
        'B2B': 'app-b2b',
        'ODS': 'app-ods'
    };
    return map[app] || 'app-frontend';
}

function getTeamClass(team) {
    const t = (team || '').toLowerCase();
    if (t.includes('asom')) return 'team-asom';
    if (t.includes('oms')) return 'team-oms';
    if (t.includes('crm') || t.includes('sdp') || t.includes('mco')) return 'team-crm';
    if (t.includes('digital')) return 'team-digital';
    if (t.includes('inv') || t.includes('amdd')) return 'team-inv';
    if (t.includes('cm') || t.includes('ar')) return 'team-cm';
    if (t.includes('tc') || t.includes('aem') || t.includes('ofca')) return 'team-tc';
    if (t.includes('anm')) return 'team-anm';
    if (t.includes('infra')) return 'team-infra';
    if (t.includes('ods')) return 'team-ods';
    if (t.includes('b2b') || t.includes('cpq') || t.includes('com') || t.includes('lcep')) return 'team-b2b';
    if (t.includes('mod')) return 'team-default';
    return 'team-default';
}

async function changeRosterWeek(days) {
    const input = document.getElementById('rosterWeekStart');
    const current = new Date(input.value);
    current.setDate(current.getDate() + days);
    input.value = formatDateForInput(current);
    
    // Load data for the new week
    await loadRosterDataForWeek();
    renderRosterTable();
}

function toggleRosterEditMode() {
    rosterEditMode = !rosterEditMode;
    const card = document.querySelector('.roster-card');
    const editBtn = document.querySelector('.roster-actions .btn-secondary');
    const addBtn = document.getElementById('addRosterRowBtn');
    const editText = document.getElementById('rosterEditModeText');
    
    if (rosterEditMode) {
        card.classList.add('roster-edit-mode');
        editBtn.classList.add('edit-mode-active');
        editText.textContent = 'Exit Edit Mode';
        addBtn.classList.remove('hidden');
    } else {
        card.classList.remove('roster-edit-mode');
        editBtn.classList.remove('edit-mode-active');
        editText.textContent = 'Edit Mode';
        addBtn.classList.add('hidden');
    }
}

function openRosterModal(index = -1) {
    const modal = document.getElementById('rosterModal');
    const title = document.getElementById('rosterModalTitle');
    const form = document.getElementById('rosterForm');
    const applyAllCheckbox = document.getElementById('applyToAllDays');
    
    form.reset();
    document.getElementById('rosterEditIndex').value = index;
    
    // Reset checkbox and day input states
    if (applyAllCheckbox) {
        applyAllCheckbox.checked = false;
    }
    const dayInputIds = ['rosterTue', 'rosterWed', 'rosterThu', 'rosterFri', 'rosterSat', 'rosterSun'];
    dayInputIds.forEach(id => {
        const input = document.getElementById(id);
        input.disabled = false;
        input.style.backgroundColor = '';
    });
    
    if (index >= 0 && rosterData[index]) {
        const entry = rosterData[index];
        title.textContent = 'Edit Roster Entry';
        document.getElementById('rosterTime').value = entry.time || '';
        document.getElementById('rosterApplication').value = entry.app || '';
        document.getElementById('rosterTeam').value = entry.team || '';
        document.getElementById('rosterMon').value = entry.days?.mon || '';
        document.getElementById('rosterTue').value = entry.days?.tue || '';
        document.getElementById('rosterWed').value = entry.days?.wed || '';
        document.getElementById('rosterThu').value = entry.days?.thu || '';
        document.getElementById('rosterFri').value = entry.days?.fri || '';
        document.getElementById('rosterSat').value = entry.days?.sat || '';
        document.getElementById('rosterSun').value = entry.days?.sun || '';
        
        // Check if all days have the same value - auto-check the checkbox
        const days = entry.days || {};
        const allValues = [days.mon, days.tue, days.wed, days.thu, days.fri, days.sat, days.sun].filter(v => v);
        if (allValues.length > 0 && allValues.every(v => v === allValues[0])) {
            if (applyAllCheckbox) {
                applyAllCheckbox.checked = true;
                toggleApplyToAllDays();
            }
        }
    } else {
        title.textContent = 'Add Roster Entry';
    }
    
    modal.classList.remove('hidden');
}

function closeRosterModal() {
    document.getElementById('rosterModal').classList.add('hidden');
    // Reset the apply to all checkbox
    const applyAllCheckbox = document.getElementById('applyToAllDays');
    if (applyAllCheckbox) {
        applyAllCheckbox.checked = false;
    }
}

function toggleApplyToAllDays() {
    const isChecked = document.getElementById('applyToAllDays').checked;
    const monInput = document.getElementById('rosterMon');
    const dayInputs = ['rosterTue', 'rosterWed', 'rosterThu', 'rosterFri', 'rosterSat', 'rosterSun'];
    
    if (isChecked) {
        const monValue = monInput.value.trim();
        if (monValue) {
            // Apply Monday's value to all other days
            dayInputs.forEach(id => {
                document.getElementById(id).value = monValue;
            });
        }
        // Disable other day inputs when checked
        dayInputs.forEach(id => {
            document.getElementById(id).disabled = true;
            document.getElementById(id).style.backgroundColor = '#e2e8f0';
        });
        // Add event listener to Monday to sync changes
        monInput.addEventListener('input', syncMondayToAllDays);
    } else {
        // Re-enable all day inputs
        dayInputs.forEach(id => {
            document.getElementById(id).disabled = false;
            document.getElementById(id).style.backgroundColor = '';
        });
        // Remove the sync event listener
        monInput.removeEventListener('input', syncMondayToAllDays);
    }
}

function syncMondayToAllDays() {
    const monValue = document.getElementById('rosterMon').value;
    const dayInputs = ['rosterTue', 'rosterWed', 'rosterThu', 'rosterFri', 'rosterSat', 'rosterSun'];
    dayInputs.forEach(id => {
        document.getElementById(id).value = monValue;
    });
}

function clearAllDays() {
    const dayInputs = ['rosterMon', 'rosterTue', 'rosterWed', 'rosterThu', 'rosterFri', 'rosterSat', 'rosterSun'];
    dayInputs.forEach(id => {
        const input = document.getElementById(id);
        input.value = '';
        input.disabled = false;
        input.style.backgroundColor = '';
    });
    
    // Uncheck the "Same person for all days" checkbox
    const applyAllCheckbox = document.getElementById('applyToAllDays');
    if (applyAllCheckbox) {
        applyAllCheckbox.checked = false;
    }
}

// Autocomplete functions for roster name inputs
function getAllContactNames() {
    const names = new Set();
    if (contactsData) {
        for (const [team, contacts] of Object.entries(contactsData)) {
            for (const contact of contacts) {
                if (contact.name) {
                    names.add(contact.name.trim());
                }
            }
        }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function showNameSuggestions(input) {
    const value = input.value.trim().toLowerCase();
    const suggestionsId = input.id + '-suggestions';
    const suggestionsDiv = document.getElementById(suggestionsId);
    
    if (!suggestionsDiv) return;
    
    if (value.length === 0) {
        suggestionsDiv.classList.remove('show');
        suggestionsDiv.innerHTML = '';
        return;
    }
    
    const allNames = getAllContactNames();
    const matches = allNames.filter(name => 
        name.toLowerCase().includes(value)
    ).slice(0, 8); // Limit to 8 suggestions
    
    if (matches.length === 0) {
        suggestionsDiv.innerHTML = '<div class="autocomplete-no-match">No matching contacts</div>';
        suggestionsDiv.classList.add('show');
        return;
    }
    
    suggestionsDiv.innerHTML = matches.map(name => {
        // Highlight matching text
        const lowerName = name.toLowerCase();
        const matchIndex = lowerName.indexOf(value);
        const before = name.substring(0, matchIndex);
        const match = name.substring(matchIndex, matchIndex + value.length);
        const after = name.substring(matchIndex + value.length);
        return `<div class="autocomplete-item" onmousedown="selectSuggestion('${input.id}', '${name.replace(/'/g, "\\'")}')">${before}<span class="match">${match}</span>${after}</div>`;
    }).join('');
    
    suggestionsDiv.classList.add('show');
}

function selectSuggestion(inputId, name) {
    const input = document.getElementById(inputId);
    input.value = name;
    
    const suggestionsDiv = document.getElementById(inputId + '-suggestions');
    if (suggestionsDiv) {
        suggestionsDiv.classList.remove('show');
        suggestionsDiv.innerHTML = '';
    }
    
    // If "Same person for all days" is checked, sync to all days
    const applyAllCheckbox = document.getElementById('applyToAllDays');
    if (applyAllCheckbox && applyAllCheckbox.checked && inputId === 'rosterMon') {
        syncMondayToAllDays();
    }
    
    input.focus();
}

function hideSuggestionsDelayed(input) {
    // Delay to allow click on suggestion
    setTimeout(() => {
        const suggestionsDiv = document.getElementById(input.id + '-suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.classList.remove('show');
        }
    }, 200);
}

function handleSuggestionKeydown(event, input) {
    const suggestionsDiv = document.getElementById(input.id + '-suggestions');
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('show')) {
        return;
    }
    
    const items = suggestionsDiv.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    
    let highlightedIndex = -1;
    items.forEach((item, index) => {
        if (item.classList.contains('highlighted')) {
            highlightedIndex = index;
        }
    });
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            // Move to next item
            if (highlightedIndex >= 0) {
                items[highlightedIndex].classList.remove('highlighted');
            }
            highlightedIndex = (highlightedIndex + 1) % items.length;
            items[highlightedIndex].classList.add('highlighted');
            items[highlightedIndex].scrollIntoView({ block: 'nearest' });
            break;
            
        case 'ArrowUp':
            event.preventDefault();
            // Move to previous item
            if (highlightedIndex >= 0) {
                items[highlightedIndex].classList.remove('highlighted');
            }
            highlightedIndex = highlightedIndex <= 0 ? items.length - 1 : highlightedIndex - 1;
            items[highlightedIndex].classList.add('highlighted');
            items[highlightedIndex].scrollIntoView({ block: 'nearest' });
            break;
            
        case 'Enter':
            event.preventDefault();
            // Select highlighted item
            if (highlightedIndex >= 0) {
                const selectedItem = items[highlightedIndex];
                const name = selectedItem.textContent;
                selectSuggestion(input.id, name);
            }
            break;
            
        case 'Escape':
            // Close suggestions
            suggestionsDiv.classList.remove('show');
            break;
    }
}

function submitRosterForm() {
    const form = document.getElementById('rosterForm');
    // Validate required fields
    const time = document.getElementById('rosterTime').value.trim();
    const app = document.getElementById('rosterApplication').value;
    const team = document.getElementById('rosterTeam').value.trim();
    
    if (!time) {
        alert('Please enter Time / Shift');
        document.getElementById('rosterTime').focus();
        return;
    }
    if (!app) {
        alert('Please select an Application');
        document.getElementById('rosterApplication').focus();
        return;
    }
    if (!team) {
        alert('Please enter Team');
        document.getElementById('rosterTeam').focus();
        return;
    }
    
    // Call the save function
    saveRosterEntry();
}

async function saveRosterEntry(event) {
    if (event) event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('rosterEditIndex').value);
    const weekStart = getCurrentWeekStart();
    
    const entry = {
        time: document.getElementById('rosterTime').value.trim(),
        app: document.getElementById('rosterApplication').value,
        team: document.getElementById('rosterTeam').value.trim(),
        days: {
            mon: document.getElementById('rosterMon').value.trim(),
            tue: document.getElementById('rosterTue').value.trim(),
            wed: document.getElementById('rosterWed').value.trim(),
            thu: document.getElementById('rosterThu').value.trim(),
            fri: document.getElementById('rosterFri').value.trim(),
            sat: document.getElementById('rosterSat').value.trim(),
            sun: document.getElementById('rosterSun').value.trim()
        }
    };
    
    if (useDatabase) {
        if (editIndex >= 0 && rosterData[editIndex]) {
            const id = rosterData[editIndex]._id;
            await db.updateRosterEntry(id, entry);
            showToast('Roster entry updated');
        } else {
            await db.saveRosterEntry(entry, rosterData.length, weekStart);
            showToast('Roster entry added');
        }
        rosterData = await db.getRoster(weekStart);
    } else {
        if (editIndex >= 0) {
            rosterData[editIndex] = entry;
            showToast('Roster entry updated');
        } else {
            rosterData.push(entry);
            showToast('Roster entry added');
        }
        saveRosterData();
    }
    
    renderRosterTable();
    closeRosterModal();
}

function editRosterEntry(index) {
    openRosterModal(index);
}

async function deleteRosterEntry(index) {
    if (!confirm('Are you sure you want to delete this roster entry?')) return;
    
    const weekStart = getCurrentWeekStart();
    
    if (useDatabase) {
        const id = rosterData[index]._id;
        await db.deleteRosterEntry(id);
        rosterData = await db.getRoster(weekStart);
    } else {
        rosterData.splice(index, 1);
        saveRosterData();
    }
    
    renderRosterTable();
    showToast('Roster entry deleted');
}

function exportRosterExcel() {
    if (!rosterData || rosterData.length === 0) {
        showToast('No roster data to export', 'error');
        return;
    }
    
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh and try again.', 'error');
        return;
    }
    
    // Get the selected week start date
    const weekStartInput = document.getElementById('rosterWeekStart');
    const weekStart = weekStartInput ? new Date(weekStartInput.value) : new Date();
    
    // Calculate dates for each day of the week
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateStr = `${d.getDate()}-${d.toLocaleString('default', { month: 'short' })}`;
        dates.push(`${dayNames[i]} (${dateStr})`);
    }
    
    // Prepare data for Excel with dates in headers
    const exportData = rosterData.map(r => {
        const row = {
            'Time / Shift': r.time,
            'Application': r.app,
            'Team': r.team
        };
        row[dates[0]] = r.days?.mon || '';
        row[dates[1]] = r.days?.tue || '';
        row[dates[2]] = r.days?.wed || '';
        row[dates[3]] = r.days?.thu || '';
        row[dates[4]] = r.days?.fri || '';
        row[dates[5]] = r.days?.sat || '';
        row[dates[6]] = r.days?.sun || '';
        return row;
    });
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 35 },  // Time / Shift
        { wch: 12 },  // Application
        { wch: 18 },  // Team
        { wch: 15 },  // Mon
        { wch: 15 },  // Tue
        { wch: 15 },  // Wed
        { wch: 15 },  // Thu
        { wch: 15 },  // Fri
        { wch: 15 },  // Sat
        { wch: 15 }   // Sun
    ];
    
    // Format week range for filename and sheet name
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekRange = `${formatDateForInput(weekStart)}_to_${formatDateForInput(weekEnd)}`;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'On-Call Roster');
    
    // Generate filename with week range
    const filename = `OnCall_Roster_${weekRange}.xlsx`;
    
    // Download the file
    XLSX.writeFile(wb, filename);
    showToast('Roster exported to Excel');
}

// Keep old function name for backward compatibility
function exportRosterJSON() {
    exportRosterExcel();
}

// Roster Drag and Drop
let rosterDraggedRow = null;

function handleRosterDragStart(event) {
    if (!rosterEditMode) {
        event.preventDefault();
        return;
    }
    rosterDraggedRow = event.target.closest('tr');
    rosterDraggedRow.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', rosterDraggedRow.dataset.index);
}

function handleRosterDragEnd(event) {
    if (rosterDraggedRow) {
        rosterDraggedRow.classList.remove('dragging');
    }
    document.querySelectorAll('.roster-table tbody tr').forEach(row => {
        row.classList.remove('drag-over', 'drag-over-bottom');
    });
    rosterDraggedRow = null;
}

function handleRosterDragOver(event) {
    if (!rosterEditMode || !rosterDraggedRow) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const targetRow = event.target.closest('tr');
    if (!targetRow || targetRow === rosterDraggedRow) return;
    
    // Remove previous indicators
    document.querySelectorAll('.roster-table tbody tr').forEach(row => {
        row.classList.remove('drag-over', 'drag-over-bottom');
    });
    
    // Determine if dropping above or below
    const rect = targetRow.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    
    if (event.clientY < midpoint) {
        targetRow.classList.add('drag-over');
    } else {
        targetRow.classList.add('drag-over-bottom');
    }
}

function handleRosterDragLeave(event) {
    const targetRow = event.target.closest('tr');
    if (targetRow) {
        targetRow.classList.remove('drag-over', 'drag-over-bottom');
    }
}

async function handleRosterDrop(event) {
    if (!rosterEditMode || !rosterDraggedRow) return;
    event.preventDefault();
    
    const targetRow = event.target.closest('tr');
    if (!targetRow || targetRow === rosterDraggedRow) return;
    
    const fromIndex = parseInt(rosterDraggedRow.dataset.index);
    let toIndex = parseInt(targetRow.dataset.index);
    
    // Determine if dropping above or below
    const rect = targetRow.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const dropBelow = event.clientY >= midpoint;
    
    if (dropBelow && toIndex < rosterData.length - 1) {
        toIndex++;
    }
    
    // Reorder the data
    if (fromIndex !== toIndex) {
        const [movedItem] = rosterData.splice(fromIndex, 1);
        
        // Adjust toIndex if needed after removal
        if (fromIndex < toIndex) {
            toIndex--;
        }
        
        rosterData.splice(toIndex, 0, movedItem);
        
        if (useDatabase) {
            // Update sort order in database
            const orderedIds = rosterData.map(r => r._id);
            await db.updateRosterOrder(orderedIds);
        } else {
            saveRosterData();
        }
        
        renderRosterTable();
        showToast('Row order updated');
    }
    
    // Cleanup
    document.querySelectorAll('.roster-table tbody tr').forEach(row => {
        row.classList.remove('drag-over', 'drag-over-bottom');
    });
}

// ==================== STAFF DIRECTORY ====================
let staffData = [];

async function initializeStaffDirectory() {
    if (useDatabase) {
        const data = await db.getStaffDirectory();
        if (data && data.length > 0) {
            staffData = data;
        }
    }
    // Sync mobile numbers from contacts if available
    await syncMobileFromContacts();
    renderStaffTable();
}

// Sync mobile numbers from Contact Details to Staff Directory
async function syncMobileFromContacts() {
    if (!contactsData || !staffData || staffData.length === 0) return 0;
    
    // Build a map of name -> phone from contacts (case-insensitive)
    const contactPhoneMap = new Map();
    for (const [team, contacts] of Object.entries(contactsData)) {
        for (const contact of contacts) {
            if (contact.name && contact.phone) {
                contactPhoneMap.set(contact.name.toLowerCase().trim(), contact.phone);
            }
        }
    }
    
    // Update staff entries with mobile from contacts if not already set
    let updatedCount = 0;
    for (let i = 0; i < staffData.length; i++) {
        const staff = staffData[i];
        if (!staff.mobile || staff.mobile === '-' || staff.mobile === '') {
            const phone = contactPhoneMap.get(staff.name.toLowerCase().trim());
            if (phone) {
                staff.mobile = phone;
                updatedCount++;
                
                // Update in database if using database
                if (useDatabase && staff._id) {
                    await db.updateStaffEntry(staff._id, {
                        name: staff.name,
                        email: staff.email,
                        mobile: phone,
                        timezone: staff.timezone
                    });
                }
            }
        }
    }
    
    // Save to localStorage if not using database
    if (updatedCount > 0 && !useDatabase) {
        localStorage.setItem('staff_directory', JSON.stringify(staffData));
    }
    
    return updatedCount;
}

// Manual sync with user feedback
async function syncMobileFromContactsManual() {
    const count = await syncMobileFromContacts();
    renderStaffTable();
    
    if (count > 0) {
        showToast(`Synced ${count} mobile number${count > 1 ? 's' : ''} from Contact Details`);
    } else {
        showToast('No new mobile numbers to sync', 'info');
    }
}

function renderStaffTable() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    
    if (!staffData || staffData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#666;">No staff entries yet. Click "Add Staff" to add name-to-email mappings.</td></tr>';
        return;
    }
    
    let html = '';
    staffData.forEach((staff, idx) => {
        const timezone = staff.timezone || 'AEST';
        const tzBadgeClass = timezone === 'IST' ? 'tz-ist' : 'tz-aest';
        const mobile = staff.mobile || '-';
        html += `
            <tr>
                <td>${escapeHtml(staff.name)}</td>
                <td><a href="mailto:${escapeHtml(staff.email)}">${escapeHtml(staff.email)}</a></td>
                <td>${escapeHtml(mobile)}</td>
                <td><span class="tz-badge ${tzBadgeClass}">${timezone}</span></td>
                <td class="actions-col">
                    <button class="action-btn edit-btn" onclick="editStaffEntry(${idx})" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteStaffEntry(${idx})" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function openStaffModal(index = -1) {
    const modal = document.getElementById('staffModal');
    const title = document.getElementById('staffModalTitle');
    const form = document.getElementById('staffForm');
    
    form.reset();
    document.getElementById('staffEditIndex').value = index;
    
    if (index >= 0 && staffData[index]) {
        const staff = staffData[index];
        title.textContent = 'Edit Staff Entry';
        document.getElementById('staffName').value = staff.name || '';
        document.getElementById('staffEmail').value = staff.email || '';
        document.getElementById('staffMobile').value = staff.mobile || '';
        // Set timezone radio button
        const tz = staff.timezone || 'AEST';
        const tzRadio = document.querySelector(`input[name="staffTimezone"][value="${tz}"]`);
        if (tzRadio) tzRadio.checked = true;
    } else {
        title.textContent = 'Add Staff Entry';
        // Default to AEST
        document.getElementById('staffTimezoneAEST').checked = true;
    }
    
    modal.classList.remove('hidden');
}

function closeStaffModal() {
    document.getElementById('staffModal').classList.add('hidden');
}

async function saveStaffEntry(event) {
    event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('staffEditIndex').value);
    const selectedTimezone = document.querySelector('input[name="staffTimezone"]:checked');
    const entry = {
        name: document.getElementById('staffName').value.trim(),
        email: document.getElementById('staffEmail').value.trim(),
        mobile: document.getElementById('staffMobile').value.trim(),
        timezone: selectedTimezone ? selectedTimezone.value : 'AEST'
    };
    
    if (useDatabase) {
        if (editIndex >= 0 && staffData[editIndex]) {
            const id = staffData[editIndex]._id;
            await db.updateStaffEntry(id, entry);
            showToast('Staff entry updated');
        } else {
            await db.saveStaffEntry(entry);
            showToast('Staff entry added');
        }
        staffData = await db.getStaffDirectory();
    } else {
        if (editIndex >= 0) {
            staffData[editIndex] = entry;
            showToast('Staff entry updated');
        } else {
            staffData.push(entry);
            showToast('Staff entry added');
        }
        localStorage.setItem('staff_directory', JSON.stringify(staffData));
    }
    
    renderStaffTable();
    closeStaffModal();
}

function editStaffEntry(index) {
    openStaffModal(index);
}

async function deleteStaffEntry(index) {
    if (!confirm('Are you sure you want to delete this staff entry?')) return;
    
    if (useDatabase) {
        const id = staffData[index]._id;
        await db.deleteStaffEntry(id);
        staffData = await db.getStaffDirectory();
    } else {
        staffData.splice(index, 1);
        localStorage.setItem('staff_directory', JSON.stringify(staffData));
    }
    
    renderStaffTable();
    showToast('Staff entry deleted');
}

function exportStaffExcel() {
    if (!staffData || staffData.length === 0) {
        showToast('No staff data to export', 'error');
        return;
    }
    
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh and try again.', 'error');
        return;
    }
    
    // Prepare data for Excel
    const exportData = staffData.map(s => ({
        'Name': s.name,
        'Email': s.email,
        'Timezone': s.timezone || 'AEST'
    }));
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 25 },  // Name
        { wch: 35 },  // Email
        { wch: 10 }   // Timezone
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Staff Directory');
    
    // Generate filename with date
    const filename = `Staff_Directory_${formatDateForInput(new Date())}.xlsx`;
    
    // Download the file
    XLSX.writeFile(wb, filename);
    showToast('Staff directory exported to Excel');
}

// Keep old function name for backward compatibility
function exportStaffJSON() {
    exportStaffExcel();
}

function importStaffCSV() {
    document.getElementById('staffCSVInput').click();
}

// Import from Contacts Modal
function getTimezoneFromSite(site) {
    if (!site) return 'AEST';
    const siteLower = site.toLowerCase();
    if (siteLower.includes('india')) {
        return 'IST';
    }
    // Philippines, Australia, or any other site defaults to AEST
    return 'AEST';
}

function openImportFromContactsModal() {
    const modal = document.getElementById('importContactsModal');
    const list = document.getElementById('importContactsList');
    
    // Get all contacts with emails
    const contactsWithEmail = [];
    
    if (contactsData) {
        for (const [team, contacts] of Object.entries(contactsData)) {
            contacts.forEach(contact => {
                if (contact.email && contact.name) {
                    const timezone = getTimezoneFromSite(contact.site);
                    contactsWithEmail.push({
                        name: contact.name,
                        email: contact.email,
                        phone: contact.phone || '',
                        team: team,
                        area: contact.area || '',
                        site: contact.site || '',
                        timezone: timezone
                    });
                }
            });
        }
    }
    
    if (contactsWithEmail.length === 0) {
        list.innerHTML = '<div style="padding:2rem;text-align:center;color:#666;">No contacts with email addresses found.<br>Add contacts with emails in the Contact Details tab first.</div>';
        modal.classList.remove('hidden');
        return;
    }
    
    // Sort by name
    contactsWithEmail.sort((a, b) => a.name.localeCompare(b.name));
    
    // Check which are already in staff directory
    const existingNames = staffData.map(s => s.name.toLowerCase());
    
    let html = '';
    contactsWithEmail.forEach((contact, idx) => {
        const isAlreadyAdded = existingNames.includes(contact.name.toLowerCase());
        const disabledAttr = isAlreadyAdded ? 'disabled' : '';
        const itemClass = isAlreadyAdded ? 'import-contact-item already-added' : 'import-contact-item';
        const tzBadgeClass = contact.timezone === 'IST' ? 'tz-ist' : 'tz-aest';
        
        html += `
            <div class="${itemClass}">
                <label class="checkbox-label">
                    <input type="checkbox" name="importContact" value="${idx}" data-name="${escapeHtml(contact.name)}" data-email="${escapeHtml(contact.email)}" data-phone="${escapeHtml(contact.phone)}" data-site="${escapeHtml(contact.site)}" data-timezone="${contact.timezone}" ${disabledAttr}>
                    <div class="contact-info">
                        <span class="name">${escapeHtml(contact.name)}</span>
                        <span class="email">${escapeHtml(contact.email)}</span>
                        <div class="contact-meta">
                            <span class="team-badge">${escapeHtml(contact.team.toUpperCase())}${contact.area ? ' - ' + escapeHtml(contact.area) : ''}</span>
                            <span class="tz-badge ${tzBadgeClass}">${contact.timezone}</span>
                        </div>
                    </div>
                </label>
            </div>
        `;
    });
    
    list.innerHTML = html;
    document.getElementById('selectAllContacts').checked = false;
    modal.classList.remove('hidden');
}

function closeImportContactsModal() {
    document.getElementById('importContactsModal').classList.add('hidden');
}

function toggleSelectAllContacts() {
    const selectAll = document.getElementById('selectAllContacts').checked;
    const checkboxes = document.querySelectorAll('#importContactsList input[type="checkbox"]:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = selectAll);
}

async function importSelectedContacts() {
    const checkboxes = document.querySelectorAll('#importContactsList input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
        showToast('Please select at least one contact to import', 'error');
        return;
    }
    
    let imported = 0;
    let aestCount = 0;
    let istCount = 0;
    
    for (const cb of checkboxes) {
        const name = cb.dataset.name;
        const email = cb.dataset.email;
        const phone = cb.dataset.phone || '';
        const timezone = cb.dataset.timezone || 'AEST';
        
        if (name && email) {
            const entry = { name, email, mobile: phone, timezone };
            if (useDatabase) {
                await db.saveStaffEntry(entry);
            } else {
                staffData.push(entry);
            }
            imported++;
            if (timezone === 'IST') istCount++;
            else aestCount++;
        }
    }
    
    if (useDatabase) {
        staffData = await db.getStaffDirectory();
    } else {
        localStorage.setItem('staff_directory', JSON.stringify(staffData));
    }
    
    renderStaffTable();
    closeImportContactsModal();
    
    // Show summary
    let summary = `Imported ${imported} staff: `;
    if (aestCount > 0) summary += `${aestCount} AEST`;
    if (aestCount > 0 && istCount > 0) summary += ', ';
    if (istCount > 0) summary += `${istCount} IST`;
    showToast(summary);
}

// ==================== TEAMS NOTIFICATIONS ====================

// Send email notifications via Supabase Edge Function (Microsoft Graph API)
async function sendEmailNotifications() {
    // Check if Edge Function is configured
    if (typeof isEdgeFunctionConfigured !== 'function' || !isEdgeFunctionConfigured()) {
        showNotificationModal({
            error: true,
            message: 'Supabase Edge Function is not configured.',
            instructions: [
                '1. Make sure Supabase URL and Key are set in config.js',
                '2. Deploy the Edge Function to Supabase',
                '3. Set Microsoft Graph API secrets in Supabase'
            ]
        });
        return;
    }
    
    const btn = document.getElementById('sendEmailNotificationBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Sending emails...</span>';
    }
    
    try {
        // Call the Edge Function to send email notifications
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to send email notifications');
        }
        
        // Show results in modal
        showNotificationResults(data.results || []);
        
        // Also show a toast with summary
        const summary = data.summary;
        if (summary) {
            showToast(`Emails sent: ${summary.sent}/${summary.total} successful`, 'success');
        }
        
    } catch (error) {
        showNotificationModal({
            error: true,
            message: error.message || 'Failed to send email notifications',
            instructions: [
                'Check that the Edge Function is deployed',
                'Verify Microsoft Graph API secrets are set in Supabase',
                'Check browser console for more details'
            ]
        });
        console.error('Email notification error:', error);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send Email Notifications
            `;
        }
    }
}

// ==================== EMAIL NOTIFICATIONS (Supabase Edge Function + Microsoft Graph API) ====================

// Send notifications via Supabase Edge Function (legacy function - use sendEmailNotifications instead)
async function sendTodaysNotifications() {
    // Check if Edge Function is configured
    if (typeof isEdgeFunctionConfigured !== 'function' || !isEdgeFunctionConfigured()) {
        showNotificationModal({
            error: true,
            message: 'Supabase is not configured properly.',
            instructions: [
                '1. Make sure Supabase URL and Key are set in config.js',
                '2. Deploy the Edge Function to Supabase',
                '3. Set Microsoft Graph API secrets in Supabase'
            ]
        });
        return;
    }
    
    const btn = document.getElementById('sendNotificationsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>Sending notifications...</span>';
    
    try {
        // Call the Edge Function
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to send notifications');
        }
        
        // Show results
        showNotificationResults(data.results || []);
        
    } catch (error) {
        showNotificationModal({
            error: true,
            message: error.message || 'Failed to send notifications',
            instructions: [
                'Check that the Edge Function is deployed',
                'Verify Microsoft Graph API secrets are set in Supabase',
                'Check browser console for more details'
            ]
        });
        console.error('Notification error:', error);
    } finally {
        // Reset button
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
            </svg>
            Send Email Notifications
        `;
    }
}

function showNotificationModal(config) {
    const modal = document.getElementById('notificationStatusModal');
    const content = document.getElementById('notificationStatusContent');
    
    let html = '';
    
    if (config.error) {
        html = `
            <div style="padding: 1rem;">
                <div style="color: #ef4444; font-weight: 500; margin-bottom: 1rem;">
                    ⚠️ ${config.message}
                </div>
                <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; font-size: 0.9rem;">
                    <strong>Setup Instructions:</strong>
                    <ol style="margin: 0.5rem 0 0 1.5rem; padding: 0;">
                        ${config.instructions.map(i => `<li style="margin: 0.5rem 0;">${i}</li>`).join('')}
                    </ol>
                </div>
            </div>
        `;
    }
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

function showNotificationResults(results) {
    const modal = document.getElementById('notificationStatusModal');
    const content = document.getElementById('notificationStatusContent');
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    let html = `
        <div class="notification-summary">
            <div class="summary-stat success">
                <div class="number">${successCount}</div>
                <div class="label">Sent</div>
            </div>
            <div class="summary-stat error">
                <div class="number">${errorCount}</div>
                <div class="label">Failed</div>
            </div>
        </div>
        <div class="notification-results">
    `;
    
    results.forEach(r => {
        const statusClass = r.success ? 'success' : 'error';
        const statusIcon = r.success ? '✓' : '✕';
        const errorMsg = r.error ? `<div style="color:#ef4444;font-size:0.75rem;">${r.error}</div>` : '';
        
        html += `
            <div class="notification-item ${statusClass}">
                <div class="status-icon">${statusIcon}</div>
                <div class="details">
                    <div class="name">${escapeHtml(r.name)}</div>
                    <div class="email">${r.email ? escapeHtml(r.email) : 'No email found'}</div>
                    ${errorMsg}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

function closeNotificationModal() {
    document.getElementById('notificationStatusModal').classList.add('hidden');
}
