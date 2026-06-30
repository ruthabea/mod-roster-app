// Storage keys
const STORAGE_KEYS = {
    mod: { schedule: 'mod_schedule_data', escalation: 'mod_escalation_data' },
    oncall: { schedule: 'oncall_schedule_data', escalation: 'oncall_escalation_data', contacts: 'oncall_contacts_data' },
    l2: { schedule: 'l2_schedule_data' }
};

// Check for acknowledgement redirect parameters
function checkAcknowledgementStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const ackStatus = urlParams.get('ack');
    const personName = urlParams.get('name');
    const errorMsg = urlParams.get('msg');
    
    if (!ackStatus) return;
    
    // Remove URL parameters without refreshing
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Show appropriate modal
    let title, message, icon, iconColor;
    
    switch (ackStatus) {
        case 'success':
            title = 'Acknowledgement Confirmed';
            message = `Thank you${personName ? ', ' + decodeURIComponent(personName) : ''}! Your on-call notification has been successfully acknowledged.`;
            icon = '✓';
            iconColor = '#27ae60';
            break;
        case 'already':
            title = 'Already Acknowledged';
            message = `This on-call notification was already acknowledged${personName ? ' by ' + decodeURIComponent(personName) : ''}.`;
            icon = '✓';
            iconColor = '#3498db';
            break;
        case 'error':
            title = 'Acknowledgement Error';
            const errorMessages = {
                'config': 'Server configuration error.',
                'invalid': 'Invalid acknowledgement link.',
                'notfound': 'Acknowledgement record not found.',
                'update': 'Failed to update acknowledgement status.',
                'exception': 'An unexpected error occurred.'
            };
            message = errorMessages[errorMsg] || 'An error occurred processing your acknowledgement.';
            icon = '✗';
            iconColor = '#e74c3c';
            break;
        default:
            return;
    }
    
    showAcknowledgementModal(title, message, icon, iconColor);
}

function showAcknowledgementModal(title, message, icon, iconColor) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'ack-modal-overlay';
    overlay.innerHTML = `
        <div class="ack-modal">
            <div class="ack-modal-icon" style="color: ${iconColor}">${icon}</div>
            <h2 class="ack-modal-title">${title}</h2>
            <p class="ack-modal-message">${message}</p>
            <button class="btn btn-primary ack-modal-btn" onclick="closeAcknowledgementModal()">Close</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add styles if not already added
    if (!document.getElementById('ack-modal-styles')) {
        const styles = document.createElement('style');
        styles.id = 'ack-modal-styles';
        styles.textContent = `
            .ack-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.3s ease;
            }
            .ack-modal {
                background: white;
                border-radius: 16px;
                padding: 40px;
                max-width: 450px;
                width: 90%;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.3s ease;
            }
            .ack-modal-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            .ack-modal-title {
                font-size: 24px;
                font-weight: 600;
                color: #2c3e50;
                margin-bottom: 16px;
            }
            .ack-modal-message {
                font-size: 16px;
                color: #666;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            .ack-modal-btn {
                padding: 12px 40px;
                font-size: 16px;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAcknowledgementModal();
    });
}

function closeAcknowledgementModal() {
    const overlay = document.querySelector('.ack-modal-overlay');
    if (overlay) overlay.remove();
}

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
    // Check for acknowledgement redirect (from email link)
    checkAcknowledgementStatus();
    
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
function switchMainScreen(screen, clickEvent = null) {
    currentScreen = screen;
    
    document.querySelectorAll('.main-screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-screen-tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(`${screen}Screen`).classList.add('active');
    
    // Handle tab highlighting - either from click event or find by screen name
    if (clickEvent && clickEvent.target) {
        const tab = clickEvent.target.closest('.main-screen-tab');
        if (tab) tab.classList.add('active');
    } else {
        // Find and highlight the correct tab based on screen name
        const screenToTab = {
            'mod': 0,
            'oncall': 1,
            'vacation': 2
        };
        const tabs = document.querySelectorAll('.main-screen-tab');
        const tabIndex = screenToTab[screen];
        if (tabs[tabIndex]) {
            tabs[tabIndex].classList.add('active');
        }
    }
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
function showTab(screen, tabName, clickEvent = null) {
    const screenEl = document.getElementById(`${screen}Screen`);
    if (!screenEl) return;
    
    screenEl.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    screenEl.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    
    const tabElement = document.getElementById(`${screen}-${tabName}Tab`);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Handle nav tab highlighting
    if (clickEvent && clickEvent.target) {
        clickEvent.target.classList.add('active');
    } else {
        // Find the correct nav tab by matching the tabName
        const navTabs = screenEl.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            const onclickAttr = tab.getAttribute('onclick') || '';
            if (onclickAttr.includes(`'${tabName}'`)) {
                tab.classList.add('active');
            }
        });
    }
    
    if (tabName === 'details' || tabName === 'contacts') {
        displayDetails(screen);
    }
    
    // Handle holiday screen tabs
    if (screen === 'holiday') {
        if (tabName === 'summary') {
            loadHolidaySummary();
        } else if (tabName === 'support') {
            loadHolidaySupport();
        }
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
    // Get the person's name for the confirmation message
    const person = modPersonnelData[type]?.[index];
    const personName = person?.name || 'this MOD personnel';
    const typeLabel = type === 'onsite' ? 'Onsite' : 'Offshore';
    
    showConfirmModal(
        `Are you sure you want to delete "${personName}" from the ${typeLabel} MOD list?`,
        'Delete MOD Personnel',
        async () => {
            // On confirm - delete the personnel
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
    );
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
    
    // Check for duplicate date
    const existingEntries = appData.mod.savedSchedule.entries || [];
    
    // Normalize date to YYYY-MM-DD format for comparison
    const normalizeDate = (d) => {
        if (!d) return '';
        // Handle both "2026-06-04" and "2026-06-04T00:00:00.000Z" formats
        return d.split('T')[0];
    };
    
    const normalizedInputDate = normalizeDate(date);
    
    const duplicateIndex = existingEntries.findIndex((entry, idx) => {
        // When editing, exclude the current entry from duplicate check
        if (editIndex >= 0 && idx === editIndex) return false;
        return normalizeDate(entry.date) === normalizedInputDate;
    });
    
    if (duplicateIndex >= 0) {
        const duplicateDate = new Date(date);
        const formattedDate = duplicateDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        showWarningModal(
            `A schedule entry for "${formattedDate}" already exists. Please select a different date.`,
            'Duplicate Date'
        );
        return;
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
    // Get the entry details for the confirmation message
    const entry = appData.mod.savedSchedule?.entries?.[index];
    let dateDisplay = 'this entry';
    if (entry && entry.date) {
        const date = new Date(entry.date);
        dateDisplay = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    showConfirmModal(
        `Are you sure you want to delete the schedule entry for ${dateDisplay}?`,
        'Delete Schedule Entry',
        () => {
            // On confirm - delete the entry
            if (appData.mod.savedSchedule && appData.mod.savedSchedule.entries) {
                appData.mod.savedSchedule.entries.splice(index, 1);
                saveScheduleToStorage('mod', appData.mod.savedSchedule);
                displaySavedSchedule('mod');
                showToast('Schedule entry deleted');
            }
        }
    );
}

// Load all saved data
function loadAllData() {
    ['mod', 'oncall'].forEach(screen => {
        loadSavedSchedule(screen);
        loadEscalationContacts(screen);
    });
    
    // Initialize MOD schedule filter with current month
    initializeModScheduleFilter();
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
        
        // Sync MOD schedule to Supabase for weekly notifications
        if (screen === 'mod' && scheduleData && scheduleData.entries) {
            syncModScheduleToSupabase(scheduleData.entries);
        }
    } catch (e) {
        console.error(`Error saving ${screen} schedule:`, e);
    }
}

// Sync MOD schedule to Supabase
async function syncModScheduleToSupabase(entries) {
    try {
        // Prepare data for upsert
        const scheduleData = entries.map(entry => ({
            date: entry.date,
            onsite_name: entry.primaryName || entry.primaryDisplay?.split('<')[0]?.trim() || null,
            onsite_email: entry.primaryDisplay?.match(/<(.+?)>/)?.[1] || null,
            offshore_name: entry.secondaryName || entry.secondaryDisplay?.split('<')[0]?.trim() || null,
            offshore_email: entry.secondaryDisplay?.match(/<(.+?)>/)?.[1] || null,
            updated_at: new Date().toISOString()
        }));
        
        // Upsert each entry (update if exists, insert if not)
        for (const entry of scheduleData) {
            await fetch(`${SUPABASE_URL}/rest/v1/mod_schedule?on_conflict=date`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(entry)
            });
        }
        
        console.log('MOD schedule synced to Supabase');
        return true;
    } catch (error) {
        console.error('Error syncing MOD schedule to Supabase:', error);
        return false;
    }
}

// Force sync MOD schedule to Supabase (manual trigger)
async function forceModScheduleSync() {
    const data = appData.mod.savedSchedule;
    
    if (!data || !data.entries || data.entries.length === 0) {
        showAlertModal(
            'No MOD schedule data found to sync. Please add schedule entries first.',
            'No Data to Sync',
            notificationIcons.warning
        );
        return;
    }
    
    // Show loading toast
    showToast('Syncing MOD schedule to cloud...', 'info');
    
    try {
        const success = await syncModScheduleToSupabase(data.entries);
        
        if (success) {
            showAlertModal(
                `Successfully synced ${data.entries.length} MOD schedule entries to the cloud. The Weekly On-Call Summary email will now use the correct MOD data.`,
                'Sync Complete',
                notificationIcons.success
            );
        } else {
            showAlertModal(
                'Failed to sync MOD schedule. Please check your internet connection and try again.',
                'Sync Failed',
                notificationIcons.error
            );
        }
    } catch (error) {
        console.error('Force sync error:', error);
        showAlertModal(
            'An error occurred while syncing. Please try again.',
            'Sync Error',
            notificationIcons.error
        );
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

// Current MOD filter state
let modScheduleFilteredEntries = null;

// Filter MOD Schedule by month
function filterModScheduleByMonth() {
    const monthFilter = document.getElementById('modScheduleMonthFilter')?.value;
    const data = appData.mod.savedSchedule;
    
    if (!data || !data.entries || data.entries.length === 0) {
        return;
    }
    
    if (!monthFilter) {
        // No filter selected, show all
        modScheduleFilteredEntries = null;
        displaySavedSchedule('mod');
        return;
    }
    
    const [filterYear, filterMonth] = monthFilter.split('-');
    const filteredEntries = data.entries.filter(entry => {
        const entryDate = new Date(entry.date);
        const entryYear = entryDate.getFullYear().toString();
        const entryMonth = String(entryDate.getMonth() + 1).padStart(2, '0');
        return entryYear === filterYear && entryMonth === filterMonth;
    });
    
    modScheduleFilteredEntries = filteredEntries;
    displayFilteredModSchedule(filteredEntries);
}

// Show current week MOD
function showCurrentWeekMod() {
    const data = appData.mod.savedSchedule;
    
    if (!data || !data.entries || data.entries.length === 0) {
        return;
    }
    
    // Get current week's Monday and Sunday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    const filteredEntries = data.entries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= monday && entryDate <= sunday;
    });
    
    // Clear month filter
    const monthFilter = document.getElementById('modScheduleMonthFilter');
    if (monthFilter) monthFilter.value = '';
    
    modScheduleFilteredEntries = filteredEntries;
    displayFilteredModSchedule(filteredEntries);
}

// Show all MOD entries
function showAllMod() {
    // Clear filters
    const monthFilter = document.getElementById('modScheduleMonthFilter');
    if (monthFilter) monthFilter.value = '';
    
    modScheduleFilteredEntries = null;
    displaySavedSchedule('mod');
}

// Display filtered MOD schedule
function displayFilteredModSchedule(entries) {
    const data = appData.mod.savedSchedule;
    
    if (!entries || entries.length === 0) {
        document.getElementById('modNoScheduleMessage').style.display = 'block';
        document.getElementById('modScheduleTableContainer').classList.add('hidden');
        document.getElementById('modScheduleInfo').textContent = 'No MOD schedule found for the selected period.';
        return;
    }
    
    colorMaps.mod.clear();
    colorIndices.mod = 1;
    
    const startDate = new Date(entries[0].date);
    const endDate = new Date(entries[entries.length - 1].date);
    const dateRange = `${formatDateShort(startDate)} to ${formatDateShort(endDate)}`;
    
    document.getElementById('modScheduleInfo').innerHTML = `<strong>${dateRange}</strong> | Showing ${entries.length} entries`;
    
    // Create temporary data object for rendering
    const tempData = {
        ...data,
        entries: entries
    };
    
    const scheduleHTML = generateScheduleHTMLFromSaved('mod', tempData);
    document.getElementById('modScheduleContent').innerHTML = scheduleHTML;
    
    document.getElementById('modNoScheduleMessage').style.display = 'none';
    document.getElementById('modScheduleTableContainer').classList.remove('hidden');
}

// Initialize MOD schedule filter with current month
function initializeModScheduleFilter() {
    const monthFilter = document.getElementById('modScheduleMonthFilter');
    if (monthFilter) {
        const now = new Date();
        monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
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
        
        // Extract name only (no email in main columns to match table display)
        const primaryName = primaryDisplay.split('<')[0].trim();
        const secondaryName = secondaryDisplay.split('<')[0].trim();
        
        // Format date as "DD-Mon" to match table display
        const day = date.getDate();
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const dateFormatted = `${day}-${month}`;
        
        return {
            'Days': dateFormatted,
            [screen === 'mod' ? 'Onsite MOD (7AM to 7PM AEST)' : 'Primary On-Call']: primaryName,
            [screen === 'mod' ? 'Offshore MOD (7PM to 7AM AEST)' : 'Secondary On-Call']: secondaryName
        };
    });
    
    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    
    // Auto-size columns
    const colWidths = [
        { wch: 10 },  // Days
        { wch: 35 },  // Onsite MOD (7AM to 7PM AEST)
        { wch: 35 }   // Offshore MOD (7PM to 7AM AEST)
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

// Import MOD Schedule from Excel (same format as export)
function importScheduleExcel(event, screen) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh and try again.', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get the first sheet
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            // Convert to JSON with headers
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
            
            if (jsonData.length < 2) {
                showToast('Excel file is empty or has no data rows', 'error');
                return;
            }
            
            // Parse headers
            const headers = jsonData[0];
            console.log('Excel headers:', headers);
            
            // Find column indices
            const daysIdx = headers.findIndex(h => h && h.toLowerCase() === 'days');
            const primaryIdx = headers.findIndex(h => h && (
                h.toLowerCase().includes('onsite') || 
                h.toLowerCase().includes('primary')
            ));
            const secondaryIdx = headers.findIndex(h => h && (
                h.toLowerCase().includes('offshore') || 
                h.toLowerCase().includes('secondary')
            ));
            
            if (daysIdx < 0 || primaryIdx < 0 || secondaryIdx < 0) {
                showToast('Invalid Excel format. Expected columns: Days, Onsite/Primary, Offshore/Secondary', 'error');
                return;
            }
            
            console.log('Column indices:', { daysIdx, primaryIdx, secondaryIdx });
            
            // Parse data rows
            const entries = [];
            const currentYear = new Date().getFullYear();
            
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                
                const dayStr = row[daysIdx]?.toString().trim();
                const primaryName = row[primaryIdx]?.toString().trim() || '';
                const secondaryName = row[secondaryIdx]?.toString().trim() || '';
                
                // Skip empty rows
                if (!dayStr) continue;
                
                // Parse date from "DD-Mon" format (e.g., "1-Jun", "15-Jul")
                const date = parseDayMonthDate(dayStr, currentYear);
                if (!date) {
                    console.warn('Could not parse date:', dayStr);
                    continue;
                }
                
                // Look up personnel to get full info
                const primaryPerson = findModPersonnel(primaryName, 'onsite') || 
                                     findModPersonnel(primaryName, 'offshore');
                const secondaryPerson = findModPersonnel(secondaryName, 'offshore') || 
                                       findModPersonnel(secondaryName, 'onsite');
                
                const entry = {
                    date: formatDateForInput(date),
                    primaryName: primaryName,
                    secondaryName: secondaryName,
                    primaryDisplay: primaryPerson ? 
                        `${primaryPerson.name} <${primaryPerson.email}>` : primaryName,
                    secondaryDisplay: secondaryPerson ? 
                        `${secondaryPerson.name} <${secondaryPerson.email}>` : secondaryName
                };
                
                entries.push(entry);
            }
            
            if (entries.length === 0) {
                showToast('No valid entries found in Excel file', 'error');
                return;
            }
            
            // Sort entries by date
            entries.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Create schedule data
            const scheduleData = {
                entries: entries,
                primaryShiftLabel: screen === 'mod' ? '7am to 7pm AEST' : 'Primary',
                secondaryShiftLabel: screen === 'mod' ? '7pm to 7am AEST' : 'Secondary',
                primaryMods: modPersonnelData.onsite || [],
                secondaryMods: modPersonnelData.offshore || []
            };
            
            // Save and display
            saveScheduleToStorage(screen, scheduleData);
            displaySavedSchedule(screen);
            
            showToast(`Imported ${entries.length} schedule entries from Excel`);
            
        } catch (err) {
            console.error('Error reading Excel file:', err);
            showToast('Error reading Excel file: ' + err.message, 'error');
        }
    };
    
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// Parse "DD-Mon" date format (e.g., "1-Jun", "15-Jul")
function parseDayMonthDate(dateStr, year) {
    if (!dateStr) return null;
    
    const monthMap = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    // Try "DD-Mon" format (e.g., "1-Jun", "15-Jul")
    const match = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (match) {
        const day = parseInt(match[1]);
        const month = monthMap[match[2].toLowerCase()];
        if (month !== undefined && day >= 1 && day <= 31) {
            return new Date(year, month, day);
        }
    }
    
    // Try other common formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    
    return null;
}

// Find MOD personnel by name
function findModPersonnel(name, type) {
    if (!name || !modPersonnelData[type]) return null;
    
    const normalizedName = name.toLowerCase().trim();
    return modPersonnelData[type].find(p => 
        p.name && p.name.toLowerCase().trim() === normalizedName
    );
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

// ==================== NOTIFICATION MODAL ====================

// Modal icons by type
const notificationIcons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>`
};

// Alert modal callback
let alertModalCallback = null;

// Show alert modal (replacement for alert)
function showAlertModal(message, options = {}) {
    const {
        type = 'success',
        title = getDefaultTitle(type),
        showCancel = false,
        okText = 'OK',
        cancelText = 'Cancel',
        onOk = null,
        onCancel = null
    } = options;
    
    const modal = document.getElementById('notificationModal');
    const iconEl = document.getElementById('notificationModalIcon');
    const titleEl = document.getElementById('notificationModalTitle');
    const messageEl = document.getElementById('notificationModalMessage');
    const okBtn = document.getElementById('notificationModalOkBtn');
    const cancelBtn = document.getElementById('notificationModalCancelBtn');
    
    if (!modal) {
        // Fallback to native alert if modal doesn't exist
        alert(message);
        return;
    }
    
    // Set icon and type
    iconEl.innerHTML = notificationIcons[type] || notificationIcons.info;
    iconEl.className = `notification-modal-icon ${type}`;
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    
    // Show/hide cancel button
    if (showCancel) {
        cancelBtn.classList.remove('hidden');
    } else {
        cancelBtn.classList.add('hidden');
    }
    
    // Store callbacks
    alertModalCallback = { onOk, onCancel };
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Focus OK button
    okBtn.focus();
}

// Get default title based on type
function getDefaultTitle(type) {
    switch (type) {
        case 'success': return 'Success';
        case 'error': return 'Error';
        case 'warning': return 'Warning';
        case 'info': return 'Information';
        default: return 'Notification';
    }
}

// Close alert modal
function closeAlertModal(confirmed = true) {
    const modal = document.getElementById('notificationModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    // Execute callback
    if (alertModalCallback) {
        if (confirmed && alertModalCallback.onOk) {
            alertModalCallback.onOk();
        } else if (!confirmed && alertModalCallback.onCancel) {
            alertModalCallback.onCancel();
        }
        alertModalCallback = null;
    }
}

// Helper function for success messages
function showSuccessModal(message, title = 'Success') {
    showAlertModal(message, { type: 'success', title });
}

// Helper function for error messages
function showErrorModal(message, title = 'Error') {
    showAlertModal(message, { type: 'error', title });
}

// Helper function for warning messages
function showWarningModal(message, title = 'Warning') {
    showAlertModal(message, { type: 'warning', title });
}

// Helper function for info messages
function showInfoModal(message, title = 'Information') {
    showAlertModal(message, { type: 'info', title });
}

// Helper function for confirm dialogs
function showConfirmModal(message, title = 'Confirm', onConfirm, onCancel = null) {
    showAlertModal(message, { 
        type: 'warning', 
        title,
        showCancel: true,
        okText: 'Yes, Delete',
        cancelText: 'Cancel',
        onOk: onConfirm,
        onCancel: onCancel
    });
}

// Helper function for approval confirm dialogs
function showApproveModal(message, title = 'Confirm Approval', onConfirm, onCancel = null) {
    showAlertModal(message, { 
        type: 'info', 
        title,
        showCancel: true,
        okText: 'Yes, Approve',
        cancelText: 'Cancel',
        onOk: onConfirm,
        onCancel: onCancel
    });
}

// Approver select modal callback
let approverSelectCallback = null;

// Show approver selection modal (for multiple approvers)
function showApproverSelectModal(message, title, approverNames, onConfirm) {
    const modal = document.getElementById('approverSelectModal');
    
    if (!modal) {
        // Fallback - just use first approver
        if (onConfirm) onConfirm(approverNames[0] || 'Manager');
        return;
    }
    
    const titleEl = document.getElementById('approverSelectTitle');
    const messageEl = document.getElementById('approverSelectMessage');
    const selectEl = document.getElementById('approverSelectDropdown');
    const reasonContainer = document.getElementById('approverReasonContainer');
    const okBtn = document.getElementById('approverSelectOkBtn');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Populate dropdown
    selectEl.innerHTML = '<option value="">-- Select Your Name --</option>';
    approverNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        selectEl.appendChild(option);
    });
    
    // Hide reason input for approval
    reasonContainer.classList.add('hidden');
    
    // Update button text
    okBtn.textContent = 'Approve';
    okBtn.className = 'btn btn-success notification-modal-btn';
    
    // Store callback
    approverSelectCallback = { onConfirm, includeReason: false };
    
    // Show modal
    modal.classList.remove('hidden');
}

// Show approver selection modal with reason input (for rejection)
function showApproverSelectWithReasonModal(message, title, approverNames, onConfirm) {
    const modal = document.getElementById('approverSelectModal');
    
    if (!modal) {
        // Fallback
        if (onConfirm) onConfirm(approverNames[0] || 'Manager', '');
        return;
    }
    
    const titleEl = document.getElementById('approverSelectTitle');
    const messageEl = document.getElementById('approverSelectMessage');
    const selectEl = document.getElementById('approverSelectDropdown');
    const reasonContainer = document.getElementById('approverReasonContainer');
    const reasonInput = document.getElementById('approverReasonInput');
    const okBtn = document.getElementById('approverSelectOkBtn');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Populate dropdown
    selectEl.innerHTML = '<option value="">-- Select Your Name --</option>';
    approverNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        selectEl.appendChild(option);
    });
    
    // Show reason input for rejection
    reasonContainer.classList.remove('hidden');
    reasonInput.value = '';
    
    // Update button text
    okBtn.textContent = 'Reject';
    okBtn.className = 'btn btn-danger notification-modal-btn';
    
    // Store callback
    approverSelectCallback = { onConfirm, includeReason: true };
    
    // Show modal
    modal.classList.remove('hidden');
}

// Close approver select modal
function closeApproverSelectModal(confirmed = false) {
    const modal = document.getElementById('approverSelectModal');
    const selectEl = document.getElementById('approverSelectDropdown');
    const reasonInput = document.getElementById('approverReasonInput');
    
    if (confirmed && approverSelectCallback) {
        const selectedApprover = selectEl.value;
        
        if (!selectedApprover) {
            showWarningModal('Please select your name before proceeding.', 'Selection Required');
            return;
        }
        
        if (approverSelectCallback.includeReason) {
            approverSelectCallback.onConfirm(selectedApprover, reasonInput.value || '');
        } else {
            approverSelectCallback.onConfirm(selectedApprover);
        }
    }
    
    if (modal) {
        modal.classList.add('hidden');
    }
    approverSelectCallback = null;
}

// Prompt modal callback
let promptModalCallback = null;

// Show prompt modal (replacement for prompt)
function showPromptModal(message, title = 'Input Required', placeholder = '', onSubmit = null, onCancel = null) {
    const modal = document.getElementById('promptModal');
    const iconEl = document.getElementById('promptModalIcon');
    const titleEl = document.getElementById('promptModalTitle');
    const messageEl = document.getElementById('promptModalMessage');
    const inputEl = document.getElementById('promptModalInput');
    const okBtn = document.getElementById('promptModalOkBtn');
    
    if (!modal) {
        const result = prompt(message);
        if (result !== null && onSubmit) onSubmit(result);
        else if (result === null && onCancel) onCancel();
        return;
    }
    
    // Set icon
    iconEl.innerHTML = notificationIcons.info;
    iconEl.className = 'notification-modal-icon info';
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    inputEl.value = '';
    inputEl.placeholder = placeholder;
    
    // Store callback
    promptModalCallback = { onSubmit, onCancel };
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Focus input
    setTimeout(() => inputEl.focus(), 100);
    
    // Handle Enter key
    inputEl.onkeydown = function(e) {
        if (e.key === 'Enter') {
            closePromptModal(true);
        } else if (e.key === 'Escape') {
            closePromptModal(false);
        }
    };
}

// Close prompt modal
function closePromptModal(confirmed = true) {
    const modal = document.getElementById('promptModal');
    const inputEl = document.getElementById('promptModalInput');
    
    if (modal) {
        modal.classList.add('hidden');
    }
    
    if (promptModalCallback) {
        if (confirmed && promptModalCallback.onSubmit) {
            promptModalCallback.onSubmit(inputEl.value);
        } else if (!confirmed && promptModalCallback.onCancel) {
            promptModalCallback.onCancel();
        }
        promptModalCallback = null;
    }
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
    // Get contact details for the confirmation message
    const contact = contactsData[teamKey]?.[index];
    const contactName = contact?.name || 'this contact';
    const contactArea = contact?.area || '';
    
    showConfirmModal(
        `Are you sure you want to delete "${contactName}"${contactArea ? ` from ${contactArea}` : ''}?`,
        'Delete Contact',
        async () => {
            // On confirm - delete the contact
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
    );
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
    // Get escalation entry details for the confirmation message
    const entry = escalationMatrixData[index];
    const areaName = entry?.area || 'this entry';
    const onCall = entry?.onCall || '';

    showConfirmModal(
        `Are you sure you want to delete the escalation entry for "${areaName}"${onCall ? ` (On-Call: ${onCall})` : ''}?`,
        'Delete Escalation Entry',
        async () => {
            // On confirm - delete the entry
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
    );
}

// ========================================
// ROSTER TABLE CRUD FUNCTIONS
// ========================================

let rosterData = null;
let rosterEditMode = false;
const ROSTER_STORAGE_KEY = 'oncall_roster_data';

async function initializeRosterData() {
    // Set default month to current month
    goToCurrentMonth();
    
    // Then load data for that month
    await loadRosterDataForMonth();
    
    // Select current week and render
    selectCurrentWeekInMonth();
    renderSelectedWeek();
}

// Month filter functions
function goToCurrentMonth() {
    const today = new Date();
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthInput = document.getElementById('rosterMonthFilter');
    if (monthInput) {
        monthInput.value = monthStr;
    }
}

async function onRosterMonthChange() {
    await loadRosterDataForMonth();
    populateWeekDropdown();
    selectCurrentWeekInMonth();
    renderSelectedWeek();
}

function populateWeekDropdown() {
    const weekSelect = document.getElementById('rosterWeekSelect');
    if (!weekSelect) return;
    
    const weeks = Object.keys(rosterMonthData).sort();
    weekSelect.innerHTML = '';
    
    if (weeks.length === 0) {
        weekSelect.innerHTML = '<option value="">No weeks available</option>';
        return;
    }
    
    weeks.forEach(weekStart => {
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        
        const label = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const option = document.createElement('option');
        option.value = weekStart;
        option.textContent = label;
        weekSelect.appendChild(option);
    });
}

function selectCurrentWeekInMonth() {
    const weekSelect = document.getElementById('rosterWeekSelect');
    if (!weekSelect) return;
    
    const weeks = Object.keys(rosterMonthData).sort();
    if (weeks.length === 0) return;
    
    // Find the week that contains today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let selectedWeek = weeks[0]; // Default to first week
    
    for (const weekStart of weeks) {
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        
        if (today >= startDate && today <= endDate) {
            selectedWeek = weekStart;
            break;
        } else if (startDate > today) {
            break;
        }
        selectedWeek = weekStart;
    }
    
    weekSelect.value = selectedWeek;
}

function onRosterWeekSelect() {
    renderSelectedWeek();
}

function changeRosterWeekInMonth(delta) {
    const weekSelect = document.getElementById('rosterWeekSelect');
    if (!weekSelect) return;
    
    const options = Array.from(weekSelect.options);
    const currentIndex = weekSelect.selectedIndex;
    const newIndex = currentIndex + delta;
    
    if (newIndex >= 0 && newIndex < options.length) {
        weekSelect.selectedIndex = newIndex;
        renderSelectedWeek();
    }
}

function goToCurrentWeekInMonth() {
    selectCurrentWeekInMonth();
    renderSelectedWeek();
}

let rosterMonthData = {}; // Stores roster data grouped by week_start

async function loadRosterDataForMonth() {
    const monthInput = document.getElementById('rosterMonthFilter');
    if (!monthInput || !monthInput.value) return;
    
    const [year, month] = monthInput.value.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    
    const startStr = formatDateForInput(startOfMonth);
    const endStr = formatDateForInput(endOfMonth);
    
    rosterMonthData = {};
    
    if (useDatabase) {
        try {
            // Use REST API query format: gte and lte filters
            const query = `?week_start=gte.${startStr}&week_start=lte.${endStr}&order=week_start,sort_order`;
            const { data, error } = await supabaseRequest('roster', 'GET', null, query);
            
            if (error) {
                console.error('Error loading roster for month:', error);
                return;
            }
            
            // Group by week_start
            if (data && data.length > 0) {
                data.forEach(row => {
                    const weekKey = row.week_start;
                    if (!rosterMonthData[weekKey]) {
                        rosterMonthData[weekKey] = [];
                    }
                    rosterMonthData[weekKey].push({
                        id: row.id,
                        time: row.time_shift,
                        app: row.app,
                        team: row.team,
                        days: {
                            mon: row.mon || '',
                            tue: row.tue || '',
                            wed: row.wed || '',
                            thu: row.thu || '',
                            fri: row.fri || '',
                            sat: row.sat || '',
                            sun: row.sun || ''
                        },
                        sortOrder: row.sort_order
                    });
                });
            }
            
            // Populate the week dropdown
            populateWeekDropdown();
        } catch (err) {
            console.error('Error loading roster for month:', err);
        }
    }
}

async function renderSelectedWeek() {
    const weekSelect = document.getElementById('rosterWeekSelect');
    const tbody = document.getElementById('rosterTableBody');
    const thead = document.getElementById('rosterTableHead');
    
    if (!tbody || !thead) return;
    
    const selectedWeek = weekSelect?.value;
    
    if (!selectedWeek || !rosterMonthData[selectedWeek]) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state-cell">No roster data found for the selected week</td></tr>';
        return;
    }
    
    const weekData = rosterMonthData[selectedWeek];
    const startDate = new Date(selectedWeek);
    
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
    
    // Fetch vacation conflicts for this week
    const vacationConflicts = await fetchVacationConflicts(selectedWeek);
    
    // Generate body
    let bodyHtml = '';
    weekData.forEach((row, idx) => {
        const appClass = getAppClass(row.app);
        const teamClass = getTeamClass(row.team);
        
        bodyHtml += `<tr data-week="${selectedWeek}" data-index="${idx}">`;
        bodyHtml += `<td class="time-cell">${escapeHtml(row.time)}</td>`;
        bodyHtml += `<td class="app-cell ${appClass}">${escapeHtml(row.app)}</td>`;
        bodyHtml += `<td class="team-cell ${teamClass}">${escapeHtml(row.team)}</td>`;
        
        const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        dayKeys.forEach((key, i) => {
            const isWeekend = i >= 5;
            const personName = row.days[key] || '';
            const hasConflict = hasVacationConflict(personName, key, vacationConflicts);
            const conflictClass = hasConflict ? 'vacation-conflict' : '';
            const conflictTooltip = hasConflict ? getVacationTooltip(personName, vacationConflicts) : '';
            const conflictIcon = hasConflict ? '<span class="conflict-icon" title="' + conflictTooltip + '">⚠️</span>' : '';
            
            bodyHtml += `<td class="day-cell ${isWeekend ? 'weekend' : ''} ${conflictClass}" ${conflictTooltip ? 'title="' + conflictTooltip + '"' : ''}>${escapeHtml(personName)}${conflictIcon}</td>`;
        });
        
        bodyHtml += `<td class="actions-col">
            <button class="action-btn edit-btn" onclick="editRosterEntryByWeek('${selectedWeek}', ${idx})" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="action-btn delete-btn" onclick="deleteRosterEntryByWeek('${selectedWeek}', ${idx})" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </td>`;
        bodyHtml += '</tr>';
    });
    
    tbody.innerHTML = bodyHtml;
}

// Legacy function - now just renders selected week
async function renderRosterByMonth() {
    await renderSelectedWeek();
}

function editRosterEntryByWeek(weekStart, idx) {
    const weekData = rosterMonthData[weekStart];
    if (!weekData || !weekData[idx]) return;
    
    // Store context for saving
    currentEditWeek = weekStart;
    currentEditIndex = idx;
    
    const entry = weekData[idx];
    document.getElementById('rosterEditIndex').value = idx;
    document.getElementById('rosterTime').value = entry.time || '';
    document.getElementById('rosterApplication').value = entry.app || '';
    document.getElementById('rosterTeam').value = entry.team || '';
    document.getElementById('rosterMon').value = entry.days.mon || '';
    document.getElementById('rosterTue').value = entry.days.tue || '';
    document.getElementById('rosterWed').value = entry.days.wed || '';
    document.getElementById('rosterThu').value = entry.days.thu || '';
    document.getElementById('rosterFri').value = entry.days.fri || '';
    document.getElementById('rosterSat').value = entry.days.sat || '';
    document.getElementById('rosterSun').value = entry.days.sun || '';
    
    document.getElementById('rosterModalTitle').textContent = 'Edit Roster Entry';
    document.getElementById('rosterModal').classList.remove('hidden');
}

let currentEditWeek = null;
let currentEditIndex = null;

async function deleteRosterEntryByWeek(weekStart, idx) {
    const weekData = rosterMonthData[weekStart];
    if (!weekData || !weekData[idx]) return;
    
    if (!confirm('Are you sure you want to delete this roster entry?')) return;
    
    const entry = weekData[idx];
    
    if (useDatabase && entry.id) {
        try {
            const success = await db.deleteRosterEntry(entry.id);
            
            if (!success) {
                throw new Error('Delete failed');
            }
            
            // Remove from local data
            weekData.splice(idx, 1);
            if (weekData.length === 0) {
                delete rosterMonthData[weekStart];
            }
            
            renderRosterByMonth();
            showToast('Roster entry deleted');
        } catch (err) {
            console.error('Error deleting roster entry:', err);
            alert('Failed to delete roster entry');
        }
    }
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
    // Try new month filter first, fall back to old week selector
    const monthInput = document.getElementById('rosterMonthFilter');
    const weekStartInput = document.getElementById('rosterWeekStart');
    
    if (monthInput && monthInput.value) {
        // Get the first Monday of the selected month
        const [year, month] = monthInput.value.split('-').map(Number);
        const firstOfMonth = new Date(year, month - 1, 1);
        const dayOfWeek = firstOfMonth.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(firstOfMonth);
        monday.setDate(firstOfMonth.getDate() + diff);
        return formatDateForInput(monday);
    }
    
    return weekStartInput ? weekStartInput.value : formatDateForInput(new Date());
}

function goToCurrentWeek() {
    const today = new Date();
    const monday = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + diff);
    
    const weekStartInput = document.getElementById('rosterWeekStart');
    if (weekStartInput) {
        weekStartInput.value = formatDateForInput(monday);
    }
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

// Vacation conflict cache for current week
let vacationConflictCache = {};
let vacationConflictCacheWeek = null;

// Fetch approved vacations for a given week
async function fetchVacationConflicts(weekStartStr) {
    if (vacationConflictCacheWeek === weekStartStr && Object.keys(vacationConflictCache).length > 0) {
        return vacationConflictCache;
    }
    
    try {
        const weekStart = new Date(weekStartStr);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];
        
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/vacation_requests?select=employee_name,start_date,end_date&status=eq.approved&start_date=lte.${endStr}&end_date=gte.${startStr}`,
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            console.error('Failed to fetch vacation conflicts');
            return {};
        }
        
        const vacations = await response.json();
        
        // Build conflict map: { "personname_lowercase": { dates: [date1, date2, ...] } }
        const conflicts = {};
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        
        vacations.forEach(v => {
            const personKey = v.employee_name.toLowerCase().trim();
            const vacStart = new Date(v.start_date);
            const vacEnd = new Date(v.end_date);
            
            if (!conflicts[personKey]) {
                conflicts[personKey] = { days: [], startDate: v.start_date, endDate: v.end_date };
            }
            
            // Check which days of this week overlap with the vacation
            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(dayDate.getDate() + i);
                
                if (dayDate >= vacStart && dayDate <= vacEnd) {
                    if (!conflicts[personKey].days.includes(days[i])) {
                        conflicts[personKey].days.push(days[i]);
                    }
                }
            }
        });
        
        vacationConflictCache = conflicts;
        vacationConflictCacheWeek = weekStartStr;
        
        return conflicts;
    } catch (error) {
        console.error('Error fetching vacation conflicts:', error);
        return {};
    }
}

// Check if a person has vacation conflict for a specific day
function hasVacationConflict(personName, dayKey, conflicts) {
    if (!personName || !conflicts) return false;
    const personKey = personName.toLowerCase().trim();
    return conflicts[personKey] && conflicts[personKey].days.includes(dayKey);
}

// Get vacation tooltip for a person
function getVacationTooltip(personName, conflicts) {
    if (!personName || !conflicts) return '';
    const personKey = personName.toLowerCase().trim();
    const conflict = conflicts[personKey];
    if (!conflict) return '';
    
    const startDate = new Date(conflict.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDate = new Date(conflict.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `On approved leave: ${startDate} - ${endDate}`;
}

async function renderRosterTable() {
    const thead = document.getElementById('rosterTableHead');
    const tbody = document.getElementById('rosterTableBody');
    if (!thead || !tbody || !rosterData) return;
    
    const weekStart = getCurrentWeekStart();
    const startDate = weekStart ? new Date(weekStart) : new Date();
    
    // Fetch vacation conflicts for this week
    const vacationConflicts = await fetchVacationConflicts(weekStart);
    
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
            const personName = row.days[key] || '';
            const hasConflict = hasVacationConflict(personName, key, vacationConflicts);
            const conflictClass = hasConflict ? 'vacation-conflict' : '';
            const conflictTooltip = hasConflict ? getVacationTooltip(personName, vacationConflicts) : '';
            const conflictIcon = hasConflict ? '<span class="conflict-icon" title="' + conflictTooltip + '">⚠️</span>' : '';
            
            bodyHtml += `<td class="day-cell ${isWeekend ? 'weekend' : ''} ${conflictClass}" ${conflictTooltip ? 'title="' + conflictTooltip + '"' : ''}>${escapeHtml(personName)}${conflictIcon}</td>`;
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
    if (!input) return;
    
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
    
    // Use currentEditWeek if set (from month view), otherwise use getCurrentWeekStart
    const weekStart = currentEditWeek || getCurrentWeekStart();
    
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
    
    // Check for vacation conflicts before saving
    const conflicts = await checkRosterVacationConflicts(entry, weekStart);
    if (conflicts.length > 0) {
        const conflictList = conflicts.map(c => `• ${c.name} on ${c.day} (Leave: ${c.leaveDate})`).join('\n');
        const proceed = confirm(
            `⚠️ Vacation Conflict Warning\n\nThe following people have approved leave during this period:\n\n${conflictList}\n\nDo you want to proceed anyway?`
        );
        if (!proceed) return;
    }
    
    // Check if we're editing from month view
    if (currentEditWeek && rosterMonthData[currentEditWeek]) {
        const weekData = rosterMonthData[currentEditWeek];
        
        if (useDatabase) {
            if (editIndex >= 0 && weekData[editIndex]) {
                const id = weekData[editIndex].id;
                await db.updateRosterEntry(id, entry);
                showToast('Roster entry updated');
                
                // Update local data
                weekData[editIndex] = { ...weekData[editIndex], ...entry, days: entry.days };
            } else {
                await db.saveRosterEntry(entry, weekData.length, currentEditWeek);
                showToast('Roster entry added');
                
                // Reload month data
                await loadRosterDataForMonth();
            }
        }
        
        // Reset edit context
        currentEditWeek = null;
        currentEditIndex = null;
        
        // Render the selected week
        await renderSelectedWeek();
        closeRosterModal();
        return;
    }
    
    // Legacy behavior for non-month view
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

// Check for vacation conflicts in a roster entry
async function checkRosterVacationConflicts(entry, weekStartStr) {
    const vacationConflicts = await fetchVacationConflicts(weekStartStr);
    const conflicts = [];
    const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    
    Object.entries(entry.days).forEach(([dayKey, personName]) => {
        if (personName && hasVacationConflict(personName, dayKey, vacationConflicts)) {
            const tooltip = getVacationTooltip(personName, vacationConflicts);
            conflicts.push({
                name: personName,
                day: dayNames[dayKey],
                leaveDate: tooltip.replace('On approved leave: ', '')
            });
        }
    });
    
    return conflicts;
}

function editRosterEntry(index) {
    openRosterModal(index);
}

async function deleteRosterEntry(index) {
    // Get entry details for the confirmation message
    const entry = rosterData[index];
    const app = entry?.app || 'Unknown';
    const team = entry?.team || 'Unknown';
    const timeShift = entry?.time_shift || '';
    
    showConfirmModal(
        `Are you sure you want to delete this roster entry?\n\nApplication: ${app}\nTeam: ${team}\nShift: ${timeShift}`,
        'Delete Roster Entry',
        async () => {
            // On confirm - delete the entry
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
    );
}

function exportRosterExcel() {
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh and try again.', 'error');
        return;
    }
    
    // Get the selected week from the week dropdown (month view)
    const weekSelect = document.getElementById('rosterWeekSelect');
    const selectedWeek = weekSelect?.value;
    
    // Determine which data source to use
    let dataToExport = [];
    let weekStartStr = '';
    
    if (selectedWeek && rosterMonthData && rosterMonthData[selectedWeek]) {
        // Use month view data
        dataToExport = rosterMonthData[selectedWeek];
        weekStartStr = selectedWeek;
    } else if (rosterData && rosterData.length > 0) {
        // Fallback to old rosterData
        dataToExport = rosterData;
        weekStartStr = getCurrentWeekStart();
    }
    
    if (!dataToExport || dataToExport.length === 0) {
        showToast('No roster data to export', 'error');
        return;
    }
    
    // Get the week start date
    const weekStart = weekStartStr ? new Date(weekStartStr) : new Date();
    
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
    const exportData = dataToExport.map(r => {
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
    
    console.log('Exporting roster data:', dataToExport.length, 'entries for week:', weekStartStr);
    
    // Download the file
    XLSX.writeFile(wb, filename);
    showToast('Roster exported to Excel');
}

// Keep old function name for backward compatibility
function exportRosterJSON() {
    exportRosterExcel();
}

// Import On-Call Roster from Excel
async function handleRosterExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh and try again.', 'error');
        return;
    }
    
    try {
        showToast('Reading Excel file...');
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get the first sheet (should be "On-Call Roster")
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                
                // Convert to JSON with headers
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
                
                if (jsonData.length < 2) {
                    showToast('Excel file is empty or has no data rows', 'error');
                    return;
                }
                
                // Parse headers to extract week start date
                const headers = jsonData[0];
                console.log('Excel headers:', headers);
                
                // Find the week start date from the day columns (e.g., "Mon (8-Jun)")
                const weekStartDate = parseWeekStartFromHeaders(headers);
                if (!weekStartDate) {
                    showToast('Could not determine week start date from headers. Expected format: Mon (8-Jun)', 'error');
                    return;
                }
                
                console.log('Detected week start:', weekStartDate);
                
                // Map column indices
                const timeIdx = headers.findIndex(h => h && h.toLowerCase().includes('time') || h && h.toLowerCase().includes('shift'));
                const appIdx = headers.findIndex(h => h && h.toLowerCase() === 'application');
                const teamIdx = headers.findIndex(h => h && h.toLowerCase() === 'team');
                
                // Find day columns
                const dayColumns = {};
                const dayPatterns = {
                    mon: /^mon\s*\(/i,
                    tue: /^tue\s*\(/i,
                    wed: /^wed\s*\(/i,
                    thu: /^thu\s*\(/i,
                    fri: /^fri\s*\(/i,
                    sat: /^sat\s*\(/i,
                    sun: /^sun\s*\(/i
                };
                
                headers.forEach((h, idx) => {
                    if (!h) return;
                    for (const [day, pattern] of Object.entries(dayPatterns)) {
                        if (pattern.test(h)) {
                            dayColumns[day] = idx;
                            break;
                        }
                    }
                });
                
                console.log('Column mapping:', { timeIdx, appIdx, teamIdx, dayColumns });
                
                // Parse data rows
                const rosterEntries = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    
                    // Skip empty rows
                    const hasData = row.some(cell => cell && cell.toString().trim() !== '');
                    if (!hasData) continue;
                    
                    const time = (timeIdx >= 0 && row[timeIdx]) ? row[timeIdx].toString().trim() : '';
                    const app = (appIdx >= 0 && row[appIdx]) ? row[appIdx].toString().trim() : '';
                    const team = (teamIdx >= 0 && row[teamIdx]) ? row[teamIdx].toString().trim() : '';
                    
                    // Skip if missing essential data
                    if (!time && !app && !team) continue;
                    
                    const days = {
                        mon: dayColumns.mon !== undefined ? (row[dayColumns.mon] || '').toString().trim() : '',
                        tue: dayColumns.tue !== undefined ? (row[dayColumns.tue] || '').toString().trim() : '',
                        wed: dayColumns.wed !== undefined ? (row[dayColumns.wed] || '').toString().trim() : '',
                        thu: dayColumns.thu !== undefined ? (row[dayColumns.thu] || '').toString().trim() : '',
                        fri: dayColumns.fri !== undefined ? (row[dayColumns.fri] || '').toString().trim() : '',
                        sat: dayColumns.sat !== undefined ? (row[dayColumns.sat] || '').toString().trim() : '',
                        sun: dayColumns.sun !== undefined ? (row[dayColumns.sun] || '').toString().trim() : ''
                    };
                    
                    rosterEntries.push({
                        time,
                        app,
                        team,
                        days,
                        week_start: weekStartDate
                    });
                }
                
                console.log('Parsed roster entries:', rosterEntries.length);
                
                if (rosterEntries.length === 0) {
                    showToast('No valid roster entries found in the Excel file', 'error');
                    return;
                }
                
                // Save to Supabase
                await importRosterToSupabase(rosterEntries, weekStartDate);
                
            } catch (parseError) {
                console.error('Error parsing Excel:', parseError);
                showToast('Error parsing Excel file: ' + parseError.message, 'error');
            }
        };
        
        reader.readAsArrayBuffer(file);
        
    } catch (error) {
        console.error('Error reading file:', error);
        showToast('Error reading file: ' + error.message, 'error');
    }
    
    // Reset file input so same file can be selected again
    event.target.value = '';
}

// Parse week start date from Excel headers
function parseWeekStartFromHeaders(headers) {
    // Look for "Mon (date)" pattern to determine week start
    for (const header of headers) {
        if (!header) continue;
        const match = header.match(/^Mon\s*\((\d{1,2})-([A-Za-z]{3})\)/i);
        if (match) {
            const day = parseInt(match[1]);
            const monthStr = match[2];
            const monthMap = {
                'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };
            const month = monthMap[monthStr.toLowerCase()];
            if (month !== undefined) {
                // Determine year - use current year, adjust if needed
                const now = new Date();
                let year = now.getFullYear();
                const testDate = new Date(year, month, day);
                
                // If the date is more than 6 months in the past, assume next year
                const sixMonthsAgo = new Date(now);
                sixMonthsAgo.setMonth(now.getMonth() - 6);
                if (testDate < sixMonthsAgo) {
                    year++;
                }
                
                const weekStart = new Date(year, month, day);
                return formatDateForInput(weekStart);
            }
        }
    }
    return null;
}

// Import roster entries to Supabase
async function importRosterToSupabase(entries, weekStart) {
    try {
        showToast('Importing roster data...');
        
        // First, delete existing entries for this week to avoid duplicates
        const deleteResult = await supabaseRequest(
            `roster?week_start=eq.${weekStart}`,
            { method: 'DELETE' }
        );
        console.log('Deleted existing entries for week:', weekStart);
        
        // Insert new entries
        let importedCount = 0;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const dbEntry = {
                time: entry.time,
                app: entry.app,
                team: entry.team,
                days: entry.days,
                week_start: entry.week_start,
                sort_order: i
            };
            
            const result = await supabaseRequest('roster', {
                method: 'POST',
                body: dbEntry
            });
            
            if (result) {
                importedCount++;
            }
        }
        
        console.log('Imported', importedCount, 'roster entries');
        showToast(`Successfully imported ${importedCount} roster entries for week of ${weekStart}`, 'success');
        
        // Update the month/week filters to show the imported week
        const importDate = new Date(weekStart);
        const monthSelect = document.getElementById('rosterMonthSelect');
        if (monthSelect) {
            const monthValue = `${importDate.getFullYear()}-${String(importDate.getMonth() + 1).padStart(2, '0')}`;
            monthSelect.value = monthValue;
        }
        
        // Reload roster data to show imported entries
        await loadRosterMonth();
        
        // Set the week selector to the imported week
        const weekSelect = document.getElementById('rosterWeekSelect');
        if (weekSelect) {
            weekSelect.value = weekStart;
            renderSelectedWeek();
        }
        
    } catch (error) {
        console.error('Error importing roster:', error);
        showToast('Error importing roster: ' + error.message, 'error');
    }
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
        // Set timezone dropdown
        document.getElementById('staffTimezone').value = staff.timezone || 'AEST';
    } else {
        title.textContent = 'Add Staff Entry';
        // Default to AEST
        document.getElementById('staffTimezone').value = 'AEST';
    }
    
    modal.classList.remove('hidden');
}

function closeStaffModal() {
    document.getElementById('staffModal').classList.add('hidden');
}

async function saveStaffEntry(event) {
    event.preventDefault();
    
    const editIndex = parseInt(document.getElementById('staffEditIndex').value);
    const entry = {
        name: document.getElementById('staffName').value.trim(),
        email: document.getElementById('staffEmail').value.trim(),
        mobile: document.getElementById('staffMobile').value.trim(),
        timezone: document.getElementById('staffTimezone').value || 'AEST'
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
    // Get staff entry details for the confirmation message
    const staff = staffData[index];
    const staffName = staff?.name || 'this staff member';
    const staffEmail = staff?.email || '';

    showConfirmModal(
        `Are you sure you want to delete "${staffName}"${staffEmail ? ` (${staffEmail})` : ''}?`,
        'Delete Staff Entry',
        async () => {
            // On confirm - delete the entry
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
    );
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
        'Mobile': s.mobile || '',
        'Timezone': s.timezone || 'AEST'
    }));
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 25 },  // Name
        { wch: 35 },  // Email
        { wch: 20 },  // Mobile
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

// ============================================
// ACKNOWLEDGEMENT TRACKER FUNCTIONS
// ============================================

let acknowledgementData = [];

async function initializeAcknowledgementTracker() {
    // Set default week filter to current week
    const weekInput = document.getElementById('ackFilterWeek');
    if (weekInput) {
        const now = new Date();
        const year = now.getFullYear();
        const weekNum = getWeekNumber(now);
        weekInput.value = `${year}-W${String(weekNum).padStart(2, '0')}`;
    }
    
    // Populate app filter from roster data
    populateAckAppFilter();
    
    // Load initial data
    await refreshAcknowledgements();
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function populateAckAppFilter() {
    const select = document.getElementById('ackFilterApp');
    if (!select) return;
    
    // Get unique apps from roster data
    const apps = new Set();
    if (rosterData && rosterData.length > 0) {
        rosterData.forEach(item => {
            if (item.app) apps.add(item.app);
        });
    }
    
    // Clear existing options except "All"
    select.innerHTML = '<option value="">All Applications</option>';
    
    // Add app options
    apps.forEach(app => {
        const option = document.createElement('option');
        option.value = app;
        option.textContent = app;
        select.appendChild(option);
    });
}

async function refreshAcknowledgements() {
    if (!useDatabase) {
        showToast('Database not configured', 'error');
        return;
    }
    
    const tableBody = document.getElementById('ackTableBody');
    const emptyState = document.getElementById('ackEmptyState');
    const loading = document.getElementById('ackLoading');
    
    // Show loading
    if (tableBody) tableBody.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');
    if (loading) loading.classList.remove('hidden');
    
    try {
        // Fetch acknowledgements from Supabase
        const response = await fetch(`${SUPABASE_URL}/rest/v1/acknowledgements?order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch acknowledgements');
        }
        
        acknowledgementData = await response.json();
        
        // Apply filters and render
        filterAcknowledgements();
        
    } catch (error) {
        console.error('Error fetching acknowledgements:', error);
        showToast('Failed to load acknowledgements', 'error');
        if (loading) loading.classList.add('hidden');
        if (emptyState) {
            emptyState.querySelector('p').textContent = 'Failed to load data';
            emptyState.classList.remove('hidden');
        }
    }
}

function filterAcknowledgements() {
    const weekFilter = document.getElementById('ackFilterWeek')?.value || '';
    const appFilter = document.getElementById('ackFilterApp')?.value || '';
    const statusFilter = document.getElementById('ackFilterStatus')?.value || '';
    const typeFilter = document.getElementById('ackFilterType')?.value || '';
    
    let filtered = [...acknowledgementData];
    
    // Filter by week
    if (weekFilter) {
        const [year, week] = weekFilter.split('-W');
        filtered = filtered.filter(ack => {
            if (!ack.week_start) return false;
            const ackDate = new Date(ack.week_start);
            const ackYear = ackDate.getFullYear();
            const ackWeek = getWeekNumber(ackDate);
            return ackYear === parseInt(year) && ackWeek === parseInt(week);
        });
    }
    
    // Filter by app
    if (appFilter) {
        filtered = filtered.filter(ack => (ack.app_name || ack.app) === appFilter);
    }
    
    // Filter by status
    if (statusFilter === 'acknowledged') {
        filtered = filtered.filter(ack => ack.acknowledged === true);
    } else if (statusFilter === 'pending') {
        filtered = filtered.filter(ack => ack.acknowledged !== true);
    }
    
    // Filter by type
    if (typeFilter) {
        filtered = filtered.filter(ack => ack.notification_type === typeFilter);
    }
    
    // Render filtered data
    renderAcknowledgements(filtered);
    updateAckStats(filtered);
}

function renderAcknowledgements(data) {
    const tableBody = document.getElementById('ackTableBody');
    const emptyState = document.getElementById('ackEmptyState');
    const loading = document.getElementById('ackLoading');
    
    if (loading) loading.classList.add('hidden');
    
    if (!data || data.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    const rows = data.map(ack => {
        const statusBadge = ack.acknowledged 
            ? `<span class="ack-status-badge acknowledged">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Acknowledged
               </span>`
            : `<span class="ack-status-badge pending">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                Pending
               </span>`;
        
        const typeBadge = `<span class="ack-type-badge ${ack.notification_type || 'daily'}">${ack.notification_type || 'daily'}</span>`;
        
        const weekDisplay = ack.week_start 
            ? formatWeekDisplay(ack.week_start) 
            : '-';
        
        const sentTime = ack.created_at 
            ? `<span class="ack-timestamp">${formatDateTime(ack.created_at)}</span>` 
            : '-';
        
        const ackTime = ack.acknowledged_at 
            ? `<span class="ack-timestamp">${formatDateTime(ack.acknowledged_at)}</span>` 
            : `<span class="ack-timestamp na">-</span>`;
        
        return `
            <tr>
                <td><span class="ack-person-name">${escapeHtml(ack.person_name || '-')}</span></td>
                <td><span class="ack-app-badge">${escapeHtml(ack.app_name || ack.app || '-')}</span></td>
                <td>${typeBadge}</td>
                <td>${weekDisplay}</td>
                <td>${sentTime}</td>
                <td>${statusBadge}</td>
                <td>${ackTime}</td>
            </tr>
        `;
    }).join('');
    
    if (tableBody) tableBody.innerHTML = rows;
}

function formatWeekDisplay(dateStr) {
    const date = new Date(dateStr);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 6);
    
    const options = { month: 'short', day: 'numeric' };
    return `${date.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    const dateOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    return `${date.toLocaleDateString('en-US', dateOpts)} ${date.toLocaleTimeString('en-US', timeOpts)}`;
}

function updateAckStats(data) {
    const total = data.length;
    const acknowledged = data.filter(a => a.acknowledged === true).length;
    const pending = total - acknowledged;
    const rate = total > 0 ? Math.round((acknowledged / total) * 100) : 0;
    
    const totalEl = document.getElementById('ackStatTotal');
    const ackEl = document.getElementById('ackStatAcknowledged');
    const pendingEl = document.getElementById('ackStatPending');
    const rateEl = document.getElementById('ackStatRate');
    
    if (totalEl) totalEl.textContent = total;
    if (ackEl) ackEl.textContent = acknowledged;
    if (pendingEl) pendingEl.textContent = pending;
    if (rateEl) rateEl.textContent = `${rate}%`;
}

// Initialize tracker when tab is shown
const originalShowTab = showTab;
showTab = function(screen, tab) {
    originalShowTab(screen, tab);
    
    // Initialize acknowledgement tracker when that tab is shown
    if (screen === 'oncall' && tab === 'acktracker') {
        initializeAcknowledgementTracker();
    }
    
    // Initialize vacation tabs
    if (screen === 'vacation') {
        if (tab === 'submit') {
            initializeVacationForm();
        } else if (tab === 'myrequests') {
            loadMyVacationRequests();
        } else if (tab === 'approvals') {
            loadPendingApprovals();
        } else if (tab === 'calendar') {
            initializeLeaveCalendar();
        }
    }
};

// ========================================
// VACATION REQUESTS FUNCTIONALITY
// ========================================

let allVacationRequests = [];
let currentVacationRequest = null;

// Initialize vacation form
function initializeVacationForm() {
    populateVacationEmployeeDropdown();
    setupVacationDateListeners();
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('vacationStartDate');
    const endDateInput = document.getElementById('vacationEndDate');
    
    if (startDateInput) startDateInput.min = today;
    if (endDateInput) endDateInput.min = today;
}
// Helper to capitalize first letter
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Fetch employee team from contacts table
async function fetchEmployeeTeam(employeeName) {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/contacts?select=team&name=ilike.${encodeURIComponent(employeeName)}&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error('Error fetching employee team:', error);
        return null;
    }
}

// Manager directory for vacation approvals
// NOTE: These emails must match the managers table in Supabase
const MANAGERS = {
    josieSolar: { name: 'Josie Solar', email: 'josephis@amdocs.com' },
    manishaBardiya: { name: 'Manisha Bardiya', email: 'MBARDIYA@amdocs.com' },
    ashwaniAggarwal: { name: 'Ashwani Aggarwal', email: 'ASHWANIA@amdocs.com' },
    atmaramMore: { name: 'Atmaram More', email: 'Atmaram.More@amdocs.com' },
    bindiyaPhadte: { name: 'Bindiya Phadte', email: 'BPHADTE@amdocs.com' },
    rahulGupta: { name: 'Rahul Gupta', email: 'rahulg5@amdocs.com' },
    prachiMenon: { name: 'Prachi Menon', email: 'Prachi.Menon@amdocs.com' }
};

// Manager routing configuration for vacation approvals (supports multiple approvers)
const VACATION_APPROVERS = {
    // Philippines Site - Team-based routing
    'philippines_frontend': [MANAGERS.josieSolar, MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'philippines_digital': [MANAGERS.josieSolar, MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'philippines_backend': [MANAGERS.josieSolar, MANAGERS.atmaramMore, MANAGERS.bindiyaPhadte],
    'philippines_infra': [MANAGERS.josieSolar, MANAGERS.rahulGupta],
    'philippines_ods': [MANAGERS.josieSolar, MANAGERS.prachiMenon],
    
    // India/Australia Site - Team-based routing
    'india_frontend': [MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'india_digital': [MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'india_backend': [MANAGERS.atmaramMore, MANAGERS.bindiyaPhadte],
    'india_infra': [MANAGERS.rahulGupta],
    'india_ods': [MANAGERS.prachiMenon],
    
    'australia_frontend': [MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'australia_digital': [MANAGERS.manishaBardiya, MANAGERS.ashwaniAggarwal],
    'australia_backend': [MANAGERS.atmaramMore, MANAGERS.bindiyaPhadte],
    'australia_infra': [MANAGERS.rahulGupta],
    'australia_ods': [MANAGERS.prachiMenon],
    
    // Default (for B2B, ANM, SDM, L2, etc.)
    'default': []
};

// Determine vacation approvers based on Site and Team (returns array of approvers)
function determineVacationApprovers(site, team) {
    const siteLower = (site || '').toLowerCase().trim();
    const teamLower = (team || '').toLowerCase().trim();
    
    // Normalize site names
    let siteKey = 'default';
    if (siteLower.includes('philippines') || siteLower === 'ph') {
        siteKey = 'philippines';
    } else if (siteLower.includes('india') || siteLower === 'in') {
        siteKey = 'india';
    } else if (siteLower.includes('australia') || siteLower === 'au' || siteLower.includes('aest')) {
        siteKey = 'australia';
    }
    
    // Build lookup key
    const lookupKey = `${siteKey}_${teamLower}`;
    
    // Check for exact match
    if (VACATION_APPROVERS[lookupKey]) {
        return VACATION_APPROVERS[lookupKey];
    }
    
    // Default: No specific approvers found
    return VACATION_APPROVERS['default'];
}

// Legacy function for backward compatibility (returns first approver)
function determineVacationApprover(site, team) {
    const approvers = determineVacationApprovers(site, team);
    if (approvers.length > 0) {
        return approvers[0];
    }
    return { name: 'Not Configured', email: '' };
}

// Populate employee dropdown from staff directory
async function populateVacationEmployeeDropdown() {
    const employeeSelect = document.getElementById('vacationEmployeeName');
    const myRequestsSelect = document.getElementById('myRequestsFilterName');
    
    if (!employeeSelect) return;
    
    try {
        // Fetch staff with site and application fields
        const response = await fetch(`${SUPABASE_URL}/rest/v1/staff_directory?select=name,email,site,application&order=name`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch staff');
        
        const staff = await response.json();
        
        // Clear and populate employee dropdown
        employeeSelect.innerHTML = '<option value="">Select your name</option>';
        staff.forEach(person => {
            const option = document.createElement('option');
            option.value = person.name;
            option.textContent = person.name;
            option.dataset.email = person.email || '';
            option.dataset.site = person.site || '';
            employeeSelect.appendChild(option);
        });
        
        // Also populate My Requests filter
        if (myRequestsSelect) {
            myRequestsSelect.innerHTML = '<option value="">Select Your Name</option>';
            staff.forEach(person => {
                const option = document.createElement('option');
                option.value = person.name;
                option.textContent = person.name;
                myRequestsSelect.appendChild(option);
            });
        }
        
        // Add change listener to auto-fill email, site, team, and manager
        employeeSelect.addEventListener('change', async function() {
            const selectedOption = this.options[this.selectedIndex];
            const emailInput = document.getElementById('vacationEmployeeEmail');
            const siteInput = document.getElementById('vacationSite');
            const teamInput = document.getElementById('vacationTeam');
            const approverNameInput = document.getElementById('vacationApproverName');
            const managerEmailInput = document.getElementById('vacationManagerEmail');
            
            if (selectedOption.value) {
                // Auto-fill email and site from staff_directory
                if (emailInput) emailInput.value = selectedOption.dataset.email || '';
                if (siteInput) siteInput.value = selectedOption.dataset.site || '';
                
                // Fetch team from contacts table
                const employeeName = selectedOption.value;
                const teamData = await fetchEmployeeTeam(employeeName);
                const team = teamData?.team || '';
                const teamDisplay = team ? capitalizeFirst(team) + ' Team' : '';
                
                if (teamInput) teamInput.value = teamDisplay;
                
                // Auto-determine managers based on Site and Team (now supports multiple)
                const approvers = determineVacationApprovers(
                    selectedOption.dataset.site || '',
                    team
                );
                
                if (approvers.length > 0) {
                    // Display all approver names (comma-separated)
                    const approverNames = approvers.map(a => a.name).join(', ');
                    // Store all approver emails (semicolon-separated for multiple recipients)
                    const approverEmails = approvers.map(a => a.email).join(';');
                    
                    if (approverNameInput) approverNameInput.value = approverNames;
                    if (managerEmailInput) managerEmailInput.value = approverEmails;
                } else {
                    if (approverNameInput) approverNameInput.value = 'Not Configured';
                    if (managerEmailInput) managerEmailInput.value = '';
                }
            } else {
                // Clear all fields
                if (emailInput) emailInput.value = '';
                if (siteInput) siteInput.value = '';
                if (teamInput) teamInput.value = '';
                if (approverNameInput) approverNameInput.value = '';
                if (managerEmailInput) managerEmailInput.value = '';
            }
        });
    } catch (error) {
        console.error('Error loading staff for vacation form:', error);
    }
}

// Setup date change listeners to calculate duration
function setupVacationDateListeners() {
    const startDateInput = document.getElementById('vacationStartDate');
    const endDateInput = document.getElementById('vacationEndDate');
    const durationInput = document.getElementById('vacationDuration');
    
    function calculateDuration() {
        if (startDateInput.value && endDateInput.value) {
            const start = new Date(startDateInput.value);
            const end = new Date(endDateInput.value);
            
            if (end >= start) {
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                durationInput.value = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
                
                // Update end date minimum
                endDateInput.min = startDateInput.value;
            } else {
                durationInput.value = 'Invalid dates';
            }
        } else {
            durationInput.value = '';
        }
    }
    
    if (startDateInput) startDateInput.addEventListener('change', calculateDuration);
    if (endDateInput) endDateInput.addEventListener('change', calculateDuration);
}

// Submit vacation request
async function submitVacationRequest(event) {
    event.preventDefault();
    
    const employeeName = document.getElementById('vacationEmployeeName').value;
    const email = document.getElementById('vacationEmployeeEmail').value;
    const site = document.getElementById('vacationSite').value;
    const team = document.getElementById('vacationTeam').value;
    const approverName = document.getElementById('vacationApproverName').value;
    const managerEmail = document.getElementById('vacationManagerEmail').value;
    const startDate = document.getElementById('vacationStartDate').value;
    const endDate = document.getElementById('vacationEndDate').value;
    const requestType = document.getElementById('vacationType').value;
    const reason = document.getElementById('vacationReason').value.trim();
    
    if (!employeeName || !email || !startDate || !endDate || !reason) {
        showWarningModal('Please fill in all required fields including the reason.', 'Missing Information');
        return;
    }
    
    if (!managerEmail) {
        showWarningModal('No approving manager configured for your team. Please contact admin.', 'Manager Not Found');
        return;
    }
    
    // Validate dates
    if (new Date(endDate) < new Date(startDate)) {
        showWarningModal('End date must be on or after start date.', 'Invalid Dates');
        return;
    }
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                employee_name: employeeName,
                email: email,
                site: site || null,
                team: team || null,
                approver_name: approverName || null,
                manager_email: managerEmail,
                start_date: startDate,
                end_date: endDate,
                request_type: requestType,
                reason: reason || null,
                status: 'pending'
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
        
        const savedRequest = await response.json();
        
        // Send email notification to manager
        await sendVacationNotification(savedRequest[0], 'new_request');
        
        // Format success message for single or multiple approvers
        const approverCount = approverName.split(',').length;
        const approverMsg = approverCount > 1 
            ? `${approverCount} managers have been notified via email.`
            : `${approverName} has been notified via email.`;
        showSuccessModal(`Leave request submitted successfully! ${approverMsg}`, 'Request Submitted');
        document.getElementById('vacationRequestForm').reset();
        document.getElementById('vacationDuration').value = '';
        document.getElementById('vacationSite').value = '';
        document.getElementById('vacationTeam').value = '';
        document.getElementById('vacationApproverName').value = '';
        document.getElementById('vacationManagerEmail').value = '';
        
    } catch (error) {
        console.error('Error submitting vacation request:', error);
        showErrorModal('Failed to submit leave request. Please try again.');
    }
}

// TEST MODE: Set this to your email to receive all vacation notifications for testing
// Set to null or empty string to disable test mode and send to actual recipients
const VACATION_TEST_EMAIL = null; // Production mode - sends to actual recipients

// Send vacation notification email
async function sendVacationNotification(request, notificationType) {
    try {
        const payload = {
            requestId: request.id,
            notificationType: notificationType,
            requestData: request
        };
        
        // Add test email if in test mode
        if (VACATION_TEST_EMAIL) {
            payload.testEmail = VACATION_TEST_EMAIL;
            console.log(`TEST MODE: Vacation notification will be sent to ${VACATION_TEST_EMAIL}`);
        }
        
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-vacation-notifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to send notification:', errorText);
        } else {
            const result = await response.json();
            console.log('Vacation notification sent successfully:', result);
        }
    } catch (error) {
        console.error('Error sending vacation notification:', error);
    }
}

// Load My Vacation Requests
async function loadMyVacationRequests() {
    const loadingEl = document.getElementById('myVacationRequestsLoading');
    const emptyEl = document.getElementById('myVacationRequestsEmpty');
    const tableEl = document.getElementById('myVacationRequestsTable');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.add('hidden');
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch vacation requests');
        
        allVacationRequests = await response.json();
        filterMyVacationRequests();
        
    } catch (error) {
        console.error('Error loading vacation requests:', error);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
    }
}

// Filter My Vacation Requests
function filterMyVacationRequests() {
    const statusFilter = document.getElementById('myRequestsFilterStatus')?.value || '';
    const nameFilter = document.getElementById('myRequestsFilterName')?.value || '';
    
    let filtered = [...allVacationRequests];
    
    if (statusFilter) {
        filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    if (nameFilter) {
        filtered = filtered.filter(r => r.employee_name === nameFilter);
    }
    
    renderMyVacationRequests(filtered);
}

// Render My Vacation Requests
function renderMyVacationRequests(requests) {
    const loadingEl = document.getElementById('myVacationRequestsLoading');
    const emptyEl = document.getElementById('myVacationRequestsEmpty');
    const tableEl = document.getElementById('myVacationRequestsTable');
    const tableBody = document.getElementById('myVacationRequestsBody');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    
    if (requests.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (tableEl) tableEl.classList.add('hidden');
        return;
    }
    
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.remove('hidden');
    
    const rows = requests.map(req => {
        const startDate = new Date(req.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const endDate = new Date(req.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const submitted = new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const duration = calculateDaysBetween(req.start_date, req.end_date);
        const typeClass = req.request_type.toLowerCase().replace(' ', '');
        
        return `
            <tr>
                <td><strong>${req.employee_name}</strong></td>
                <td>${submitted}</td>
                <td><span class="leave-type-badge ${typeClass}">${req.request_type}</span></td>
                <td>${startDate}</td>
                <td>${endDate}</td>
                <td>${duration} day${duration > 1 ? 's' : ''}</td>
                <td><span class="status-badge ${req.status}">${capitalizeFirst(req.status)}</span></td>
                <td>
                    <div class="vacation-actions">
                        <button class="btn-icon btn-view" onclick="viewVacationRequest(${req.id})" title="View Details">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        ${req.status === 'pending' ? `
                        <button class="btn-icon btn-cancel" onclick="cancelVacationRequest(${req.id})" title="Cancel Request">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if (tableBody) tableBody.innerHTML = rows;
}

// Load Pending Approvals (Manager View)
async function loadPendingApprovals() {
    const loadingEl = document.getElementById('pendingApprovalsLoading');
    const emptyEl = document.getElementById('pendingApprovalsEmpty');
    const tableEl = document.getElementById('pendingApprovalsTable');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.add('hidden');
    
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch vacation requests');
        
        allVacationRequests = await response.json();
        updateApprovalStats(allVacationRequests);
        filterPendingApprovals();
        
    } catch (error) {
        console.error('Error loading pending approvals:', error);
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

// Update approval statistics
function updateApprovalStats(requests) {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const pending = requests.filter(r => r.status === 'pending').length;
    const approvedThisMonth = requests.filter(r => {
        const reviewed = new Date(r.reviewed_at);
        return r.status === 'approved' && reviewed.getMonth() === thisMonth && reviewed.getFullYear() === thisYear;
    }).length;
    const rejectedThisMonth = requests.filter(r => {
        const reviewed = new Date(r.reviewed_at);
        return r.status === 'rejected' && reviewed.getMonth() === thisMonth && reviewed.getFullYear() === thisYear;
    }).length;
    
    const pendingEl = document.getElementById('pendingApprovalsCount');
    const approvedEl = document.getElementById('approvedRequestsCount');
    const rejectedEl = document.getElementById('rejectedRequestsCount');
    
    if (pendingEl) pendingEl.textContent = pending;
    if (approvedEl) approvedEl.textContent = approvedThisMonth;
    if (rejectedEl) rejectedEl.textContent = rejectedThisMonth;
}

// Filter Pending Approvals
function filterPendingApprovals() {
    const statusFilter = document.getElementById('approvalsFilterStatus')?.value || 'pending';
    
    let filtered = [...allVacationRequests];
    
    if (statusFilter) {
        filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    renderPendingApprovals(filtered);
}

// Render Pending Approvals
function renderPendingApprovals(requests) {
    const loadingEl = document.getElementById('pendingApprovalsLoading');
    const emptyEl = document.getElementById('pendingApprovalsEmpty');
    const tableEl = document.getElementById('pendingApprovalsTable');
    const tableBody = document.getElementById('pendingApprovalsBody');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    
    if (requests.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (tableEl) tableEl.classList.add('hidden');
        return;
    }
    
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.remove('hidden');
    
    const rows = requests.map(req => {
        const startDate = new Date(req.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDate = new Date(req.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const submitted = new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const duration = calculateDaysBetween(req.start_date, req.end_date);
        const typeClass = req.request_type.toLowerCase().replace(' ', '');
        
        return `
            <tr>
                <td><strong>${req.employee_name}</strong><br><small style="color: #64748b;">${req.email}</small></td>
                <td><span class="leave-type-badge ${typeClass}">${req.request_type}</span></td>
                <td>${startDate} - ${endDate}</td>
                <td>${duration} day${duration > 1 ? 's' : ''}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${req.reason || ''}">${req.reason || '-'}</td>
                <td>${submitted}</td>
                <td>
                    <div class="vacation-actions">
                        ${req.status === 'pending' ? `
                        <button class="btn-icon btn-approve" onclick="quickApprove(${req.id})" title="Approve">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        <button class="btn-icon btn-reject" onclick="quickReject(${req.id})" title="Reject">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        ` : `<span class="status-badge ${req.status}">${capitalizeFirst(req.status)}</span>`}
                        <button class="btn-icon btn-view" onclick="viewVacationRequestForApproval(${req.id})" title="View Details">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if (tableBody) tableBody.innerHTML = rows;
}

// View vacation request details
function viewVacationRequest(id) {
    currentVacationRequest = allVacationRequests.find(r => r.id === id);
    if (!currentVacationRequest) return;
    
    populateVacationDetailModal(currentVacationRequest, false);
    document.getElementById('vacationDetailModal').classList.remove('hidden');
}

// View vacation request for approval (with approval section)
async function viewVacationRequestForApproval(id) {
    currentVacationRequest = allVacationRequests.find(r => r.id === id);
    
    // If not in the loaded array, fetch directly by ID (for email link access)
    if (!currentVacationRequest) {
        currentVacationRequest = await fetchVacationRequestById(id);
    }
    
    if (!currentVacationRequest) {
        showWarningModal('Vacation request not found. It may have already been processed.', 'Request Not Found');
        return;
    }
    
    populateVacationDetailModal(currentVacationRequest, currentVacationRequest.status === 'pending');
    document.getElementById('vacationDetailModal').classList.remove('hidden');
}

// Populate the detail modal
function populateVacationDetailModal(req, showApproval) {
    document.getElementById('detailEmployeeName').textContent = req.employee_name;
    document.getElementById('detailEmployeeEmail').textContent = req.email;
    document.getElementById('detailLeaveType').innerHTML = `<span class="leave-type-badge ${req.request_type.toLowerCase().replace(' ', '')}">${req.request_type}</span>`;
    document.getElementById('detailStatus').innerHTML = `<span class="status-badge ${req.status}">${capitalizeFirst(req.status)}</span>`;
    document.getElementById('detailStartDate').textContent = new Date(req.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('detailEndDate').textContent = new Date(req.end_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('detailReason').textContent = req.reason || 'No reason provided';
    document.getElementById('detailSubmitted').textContent = new Date(req.created_at).toLocaleString('en-US');
    
    const approvalSection = document.getElementById('approvalSection');
    if (showApproval) {
        approvalSection.classList.remove('hidden');
        document.getElementById('managerNotes').value = '';
    } else {
        approvalSection.classList.add('hidden');
    }
}

// Close vacation detail modal
function closeVacationDetailModal() {
    document.getElementById('vacationDetailModal').classList.add('hidden');
    currentVacationRequest = null;
}

// Quick approve - with manager selection
async function quickApprove(id) {
    // Fetch request data to get approver_name list
    const request = allVacationRequests.find(r => r.id === id) || await fetchVacationRequestById(id);
    if (!request) {
        showErrorModal('Request not found');
        return;
    }
    
    // Get list of approvers from the request
    const approverNames = request.approver_name ? request.approver_name.split(',').map(n => n.trim()) : [];
    
    if (approverNames.length > 1) {
        // Multiple approvers - show selection modal
        showApproverSelectModal(
            'Select your name to approve this request:',
            'Approve Leave Request',
            approverNames,
            async (selectedApprover) => {
                currentVacationRequest = request;
                await updateVacationStatusWithReviewer(id, 'approved', '', selectedApprover);
                currentVacationRequest = null;
            }
        );
    } else {
        // Single approver - use simple confirmation
        showApproveModal(
            'Are you sure you want to approve this leave request?',
            'Approve Leave Request',
            async () => {
                currentVacationRequest = request;
                const reviewerName = approverNames[0] || 'Manager';
                await updateVacationStatusWithReviewer(id, 'approved', '', reviewerName);
                currentVacationRequest = null;
            }
        );
    }
}

// Quick reject - with manager selection
async function quickReject(id) {
    // Fetch request data to get approver_name list
    const request = allVacationRequests.find(r => r.id === id) || await fetchVacationRequestById(id);
    if (!request) {
        showErrorModal('Request not found');
        return;
    }
    
    // Get list of approvers from the request
    const approverNames = request.approver_name ? request.approver_name.split(',').map(n => n.trim()) : [];
    
    if (approverNames.length > 1) {
        // Multiple approvers - show selection modal with reason input
        showApproverSelectWithReasonModal(
            'Select your name and provide a reason for rejection:',
            'Reject Leave Request',
            approverNames,
            async (selectedApprover, reason) => {
                currentVacationRequest = request;
                await updateVacationStatusWithReviewer(id, 'rejected', reason || '', selectedApprover);
                currentVacationRequest = null;
            }
        );
    } else {
        // Single approver - use simple prompt
        showPromptModal(
            'Please provide a reason for rejection (optional):',
            'Reject Leave Request',
            'Enter rejection reason...',
            async (reason) => {
                currentVacationRequest = request;
                const reviewerName = approverNames[0] || 'Manager';
                await updateVacationStatusWithReviewer(id, 'rejected', reason || '', reviewerName);
                currentVacationRequest = null;
            }
        );
    }
}

// Update vacation status with specific reviewer name
async function updateVacationStatusWithReviewer(id, status, notes, reviewerName) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                status: status,
                reviewed_by: reviewerName,
                reviewed_at: new Date().toISOString(),
                manager_notes: notes || null
            })
        });
        
        if (!response.ok) throw new Error('Failed to update request');
        
        const updatedRequest = await response.json();
        
        // Clear vacation conflict cache
        vacationConflictCache = {};
        vacationConflictCacheWeek = null;
        
        // Send notification to the requestor
        if (updatedRequest && updatedRequest[0]) {
            await sendVacationNotification(updatedRequest[0], status === 'approved' ? 'approved' : 'rejected');
        }
        
        showSuccessModal(`Leave request ${status} successfully! The employee has been notified.`, status === 'approved' ? 'Request Approved' : 'Request Rejected');
        loadPendingApprovals();
        
    } catch (error) {
        console.error('Error updating vacation request:', error);
        showErrorModal('Failed to update leave request. Please try again.');
    }
}

// Approve vacation request (from modal)
async function approveVacationRequest() {
    if (!currentVacationRequest) return;
    const notes = document.getElementById('managerNotes').value;
    await updateVacationStatus(currentVacationRequest.id, 'approved', notes);
    closeVacationDetailModal();
}

// Reject vacation request (from modal)
async function rejectVacationRequest() {
    if (!currentVacationRequest) return;
    const notes = document.getElementById('managerNotes').value;
    if (!notes) {
        showWarningModal('Please provide a reason for rejection.', 'Reason Required');
        return;
    }
    await updateVacationStatus(currentVacationRequest.id, 'rejected', notes);
    closeVacationDetailModal();
}

// Update vacation request status
async function updateVacationStatus(id, status, notes) {
    try {
        // Get the reviewer name from the current request's approver_name, or derive from manager_email
        let reviewerName = 'Manager';
        if (currentVacationRequest) {
            if (currentVacationRequest.approver_name) {
                reviewerName = currentVacationRequest.approver_name;
            } else if (currentVacationRequest.manager_email) {
                // Derive name from manager email (e.g., "john.smith@company.com" -> "John Smith")
                const emailPart = currentVacationRequest.manager_email.split('@')[0];
                reviewerName = emailPart
                    .split('.')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                    .join(' ');
            }
        }
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                status: status,
                reviewed_by: reviewerName,
                reviewed_at: new Date().toISOString(),
                manager_notes: notes || null
            })
        });
        
        if (!response.ok) throw new Error('Failed to update request');
        
        const updatedRequest = await response.json();
        
        // Clear vacation conflict cache when status changes (especially when approved)
        vacationConflictCache = {};
        vacationConflictCacheWeek = null;
        
        // Send notification to the requestor about the status update
        if (updatedRequest && updatedRequest[0]) {
            await sendVacationNotification(updatedRequest[0], status === 'approved' ? 'approved' : 'rejected');
        }
        
        showSuccessModal(`Leave request ${status} successfully! The employee has been notified.`, status === 'approved' ? 'Request Approved' : 'Request Rejected');
        loadPendingApprovals();
        
    } catch (error) {
        console.error('Error updating vacation request:', error);
        showErrorModal('Failed to update leave request. Please try again.');
    }
}

// Cancel vacation request
async function cancelVacationRequest(id) {
    showConfirmModal(
        'Are you sure you want to cancel this leave request?',
        'Cancel Leave Request',
        async () => {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        status: 'cancelled'
                    })
                });
                
                if (!response.ok) throw new Error('Failed to cancel request');
                
                showSuccessModal('Leave request has been cancelled.', 'Request Cancelled');
                loadMyVacationRequests();
                
            } catch (error) {
                console.error('Error cancelling vacation request:', error);
                showErrorModal('Failed to cancel leave request. Please try again.');
            }
        }
    );
}

// Initialize Leave Calendar
function initializeLeaveCalendar() {
    const calendarMonth = document.getElementById('calendarMonth');
    if (calendarMonth && !calendarMonth.value) {
        const now = new Date();
        calendarMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    loadLeaveCalendar();
}

// Load Leave Calendar
async function loadLeaveCalendar() {
    const loadingEl = document.getElementById('leaveCalendarLoading');
    const emptyEl = document.getElementById('leaveCalendarEmpty');
    const contentEl = document.getElementById('leaveCalendarContent');
    const gridEl = document.getElementById('leaveCalendarGrid');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    
    const calendarMonth = document.getElementById('calendarMonth')?.value;
    if (!calendarMonth) return;
    
    const [year, month] = calendarMonth.split('-');
    const startOfMonth = `${year}-${month}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
    
    try {
        // Filter leaves that OVERLAP with the selected month:
        // A leave overlaps if: start_date <= endOfMonth AND end_date >= startOfMonth
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/vacation_requests?select=*&status=eq.approved&start_date=lte.${endOfMonth}&end_date=gte.${startOfMonth}&order=start_date`, 
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        
        if (!response.ok) throw new Error('Failed to fetch calendar data');
        
        const leaves = await response.json();
        
        if (loadingEl) loadingEl.classList.add('hidden');
        
        if (leaves.length === 0) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        
        if (contentEl) contentEl.classList.remove('hidden');
        
        const items = leaves.map(leave => {
            const startDate = new Date(leave.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endDate = new Date(leave.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const typeClass = leave.request_type.toLowerCase().replace(' ', '');
            
            return `
                <div class="leave-calendar-item">
                    <div class="calendar-dates">${startDate} - ${endDate}</div>
                    <div class="calendar-employee">${leave.employee_name}</div>
                    <div class="calendar-type">
                        <span class="leave-type-badge ${typeClass}">${leave.request_type}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        if (gridEl) gridEl.innerHTML = items;
        
    } catch (error) {
        console.error('Error loading leave calendar:', error);
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

// Helper function to calculate days between two dates
function calculateDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// Helper function to capitalize first letter
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initialize vacation section when switching to it
document.addEventListener('DOMContentLoaded', function() {
    // Add vacation screen to switchMainScreen function if needed
    const originalSwitchMainScreen = window.switchMainScreen;
    if (originalSwitchMainScreen) {
        window.switchMainScreen = function(screen, clickEvent = null) {
            originalSwitchMainScreen(screen, clickEvent);
            
            if (screen === 'vacation') {
                initializeVacationForm();
            }
        };
    }
    
    // Check for vacation review URL parameter (from email link)
    checkVacationReviewParam();
});

// Check for vacation review URL parameter
async function checkVacationReviewParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const vacationReviewId = urlParams.get('vacationReview');
    
    if (vacationReviewId) {
        console.log('Vacation review requested for ID:', vacationReviewId);
        
        // Switch to vacation screen
        if (typeof switchMainScreen === 'function') {
            switchMainScreen('vacation');
        }
        
        // Wait a moment for the screen to initialize
        setTimeout(async () => {
            // Switch to pending approvals tab (screen='vacation', tabName='approvals')
            showTab('vacation', 'approvals');
            
            // Wait for data to load
            await loadPendingApprovals();
            
            // Small delay to ensure data is rendered
            setTimeout(() => {
                // Open the specific request for review
                viewVacationRequestForApproval(parseInt(vacationReviewId));
                
                // Clear the URL parameter
                const newUrl = window.location.pathname + window.location.hash;
                window.history.replaceState({}, '', newUrl);
            }, 500);
        }, 300);
    }
}

// Fetch a specific vacation request by ID for review
async function fetchVacationRequestById(id) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacation_requests?id=eq.${id}&select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch request');
        
        const data = await response.json();
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error('Error fetching vacation request:', error);
        return null;
    }
}

// ==================== HOLIDAY STAFFING FUNCTIONS ====================

// Holiday Staffing Status Options
const HOLIDAY_STATUS_OPTIONS = [
    { value: '', label: '-' },
    { value: 'PL', label: 'PL' },
    { value: 'WO', label: 'WO' },
    { value: 'PH', label: 'PH' },
    { value: 'AL', label: 'AL' },
    { value: 'SL', label: 'SL' },
    { value: 'WFH', label: 'WFH' },
    { value: 'HD', label: 'HD' },
    { value: 'S1', label: 'S1' },
    { value: 'S2', label: 'S2' },
    { value: 'S3', label: 'S3' },
    { value: 'GS', label: 'GS' },
    { value: 'CO', label: 'CO' },
    { value: 'AH', label: 'AH' },
    { value: 'DVCIH', label: 'DVCIH' }
];

// Store holiday staffing data from database
let holidayStaffingEntries = {};

// Application color mapping
const APP_COLORS = {
    'Frontend': '#90EE90',
    'Backend': '#FFB6C1',
    'Digital': '#DDA0DD',
    'Infra': '#87CEEB',
    'ODS': '#F0E68C',
    'SDM': '#20B2AA',
    'B2B': '#FFA07A',
    'L2': '#D8BFD8',
    'Manager': '#FFD700'
};

// Generate date headers for holiday period
function generateHolidayDates(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
        dates.push({
            date: current.toISOString().split('T')[0],
            display: `${current.getDate()}-${current.toLocaleDateString('en-US', { month: 'short' })}`,
            dayOfWeek: current.toLocaleDateString('en-US', { weekday: 'short' }),
            isWeekend: current.getDay() === 0 || current.getDay() === 6
        });
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

// Initialize holiday date pickers with default range
function initializeHolidayDatePickers() {
    const monthInput = document.getElementById('holidayMonthFilter');
    const startInput = document.getElementById('holidayStartDate');
    const endInput = document.getElementById('holidayEndDate');
    
    const today = new Date();
    
    // Set month filter to current month
    if (monthInput) {
        monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (startInput && endInput) {
        // Default to current month
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        startInput.value = formatDateForInput(startOfMonth);
        endInput.value = formatDateForInput(endOfMonth);
    }
}

// Handle month filter change
function onHolidayMonthChange() {
    const monthInput = document.getElementById('holidayMonthFilter');
    const startInput = document.getElementById('holidayStartDate');
    const endInput = document.getElementById('holidayEndDate');
    
    if (!monthInput || !monthInput.value) return;
    
    const [year, month] = monthInput.value.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    
    if (startInput) startInput.value = formatDateForInput(startOfMonth);
    if (endInput) endInput.value = formatDateForInput(endOfMonth);
    
    loadHolidaySummary();
}

// Load Holiday Summary - Main function
async function loadHolidaySummary() {
    const loadingEl = document.getElementById('holidaySummaryLoading');
    const emptyEl = document.getElementById('holidaySummaryEmpty');
    const tableEl = document.getElementById('holidaySummaryTable');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.add('hidden');
    
    // Initialize date pickers if not set
    const startInput = document.getElementById('holidayStartDate');
    const endInput = document.getElementById('holidayEndDate');
    
    if (!startInput?.value || !endInput?.value) {
        initializeHolidayDatePickers();
    }
    
    const startDate = startInput?.value;
    const endDate = endInput?.value;
    
    if (!startDate || !endDate) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    
    try {
        // Load contacts data from Contact Details
        const contactsResult = await supabaseRequest('contacts', 'GET', null, '?order=team,area,name');
        
        if (contactsResult.error || !contactsResult.data || contactsResult.data.length === 0) {
            if (loadingEl) loadingEl.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        
        // Load existing holiday staffing entries for the date range
        const staffingResult = await supabaseRequest('holiday_staffing', 'GET', null, 
            `?staff_date=gte.${startDate}&staff_date=lte.${endDate}`);
        
        // Build lookup map for existing entries
        holidayStaffingEntries = {};
        if (staffingResult.data) {
            staffingResult.data.forEach(entry => {
                const key = `${entry.contact_id}_${entry.staff_date}`;
                holidayStaffingEntries[key] = entry;
            });
        }
        
        // Transform contacts data
        const summaryData = contactsResult.data.map(c => ({
            id: c.id,
            app: capitalizeFirst(c.team || ''),
            area: c.area || '',
            name: c.name || '',
            site: c.site || '',
            contact: c.phone || '',
            statuses: {}
        }));
        
        // Fill in statuses from loaded data
        summaryData.forEach(row => {
            Object.keys(holidayStaffingEntries).forEach(key => {
                if (key.startsWith(`${row.id}_`)) {
                    const entry = holidayStaffingEntries[key];
                    row.statuses[entry.staff_date] = entry.status;
                }
            });
        });
        
        if (loadingEl) loadingEl.classList.add('hidden');
        if (tableEl) tableEl.classList.remove('hidden');
        
        const dates = generateHolidayDates(startDate, endDate);
        renderHolidaySummaryTable(dates, summaryData);
        
    } catch (err) {
        console.error('Error loading holiday summary:', err);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
    }
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Render Holiday Summary Table with dropdowns
function renderHolidaySummaryTable(dates, data) {
    const headEl = document.getElementById('holidaySummaryHead');
    const bodyEl = document.getElementById('holidaySummaryBody');
    
    if (!headEl || !bodyEl) return;
    
    // Build header - First row with day of week
    let headerHtml = '<tr class="hs-header-row">';
    headerHtml += '<th class="hs-fixed-col">App</th>';
    headerHtml += '<th class="hs-fixed-col">Application Area</th>';
    headerHtml += '<th class="hs-fixed-col">Name</th>';
    headerHtml += '<th class="hs-fixed-col">Site</th>';
    headerHtml += '<th class="hs-fixed-col">Contact Number</th>';
    
    dates.forEach(d => {
        const weekendClass = d.isWeekend ? 'hs-weekend' : '';
        headerHtml += `<th class="hs-date-col ${weekendClass}">${d.display}<br><small>${d.dayOfWeek}</small></th>`;
    });
    headerHtml += '</tr>';
    
    headEl.innerHTML = headerHtml;
    
    // Build body with dropdowns
    let bodyHtml = '';
    
    data.forEach((row, rowIndex) => {
        // Get color for this application (only for App and Area columns)
        const appColor = APP_COLORS[row.app] || '#f0f0f0';
        
        bodyHtml += `<tr data-contact-id="${row.id}">`;
        bodyHtml += `<td class="hs-app-cell" style="background-color: ${appColor};"><strong>${escapeHtml(row.app)}</strong></td>`;
        bodyHtml += `<td class="hs-area-cell" style="background-color: ${appColor};">${escapeHtml(row.area)}</td>`;
        bodyHtml += `<td class="hs-name-cell"><strong>${escapeHtml(row.name)}</strong></td>`;
        bodyHtml += `<td class="hs-site-cell">${escapeHtml(row.site)}</td>`;
        bodyHtml += `<td class="hs-contact-cell">${escapeHtml(row.contact)}</td>`;
        
        dates.forEach(d => {
            const status = row.statuses[d.date] || '';
            const weekendClass = d.isWeekend ? 'hs-weekend' : '';
            const statusClass = status ? `hs-status-${status.toLowerCase()}` : '';
            
            // Build dropdown options
            let optionsHtml = HOLIDAY_STATUS_OPTIONS.map(opt => 
                `<option value="${opt.value}" ${opt.value === status ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            
            bodyHtml += `<td class="hs-status-cell ${weekendClass} ${statusClass}">
                <select class="hs-status-dropdown" 
                        data-contact-id="${row.id}" 
                        data-date="${d.date}"
                        onchange="onHolidayStatusChange(this)">
                    ${optionsHtml}
                </select>
            </td>`;
        });
        
        bodyHtml += '</tr>';
    });
    
    bodyEl.innerHTML = bodyHtml;
}

// Handle status change
async function onHolidayStatusChange(selectEl) {
    const contactId = selectEl.dataset.contactId;
    const date = selectEl.dataset.date;
    const status = selectEl.value;
    
    // Update cell styling
    const cell = selectEl.parentElement;
    cell.className = 'hs-status-cell';
    if (cell.classList.contains('hs-weekend')) cell.classList.add('hs-weekend');
    if (status) cell.classList.add(`hs-status-${status.toLowerCase()}`);
    
    // Save to database
    const key = `${contactId}_${date}`;
    
    try {
        if (status) {
            // Check if entry exists
            if (holidayStaffingEntries[key]) {
                // Update existing
                await supabaseRequest('holiday_staffing', 'PATCH', 
                    { status, updated_at: new Date().toISOString() },
                    `?contact_id=eq.${contactId}&staff_date=eq.${date}`
                );
            } else {
                // Insert new
                await supabaseRequest('holiday_staffing', 'POST', {
                    contact_id: parseInt(contactId),
                    staff_date: date,
                    status: status
                });
            }
            holidayStaffingEntries[key] = { contact_id: contactId, staff_date: date, status };
        } else {
            // Delete if status is empty
            if (holidayStaffingEntries[key]) {
                await supabaseRequest('holiday_staffing', 'DELETE', null,
                    `?contact_id=eq.${contactId}&staff_date=eq.${date}`
                );
                delete holidayStaffingEntries[key];
            }
        }
    } catch (err) {
        console.error('Error saving holiday status:', err);
        showToast('Failed to save status', 'error');
    }
}

// Save all holiday staffing entries
async function saveAllHolidayStaffing() {
    showToast('All changes are auto-saved!', 'success');
}

// Export Holiday Summary to Excel
function exportHolidaySummary() {
    const table = document.getElementById('holidayStaffingTable');
    if (!table) {
        showToast('No data to export', 'error');
        return;
    }
    
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded', 'error');
        return;
    }
    
    // Clone table and replace dropdowns with their values
    const clonedTable = table.cloneNode(true);
    const selects = clonedTable.querySelectorAll('select');
    selects.forEach(select => {
        const value = select.value || '';
        const text = document.createTextNode(value);
        select.parentNode.replaceChild(text, select);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(clonedTable);
    XLSX.utils.book_append_sheet(wb, ws, 'Holiday Staffing');
    
    const startDate = document.getElementById('holidayStartDate')?.value || 'export';
    XLSX.writeFile(wb, `holiday_staffing_${startDate}.xlsx`);
    showToast('Exported successfully!', 'success');
}

// Store loaded holiday dates and support data
let loadedHolidayDates = [];
let loadedHolidaySupport = [];

// Load Holiday Support - Database driven
async function loadHolidaySupport() {
    const loadingEl = document.getElementById('holidaySupportLoading');
    const emptyEl = document.getElementById('holidaySupportEmpty');
    const contentEl = document.getElementById('holidaySupportContent');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    
    try {
        // Get current year
        const currentYear = new Date().getFullYear();
        
        // Load holiday dates for current/next year
        const datesResult = await supabaseRequest('holiday_dates', 'GET', null, 
            `?year=in.(${currentYear},${currentYear + 1})&order=holiday_date`);
        
        if (datesResult.error || !datesResult.data || datesResult.data.length === 0) {
            if (loadingEl) loadingEl.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        
        loadedHolidayDates = datesResult.data;
        
        // Load support assignments
        const supportResult = await supabaseRequest('holiday_support', 'GET', null, 
            `?order=application,team`);
        
        loadedHolidaySupport = supportResult.data || [];
        
        if (loadingEl) loadingEl.classList.add('hidden');
        if (contentEl) contentEl.classList.remove('hidden');
        
        // Render tables
        renderHolidaySupportFromDB('desk');
        renderHolidaySupportFromDB('call');
        
    } catch (err) {
        console.error('Error loading holiday support:', err);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
    }
}

// Render Holiday Support Table from Database
function renderHolidaySupportFromDB(type) {
    const headId = type === 'desk' ? 'deskSupportHead' : 'callSupportHead';
    const bodyId = type === 'desk' ? 'deskSupportBody' : 'callSupportBody';
    
    const headEl = document.getElementById(headId);
    const bodyEl = document.getElementById(bodyId);
    
    if (!headEl || !bodyEl) return;
    
    // Filter support data by type
    const typeData = loadedHolidaySupport.filter(s => s.support_type === type);
    
    // Build header with country tags
    let headerHtml = '<tr><th class="app-header">Application</th><th class="team-header">Team</th>';
    
    loadedHolidayDates.forEach(hd => {
        const dateObj = new Date(hd.holiday_date);
        const dateDisplay = `${dateObj.getDate()}-${dateObj.toLocaleDateString('en-US', { month: 'short' })}`;
        
        // Determine header class based on country
        let headerClass = 'ph-date';
        let countryLabel = hd.country;
        if (hd.country === 'AUS') headerClass = 'aus-date';
        else if (hd.country === 'India') headerClass = 'india-date';
        else if (hd.country === 'Lean Staffing') { headerClass = 'lean-date'; countryLabel = 'Lean Staffing'; }
        
        headerHtml += `<th class="${headerClass}"><span class="country-tag">${countryLabel}</span><br>${dateDisplay}</th>`;
    });
    headerHtml += '</tr>';
    
    headEl.innerHTML = headerHtml;
    
    // Group data by application and team
    const groupedData = {};
    typeData.forEach(item => {
        const key = `${item.application}|${item.team}`;
        if (!groupedData[key]) {
            groupedData[key] = { application: item.application, team: item.team, staffByDate: {} };
        }
        const hd = loadedHolidayDates.find(d => d.id === item.holiday_date_id);
        if (hd) {
            groupedData[key].staffByDate[hd.holiday_date] = item.staff_names;
        }
    });
    
    // Build body
    let bodyHtml = '';
    
    if (Object.keys(groupedData).length === 0) {
        bodyHtml = `<tr><td colspan="${loadedHolidayDates.length + 2}" style="text-align: center; padding: 2rem; color: #6b7280;">No ${type === 'desk' ? 'desk' : 'call'} support assignments yet. Click "Edit Schedule" to add.</td></tr>`;
    } else {
        Object.values(groupedData).forEach(row => {
            const appColor = APP_COLORS[row.application] || '#f0f0f0';
            
            bodyHtml += `<tr>`;
            bodyHtml += `<td class="app-col" style="background-color: ${appColor};">${escapeHtml(row.application)}</td>`;
            bodyHtml += `<td class="team-col" style="background-color: ${appColor};">${escapeHtml(row.team)}</td>`;
            
            loadedHolidayDates.forEach(hd => {
                const staff = row.staffByDate[hd.holiday_date] || '';
                bodyHtml += `<td class="staff-cell">${escapeHtml(staff)}</td>`;
            });
            
            bodyHtml += '</tr>';
        });
    }
    
    bodyEl.innerHTML = bodyHtml;
}

// Export Holiday Support
function exportHolidaySupport() {
    showToast('Export feature coming soon', 'info');
}

// ==================== HOLIDAY SCHEDULE MODAL FUNCTIONS ====================

// Open Edit Holiday Support Modal
function openEditHolidaySupportModal() {
    document.getElementById('holidayScheduleModal').classList.remove('hidden');
    loadHolidayDates();
    loadStaffAssignments();
    populateHolidayDateDropdown();
}

// Close Holiday Schedule Modal
function closeHolidayScheduleModal() {
    document.getElementById('holidayScheduleModal').classList.add('hidden');
    // Refresh the support table
    loadHolidaySupport();
}

// Switch tabs in the modal
function switchHolidayModalTab(tabName, event) {
    // Update tab buttons
    document.querySelectorAll('#holidayScheduleModal .modal-tab').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    // Hide all tab content
    document.getElementById('holidayDatesTab').classList.add('hidden');
    document.getElementById('holidayDatesTab').classList.remove('active');
    document.getElementById('holidayAssignmentsTab').classList.add('hidden');
    document.getElementById('holidayAssignmentsTab').classList.remove('active');
    
    // Show selected tab
    if (tabName === 'dates') {
        document.getElementById('holidayDatesTab').classList.remove('hidden');
        document.getElementById('holidayDatesTab').classList.add('active');
    } else {
        document.getElementById('holidayAssignmentsTab').classList.remove('hidden');
        document.getElementById('holidayAssignmentsTab').classList.add('active');
    }
}

// Load Holiday Dates into the table
async function loadHolidayDates() {
    // Populate year filter
    const yearFilter = document.getElementById('holidayDatesYearFilter');
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = `
        <option value="${currentYear}">${currentYear}</option>
        <option value="${currentYear + 1}">${currentYear + 1}</option>
    `;
    
    const selectedYear = yearFilter.value;
    
    try {
        const result = await supabaseRequest('holiday_dates', 'GET', null, 
            `?year=eq.${selectedYear}&order=holiday_date`);
        
        const tbody = document.getElementById('holidayDatesTableBody');
        
        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #6b7280;">No holiday dates for this year</td></tr>';
            return;
        }
        
        let html = '';
        result.data.forEach(hd => {
            const dateObj = new Date(hd.holiday_date);
            const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            
            html += `<tr>
                <td>${dateDisplay}</td>
                <td><span class="country-badge country-${hd.country.toLowerCase().replace(/\s+/g, '-')}">${hd.country}</span></td>
                <td>${escapeHtml(hd.holiday_name || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteHolidayDate(${hd.id})">Delete</button>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        
    } catch (err) {
        console.error('Error loading holiday dates:', err);
    }
}

// Add new holiday date
async function addHolidayDate() {
    const dateInput = document.getElementById('newHolidayDate');
    const countryInput = document.getElementById('newHolidayCountry');
    const nameInput = document.getElementById('newHolidayName');
    
    if (!dateInput.value || !countryInput.value) {
        showToast('Please fill in required fields', 'error');
        return;
    }
    
    const dateObj = new Date(dateInput.value);
    const year = dateObj.getFullYear();
    
    try {
        const result = await supabaseRequest('holiday_dates', 'POST', {
            holiday_date: dateInput.value,
            country: countryInput.value,
            holiday_name: nameInput.value || null,
            year: year
        });
        
        if (result.error) {
            showToast('Failed to add holiday date: ' + result.error, 'error');
            return;
        }
        
        showToast('Holiday date added!', 'success');
        
        // Clear form
        dateInput.value = '';
        countryInput.value = '';
        nameInput.value = '';
        
        // Reload table
        loadHolidayDates();
        populateHolidayDateDropdown();
        
    } catch (err) {
        console.error('Error adding holiday date:', err);
        showToast('Failed to add holiday date', 'error');
    }
}

// Delete holiday date
async function deleteHolidayDate(id) {
    if (!confirm('Delete this holiday date? All associated staff assignments will also be deleted.')) return;
    
    try {
        await supabaseRequest('holiday_dates', 'DELETE', null, `?id=eq.${id}`);
        showToast('Holiday date deleted', 'success');
        loadHolidayDates();
        populateHolidayDateDropdown();
    } catch (err) {
        console.error('Error deleting holiday date:', err);
        showToast('Failed to delete', 'error');
    }
}

// Populate holiday date dropdown for assignments
async function populateHolidayDateDropdown() {
    const dropdown = document.getElementById('assignmentHolidayDate');
    const currentYear = new Date().getFullYear();
    
    try {
        const result = await supabaseRequest('holiday_dates', 'GET', null, 
            `?year=in.(${currentYear},${currentYear + 1})&order=holiday_date`);
        
        dropdown.innerHTML = '<option value="">Select holiday date...</option>';
        
        if (result.data) {
            result.data.forEach(hd => {
                const dateObj = new Date(hd.holiday_date);
                const dateDisplay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dropdown.innerHTML += `<option value="${hd.id}">${dateDisplay} - ${hd.country}${hd.holiday_name ? ' (' + hd.holiday_name + ')' : ''}</option>`;
            });
        }
    } catch (err) {
        console.error('Error populating dropdown:', err);
    }
}

// Load staff assignments
async function loadStaffAssignments() {
    const typeFilter = document.getElementById('assignmentTypeFilter').value;
    
    let query = '?order=holiday_date_id,application,team';
    if (typeFilter) {
        query += `&support_type=eq.${typeFilter}`;
    }
    
    try {
        const result = await supabaseRequest('holiday_support', 'GET', null, query);
        const tbody = document.getElementById('assignmentsTableBody');
        
        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No assignments yet</td></tr>';
            return;
        }
        
        // Get holiday dates for display
        const datesResult = await supabaseRequest('holiday_dates', 'GET', null, '?order=holiday_date');
        const datesMap = {};
        if (datesResult.data) {
            datesResult.data.forEach(d => {
                const dateObj = new Date(d.holiday_date);
                datesMap[d.id] = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` (${d.country})`;
            });
        }
        
        let html = '';
        result.data.forEach(item => {
            html += `<tr>
                <td>${datesMap[item.holiday_date_id] || 'Unknown'}</td>
                <td>${item.support_type === 'desk' ? 'Desk' : 'Call'}</td>
                <td>${escapeHtml(item.application)}</td>
                <td>${escapeHtml(item.team)}</td>
                <td>${escapeHtml(item.staff_names || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="editAssignment(${item.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAssignment(${item.id})">Delete</button>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        
    } catch (err) {
        console.error('Error loading assignments:', err);
    }
}

// Save staff assignment
async function saveStaffAssignment() {
    const editId = document.getElementById('editAssignmentId').value;
    const holidayDateId = document.getElementById('assignmentHolidayDate').value;
    const supportType = document.getElementById('assignmentSupportType').value;
    const application = document.getElementById('assignmentApplication').value;
    const team = document.getElementById('assignmentTeam').value;
    const staffNames = document.getElementById('assignmentStaff').value;
    
    if (!holidayDateId || !supportType || !application || !team) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    const data = {
        holiday_date_id: parseInt(holidayDateId),
        support_type: supportType,
        application: application,
        team: team,
        staff_names: staffNames || null,
        updated_at: new Date().toISOString()
    };
    
    try {
        if (editId) {
            // Update existing
            await supabaseRequest('holiday_support', 'PATCH', data, `?id=eq.${editId}`);
            showToast('Assignment updated!', 'success');
        } else {
            // Insert new
            await supabaseRequest('holiday_support', 'POST', data);
            showToast('Assignment added!', 'success');
        }
        
        clearAssignmentForm();
        loadStaffAssignments();
        
    } catch (err) {
        console.error('Error saving assignment:', err);
        showToast('Failed to save assignment', 'error');
    }
}

// Edit assignment - load into form
async function editAssignment(id) {
    try {
        const result = await supabaseRequest('holiday_support', 'GET', null, `?id=eq.${id}`);
        
        if (result.data && result.data.length > 0) {
            const item = result.data[0];
            document.getElementById('editAssignmentId').value = id;
            document.getElementById('assignmentHolidayDate').value = item.holiday_date_id;
            document.getElementById('assignmentSupportType').value = item.support_type;
            document.getElementById('assignmentApplication').value = item.application;
            document.getElementById('assignmentTeam').value = item.team;
            document.getElementById('assignmentStaff').value = item.staff_names || '';
        }
    } catch (err) {
        console.error('Error loading assignment:', err);
    }
}

// Delete assignment
async function deleteAssignment(id) {
    if (!confirm('Delete this assignment?')) return;
    
    try {
        await supabaseRequest('holiday_support', 'DELETE', null, `?id=eq.${id}`);
        showToast('Assignment deleted', 'success');
        loadStaffAssignments();
    } catch (err) {
        console.error('Error deleting assignment:', err);
        showToast('Failed to delete', 'error');
    }
}

// Clear assignment form
function clearAssignmentForm() {
    document.getElementById('editAssignmentId').value = '';
    document.getElementById('assignmentHolidayDate').value = '';
    document.getElementById('assignmentSupportType').value = '';
    document.getElementById('assignmentApplication').value = '';
    document.getElementById('assignmentTeam').value = '';
    document.getElementById('assignmentStaff').value = '';
}

// ==================== EXCEL IMPORT FUNCTIONS ====================

let holidayExcelData = null;

// Handle Excel file selection
function handleHolidayExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('importExcelBtn').disabled = false;
    
    // Read the file
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            holidayExcelData = workbook;
            showToast('File loaded successfully!', 'success');
        } catch (err) {
            console.error('Error reading Excel file:', err);
            showToast('Error reading file. Please check the format.', 'error');
            holidayExcelData = null;
            document.getElementById('importExcelBtn').disabled = true;
        }
    };
    reader.readAsArrayBuffer(file);
}

// Import Holiday Excel data
async function importHolidayExcel() {
    if (!holidayExcelData) {
        showToast('Please select a file first', 'error');
        return;
    }
    
    try {
        // Get sheet names
        const sheetNames = holidayExcelData.SheetNames;
        console.log('Available sheets:', sheetNames);
        
        // Look for HOLIDAY STAFFING sheet specifically
        let supportSheet = null;
        let selectedSheetName = '';
        
        for (const name of sheetNames) {
            const lowerName = name.toLowerCase();
            // Look for "HOLIDAY STAFFING" or similar
            if (lowerName.includes('holiday staffing') || lowerName.includes('holiday_staffing')) {
                supportSheet = holidayExcelData.Sheets[name];
                selectedSheetName = name;
                break;
            }
        }
        
        // Fallback: look for any sheet with staffing, support, or holiday
        if (!supportSheet) {
            for (const name of sheetNames) {
                const lowerName = name.toLowerCase();
                if (lowerName.includes('staffing') || lowerName.includes('support') || lowerName.includes('holiday')) {
                    supportSheet = holidayExcelData.Sheets[name];
                    selectedSheetName = name;
                    break;
                }
            }
        }
        
        // Last fallback: use first sheet
        if (!supportSheet && sheetNames.length > 0) {
            supportSheet = holidayExcelData.Sheets[sheetNames[0]];
            selectedSheetName = sheetNames[0];
        }
        
        console.log('Using sheet:', selectedSheetName);
        
        let importedDates = 0;
        let importedAssignments = 0;
        
        if (!supportSheet) {
            showToast('Could not find a valid sheet to import', 'error');
            return;
        }
        
        // Parse and import support data (which includes dates)
        const result = await parseAndImportSupportSheet(supportSheet);
        importedDates = result.dates;
        importedAssignments = result.assignments;
        
        showToast(`Imported ${importedDates} holiday dates and ${importedAssignments} assignments!`, 'success');
        
        // Refresh the tables
        loadHolidayDates();
        loadStaffAssignments();
        populateHolidayDateDropdown();
        
        // Clear the file input
        document.getElementById('holidayExcelFile').value = '';
        document.getElementById('selectedFileName').textContent = '';
        document.getElementById('importExcelBtn').disabled = true;
        holidayExcelData = null;
        
    } catch (err) {
        console.error('Error importing Excel:', err);
        showToast('Error importing data: ' + err.message, 'error');
    }
}

// Parse and import support sheet
async function parseAndImportSupportSheet(sheet) {
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    
    console.log('Total rows:', jsonData.length);
    console.log('First 5 rows:', jsonData.slice(0, 5));
    
    if (jsonData.length < 3) {
        throw new Error('Sheet is empty or has insufficient data rows');
    }
    
    // This Excel has TWO header rows:
    // Row 0: "Application", "Team", "PH", "PH", "AUS", "AUS", "Lean Staffing"...
    // Row 1: empty, empty, date1, date2, date3, date4, date5...
    
    const countryRow = jsonData[0];
    const dateRow = jsonData[1];
    
    console.log('Country row:', countryRow);
    console.log('Date row:', dateRow);
    
    // Find Application and Team columns from row 0
    let appCol = -1;
    let teamCol = -1;
    
    countryRow.forEach((header, idx) => {
        if (!header) return;
        const h = String(header).toLowerCase().trim();
        if (h === 'application' || h === 'app') {
            appCol = idx;
        } else if (h === 'team') {
            teamCol = idx;
        }
    });
    
    // Default to columns 0 and 1 if not found
    if (appCol === -1) appCol = 0;
    if (teamCol === -1) teamCol = 1;
    
    console.log('App column:', appCol, 'Team column:', teamCol);
    
    // Build date columns from both rows
    const dateColumns = [];
    
    for (let col = teamCol + 1; col < Math.max(countryRow.length, dateRow.length); col++) {
        const countryVal = countryRow[col] ? String(countryRow[col]).trim() : '';
        const dateVal = dateRow[col] ? String(dateRow[col]).trim() : '';
        
        // Determine country
        let country = 'PH'; // default
        const countryLower = countryVal.toLowerCase();
        if (countryLower.includes('aus') || countryLower.includes('australia')) {
            country = 'AUS';
        } else if (countryLower.includes('india')) {
            country = 'India';
        } else if (countryLower.includes('lean')) {
            country = 'Lean Staffing';
        } else if (countryLower.includes('ph') || countryLower === 'ph') {
            country = 'PH';
        }
        
        // Parse the date
        let parsedDate = null;
        
        if (dateVal) {
            // Try Excel serial number first
            const serialNum = parseFloat(dateVal);
            if (!isNaN(serialNum) && serialNum > 1000 && serialNum < 60000) {
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
                parsedDate = date.toISOString().split('T')[0];
                console.log('Parsed Excel serial:', dateVal, '->', parsedDate);
            } else {
                // Try parsing as date string
                const dateInfo = parseDateHeader(dateVal);
                if (dateInfo) {
                    parsedDate = dateInfo.date;
                }
            }
        }
        
        if (parsedDate) {
            dateColumns.push({
                col: col,
                date: parsedDate,
                country: country,
                name: null
            });
            console.log('Date column:', col, 'Country:', country, 'Date:', parsedDate);
        }
    }
    
    console.log('Total date columns found:', dateColumns.length);
    
    // Create holiday dates first
    const dateIdMap = {};
    let importedDates = 0;
    
    for (const dateCol of dateColumns) {
        // Skip if no valid date
        if (!dateCol.date) {
            console.log('Skipping column with no parsed date:', dateCol);
            continue;
        }
        
        try {
            // Check if date already exists
            const existingResult = await supabaseRequest('holiday_dates', 'GET', null, 
                `?holiday_date=eq.${dateCol.date}&country=eq.${encodeURIComponent(dateCol.country)}`);
            
            console.log('Checking existing date:', dateCol.date, dateCol.country, existingResult);
            
            if (existingResult.data && existingResult.data.length > 0) {
                dateIdMap[dateCol.col] = existingResult.data[0].id;
                console.log('Using existing date ID:', existingResult.data[0].id);
            } else {
                // Create new date
                const newDate = {
                    holiday_date: dateCol.date,
                    country: dateCol.country,
                    holiday_name: dateCol.name || null,
                    year: new Date(dateCol.date).getFullYear()
                };
                console.log('Creating new date:', newDate);
                
                const result = await supabaseRequest('holiday_dates', 'POST', newDate);
                
                console.log('Create date result:', result);
                
                if (result.data && result.data.length > 0) {
                    dateIdMap[dateCol.col] = result.data[0].id;
                    importedDates++;
                    console.log('Created date with ID:', result.data[0].id);
                }
            }
        } catch (err) {
            console.error('Error creating date:', dateCol, err);
        }
    }
    
    console.log('Date ID map:', dateIdMap);
    
    // Determine support type from sheet name or data
    let supportType = 'desk'; // default
    const sheetName = sheet['!ref'] ? 'unknown' : '';
    
    // Import assignments - data starts from row 2
    let importedAssignments = 0;
    const startRow = 2;
    
    console.log('Starting assignment import from row:', startRow);
    
    // Track current application/team for merged cells
    let currentApp = '';
    let currentTeam = '';
    
    // First pass: collect all staff names per app/team/date (handling multi-row cells)
    const staffMap = {}; // key: "supportType|app|team|dateCol" -> array of names
    
    for (let rowIdx = startRow; rowIdx < jsonData.length; rowIdx++) {
        const row = jsonData[rowIdx];
        if (!row) continue;
        
        let rowApp = String(row[appCol] || '').trim();
        let rowTeam = String(row[teamCol] || '').trim();
        
        // Check if row indicates support type change
        const rowAppLower = rowApp.toLowerCase();
        if (rowAppLower.includes('desk support') || rowAppLower === 'on desk' || rowAppLower.includes('on desk')) {
            supportType = 'desk';
            currentApp = '';
            currentTeam = '';
            console.log('Switched to desk support at row', rowIdx);
            continue;
        } else if (rowAppLower.includes('call support') || rowAppLower === 'on call' || rowAppLower.includes('on call')) {
            supportType = 'call';
            currentApp = '';
            currentTeam = '';
            console.log('Switched to call support at row', rowIdx);
            continue;
        }
        
        // Handle merged cells - if app is empty but has team or data, use previous app
        if (!rowApp && (rowTeam || hasAnyData(row, dateColumns))) {
            rowApp = currentApp;
        } else if (rowApp) {
            currentApp = rowApp;
        }
        
        // Handle merged team cells
        if (!rowTeam && hasAnyData(row, dateColumns)) {
            rowTeam = currentTeam;
        } else if (rowTeam) {
            currentTeam = rowTeam;
        }
        
        console.log(`Row ${rowIdx}: App="${rowApp}", Team="${rowTeam}"`);
        
        // Skip if still no app/team
        if (!rowApp || !rowTeam) continue;
        
        // Collect staff names for each date
        for (const dateCol of dateColumns) {
            const staffName = String(row[dateCol.col] || '').trim();
            if (!staffName) continue;
            
            const key = `${supportType}|${rowApp}|${rowTeam}|${dateCol.col}`;
            if (!staffMap[key]) {
                staffMap[key] = [];
            }
            staffMap[key].push(staffName);
        }
    }
    
    console.log('Staff map keys:', Object.keys(staffMap).length);
    
    // Second pass: create/update assignments from staffMap
    for (const [key, staffArray] of Object.entries(staffMap)) {
        const [sType, app, team, colStr] = key.split('|');
        const col = parseInt(colStr);
        const holidayDateId = dateIdMap[col];
        
        if (!holidayDateId) {
            console.log('No date ID for column:', col);
            continue;
        }
        
        // Join all staff names
        const staffNames = staffArray.join(', ');
        
        try {
            // Check if assignment exists
            const existingResult = await supabaseRequest('holiday_support', 'GET', null,
                `?holiday_date_id=eq.${holidayDateId}&support_type=eq.${sType}&application=eq.${encodeURIComponent(app)}&team=eq.${encodeURIComponent(team)}`);
            
            if (existingResult.data && existingResult.data.length > 0) {
                // Update existing
                console.log('Updating existing assignment:', existingResult.data[0].id);
                await supabaseRequest('holiday_support', 'PATCH', {
                    staff_names: staffNames,
                    updated_at: new Date().toISOString()
                }, `?id=eq.${existingResult.data[0].id}`);
            } else {
                // Create new
                const newAssignment = {
                    holiday_date_id: holidayDateId,
                    support_type: sType,
                    application: app,
                    team: team,
                    staff_names: staffNames
                };
                console.log('Creating new assignment:', newAssignment);
                await supabaseRequest('holiday_support', 'POST', newAssignment);
                importedAssignments++;
            }
        } catch (err) {
            console.error('Error creating assignment:', key, err);
        }
    }
    
    console.log('Import complete. Dates:', importedDates, 'Assignments:', importedAssignments);
    return { dates: importedDates, assignments: importedAssignments };
}

// Helper to check if row has any data in date columns
function hasAnyData(row, dateColumns) {
    for (const dc of dateColumns) {
        if (row[dc.col] && String(row[dc.col]).trim()) {
            return true;
        }
    }
    return false;
}

// Parse date header (e.g., "PH\n8-Dec" or "8-Dec (PH)" or "25-Dec AUS" or Excel serial number)
function parseDateHeader(header) {
    if (!header) return null;
    
    let headerStr = String(header).trim();
    
    // Check if it's an Excel serial date number
    const serialNum = parseFloat(headerStr);
    if (!isNaN(serialNum) && serialNum > 40000 && serialNum < 60000) {
        // Excel serial date (days since 1900-01-01, with Excel bug for 1900)
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
        const dateFormatted = date.toISOString().split('T')[0];
        console.log('Parsed Excel serial date:', serialNum, '->', dateFormatted);
        return {
            date: dateFormatted,
            country: 'PH',
            name: null
        };
    }
    
    // Try to extract country tag
    let country = 'PH'; // default
    let dateStr = headerStr;
    
    // Check for country indicators
    const countryPatterns = [
        { pattern: /\bPH\b/i, country: 'PH' },
        { pattern: /\bAUS\b/i, country: 'AUS' },
        { pattern: /\bAustralia\b/i, country: 'AUS' },
        { pattern: /\bIndia\b/i, country: 'India' },
        { pattern: /\bLean\s*Staffing\b/i, country: 'Lean Staffing' },
        { pattern: /\bLean\b/i, country: 'Lean Staffing' }
    ];
    
    for (const cp of countryPatterns) {
        if (cp.pattern.test(headerStr)) {
            country = cp.country;
            dateStr = headerStr.replace(cp.pattern, '').trim();
            break;
        }
    }
    
    // Clean up date string
    dateStr = dateStr.replace(/[\n\r\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    
    console.log('Parsing date string:', dateStr, 'from header:', headerStr);
    
    // Try to parse date with various formats
    const months = {
        'jan': 0, 'january': 0,
        'feb': 1, 'february': 1,
        'mar': 2, 'march': 2,
        'apr': 3, 'april': 3,
        'may': 4,
        'jun': 5, 'june': 5,
        'jul': 6, 'july': 6,
        'aug': 7, 'august': 7,
        'sep': 8, 'sept': 8, 'september': 8,
        'oct': 9, 'october': 9,
        'nov': 10, 'november': 10,
        'dec': 11, 'december': 11
    };
    
    const dateFormats = [
        /(\d{1,2})[-\/\s]([A-Za-z]+)/,        // 8-Dec, 25/Dec, 8 Dec
        /([A-Za-z]+)[-\/\s](\d{1,2})/,        // Dec-8, Dec/25, Dec 8
        /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/, // 8/12/2026, 12-25-2026
        /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/, // 2026-12-25
        /(\d{1,2})[-\/](\d{1,2})/,            // 12/25, 8-12
    ];
    
    for (const format of dateFormats) {
        const match = dateStr.match(format);
        if (match) {
            let day, month, year = new Date().getFullYear();
            
            if (match.length === 3 && isNaN(parseInt(match[2]))) {
                // Format: 8-Dec
                day = parseInt(match[1]);
                const monthStr = match[2].toLowerCase();
                month = months[monthStr];
            } else if (match.length === 3 && isNaN(parseInt(match[1]))) {
                // Format: Dec-8
                day = parseInt(match[2]);
                const monthStr = match[1].toLowerCase();
                month = months[monthStr];
            } else if (match.length === 4 && match[1].length === 4) {
                // Format: 2026-12-25
                year = parseInt(match[1]);
                month = parseInt(match[2]) - 1;
                day = parseInt(match[3]);
            } else if (match.length === 4) {
                // Format: 8/12/2026 or 12-25-2026
                day = parseInt(match[1]);
                month = parseInt(match[2]) - 1;
                year = parseInt(match[3]);
                if (year < 100) year += 2000;
            } else if (match.length === 3 && !isNaN(parseInt(match[1])) && !isNaN(parseInt(match[2]))) {
                // Format: 12/25 (month/day)
                month = parseInt(match[1]) - 1;
                day = parseInt(match[2]);
            }
            
            if (day && month !== undefined && month >= 0 && month <= 11) {
                const date = new Date(year, month, day);
                const dateFormatted = date.toISOString().split('T')[0];
                
                console.log('Successfully parsed date:', dateStr, '->', dateFormatted);
                
                return {
                    date: dateFormatted,
                    country: country,
                    name: null
                };
            }
        }
    }
    
    console.log('Could not parse date from:', headerStr);
    return null;
}

// Download holiday template
function downloadHolidayTemplate(event) {
    event.preventDefault();
    
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded', 'error');
        return;
    }
    
    // Create sample data
    const sampleData = [
        ['Application', 'Team', 'PH\n8-Dec', 'PH\n24-Dec', 'AUS\n25-Dec', 'AUS\n26-Dec', 'Lean Staffing\n29-Dec'],
        ['ON DESK SUPPORT', '', '', '', '', '', ''],
        ['Frontend', 'ASOM/Fallout', 'Ganesh, Yash', 'Ganesh, Yash', '', '', 'Ganesh'],
        ['Frontend', 'OMS', 'India Team', 'India Team', '', '', ''],
        ['Frontend', 'CRM/SDP/MCO', 'Chirag, Pankaj', '', '', '', ''],
        ['Backend', 'INV/AMDD', 'India Team', 'Jerome', '', '', ''],
        ['Backend', 'TC/AEM/OFCA', 'Ganesh, Hendry', 'Ganesh', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['ON CALL SUPPORT', '', '', '', '', '', ''],
        ['Frontend', 'ASOM', 'Anurag, Yash', 'Anurag, Yash', '', '', ''],
        ['Frontend', 'OMS', 'Anurag, Bhomesh', 'Aditya', '', '', ''],
        ['Infra', 'Infra', 'Rohan', 'Sakshi', '', '', ''],
        ['MOD', 'Onshore', 'Mak', 'Vikram', '', '', ''],
        ['MOD', 'Offshore', 'Saurabh', 'Neil', '', '', ''],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    
    // Set column widths
    ws['!cols'] = [
        { width: 12 }, // Application
        { width: 15 }, // Team
        { width: 15 }, // Date 1
        { width: 15 }, // Date 2
        { width: 15 }, // Date 3
        { width: 15 }, // Date 4
        { width: 18 }, // Date 5
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holiday Support');
    
    XLSX.writeFile(wb, 'holiday_support_template.xlsx');
    showToast('Template downloaded!', 'success');
}

// Initialize Holiday Staffing when switching to it
document.addEventListener('DOMContentLoaded', function() {
    const originalSwitchMainScreen = window.switchMainScreen;
    if (originalSwitchMainScreen) {
        const newSwitchMainScreen = function(screen, clickEvent = null) {
            originalSwitchMainScreen(screen, clickEvent);
            
            if (screen === 'holiday') {
                loadHolidaySummary();
            }
        };
        window.switchMainScreen = newSwitchMainScreen;
    }
});
