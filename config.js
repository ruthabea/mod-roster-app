// Supabase Configuration - Using REST API (no SDK needed)
const SUPABASE_URL = 'https://yvbemhhnrgmccasifzey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2YmVtaGhucmdtY2Nhc2lmemV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODg3ODQsImV4cCI6MjA5NjY2NDc4NH0.I2nk7xpCoBewq3_anek_PjOjDW5VC__eIeYJDFSwN0M';

// REST API helper
async function supabaseRequest(table, method = 'GET', data = null, query = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const options = {
        method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
        }
    };
    if (data) options.body = JSON.stringify(data);
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const err = await response.text();
            console.error(`Supabase ${method} ${table} error:`, err);
            return { error: err, data: null };
        }
        const result = method === 'DELETE' ? null : await response.json();
        return { data: result, error: null };
    } catch (e) {
        console.error('Fetch error:', e);
        return { error: e.message, data: null };
    }
}

// Check if Supabase is configured
function isSupabaseConfigured() {
    return SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL';
}

// Database helper functions using REST API
const db = {
    async getContacts() {
        const { data, error } = await supabaseRequest('contacts', 'GET', null, '?order=team,area');
        if (error || !data) return null;
        const grouped = {};
        data.forEach(c => {
            const team = c.team.toLowerCase();
            if (!grouped[team]) grouped[team] = [];
            grouped[team].push({ area: c.area||'', name: c.name||'', site: c.site||'', escalation: c.escalation||'', phone: c.phone||'', cpid: c.cpid||'', email: c.email||'', _id: c.id });
        });
        return grouped;
    },
    async saveContact(team, contact) {
        const { data, error } = await supabaseRequest('contacts', 'POST', { team, area: contact.area, name: contact.name, site: contact.site, escalation: contact.escalation, phone: contact.phone, cpid: contact.cpid, email: contact.email });
        return error ? null : data[0];
    },
    async updateContact(id, contact) {
        const { data, error } = await supabaseRequest('contacts', 'PATCH', { area: contact.area, name: contact.name, site: contact.site, escalation: contact.escalation, phone: contact.phone, cpid: contact.cpid, email: contact.email }, `?id=eq.${id}`);
        return error ? null : data;
    },
    async deleteContact(id) {
        const { error } = await supabaseRequest('contacts', 'DELETE', null, `?id=eq.${id}`);
        return !error;
    },
    async getEscalationMatrix() {
        const { data, error } = await supabaseRequest('escalation_matrix', 'GET', null, '?order=app,area');
        if (error || !data) return null;
        return data.map(r => ({ app: r.app, area: r.area, onCall: r.on_call||'', first: r.first_esc||'', second: r.second_esc||'', third: r.third_esc||'', fourth: r.fourth_esc||'', fifth: r.fifth_esc||'', firstAlert: r.first_alert||false, secondAlert: r.second_alert||false, _id: r.id }));
    },
    async saveEscalationEntry(entry) {
        const { data, error } = await supabaseRequest('escalation_matrix', 'POST', { app: entry.app, area: entry.area, on_call: entry.onCall, first_esc: entry.first, second_esc: entry.second, third_esc: entry.third, fourth_esc: entry.fourth, fifth_esc: entry.fifth, first_alert: entry.firstAlert, second_alert: entry.secondAlert });
        return error ? null : data[0];
    },
    async updateEscalationEntry(id, entry) {
        const { data, error } = await supabaseRequest('escalation_matrix', 'PATCH', { app: entry.app, area: entry.area, on_call: entry.onCall, first_esc: entry.first, second_esc: entry.second, third_esc: entry.third, fourth_esc: entry.fourth, fifth_esc: entry.fifth, first_alert: entry.firstAlert, second_alert: entry.secondAlert }, `?id=eq.${id}`);
        return error ? null : data;
    },
    async deleteEscalationEntry(id) {
        const { error } = await supabaseRequest('escalation_matrix', 'DELETE', null, `?id=eq.${id}`);
        return !error;
    },
    async getRoster() {
        const { data, error } = await supabaseRequest('roster', 'GET', null, '?order=sort_order');
        if (error || !data) return null;
        return data.map(r => ({ time: r.time_shift, app: r.app, team: r.team, days: { mon: r.mon||'', tue: r.tue||'', wed: r.wed||'', thu: r.thu||'', fri: r.fri||'', sat: r.sat||'', sun: r.sun||'' }, _id: r.id }));
    },
    async saveRosterEntry(entry, sortOrder) {
        const { data, error } = await supabaseRequest('roster', 'POST', { time_shift: entry.time, app: entry.app, team: entry.team, mon: entry.days.mon, tue: entry.days.tue, wed: entry.days.wed, thu: entry.days.thu, fri: entry.days.fri, sat: entry.days.sat, sun: entry.days.sun, sort_order: sortOrder });
        return error ? null : data[0];
    },
    async updateRosterEntry(id, entry) {
        const { data, error } = await supabaseRequest('roster', 'PATCH', { time_shift: entry.time, app: entry.app, team: entry.team, mon: entry.days.mon, tue: entry.days.tue, wed: entry.days.wed, thu: entry.days.thu, fri: entry.days.fri, sat: entry.days.sat, sun: entry.days.sun }, `?id=eq.${id}`);
        return error ? null : data;
    },
    async deleteRosterEntry(id) {
        const { error } = await supabaseRequest('roster', 'DELETE', null, `?id=eq.${id}`);
        return !error;
    },
    async updateRosterOrder(orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await supabaseRequest('roster', 'PATCH', { sort_order: i }, `?id=eq.${orderedIds[i]}`);
        }
    }
};

// ==================== SYNC FUNCTION ====================
window.syncLocalStorageToDatabase = async function() {
    console.log('Starting sync from localStorage to Supabase...');
    const results = { contacts: 0, escalation: 0, roster: 0, errors: [] };
    
    // Test connection first
    const test = await supabaseRequest('contacts', 'GET', null, '?limit=1');
    if (test.error) {
        console.error('Connection test failed:', test.error);
        alert('Database connection failed. Make sure tables are created in Supabase.\n\nError: ' + test.error);
        return { success: false, error: test.error };
    }
    console.log('Connection OK!');
    
    // Sync Contacts
    try {
        const contactsData = localStorage.getItem('oncall_contacts_data');
        if (contactsData) {
            console.log('Syncing contacts...');
            const contacts = JSON.parse(contactsData);
            for (const [team, teamContacts] of Object.entries(contacts)) {
                for (const contact of teamContacts) {
                    const { error } = await supabaseRequest('contacts', 'POST', {
                        team, area: contact.area||'', name: contact.name||'', site: contact.site||'',
                        escalation: contact.escalation||'', phone: contact.phone||'', cpid: contact.cpid||'', email: contact.email||''
                    });
                    if (!error) results.contacts++;
                    else results.errors.push('Contact: ' + error);
                }
            }
            console.log('Contacts synced:', results.contacts);
        }
    } catch (e) { console.error(e); results.errors.push('Contacts: ' + e.message); }
    
    // Sync Escalation Matrix
    try {
        const escData = localStorage.getItem('escalation_matrix_data');
        if (escData) {
            console.log('Syncing escalation matrix...');
            for (const e of JSON.parse(escData)) {
                const { error } = await supabaseRequest('escalation_matrix', 'POST', {
                    app: e.app||'', area: e.area||'', on_call: e.onCall||'', first_esc: e.first||'',
                    second_esc: e.second||'', third_esc: e.third||'', fourth_esc: e.fourth||'', fifth_esc: e.fifth||'',
                    first_alert: e.firstAlert||false, second_alert: e.secondAlert||false
                });
                if (!error) results.escalation++;
                else results.errors.push('Escalation: ' + error);
            }
            console.log('Escalation synced:', results.escalation);
        }
    } catch (e) { console.error(e); results.errors.push('Escalation: ' + e.message); }
    
    // Sync Roster
    try {
        const rosterData = localStorage.getItem('oncall_roster_data');
        if (rosterData) {
            console.log('Syncing roster...');
            const entries = JSON.parse(rosterData);
            for (let i = 0; i < entries.length; i++) {
                const r = entries[i];
                const { error } = await supabaseRequest('roster', 'POST', {
                    time_shift: r.time||'', app: r.app||'', team: r.team||'',
                    mon: r.days?.mon||'', tue: r.days?.tue||'', wed: r.days?.wed||'', thu: r.days?.thu||'',
                    fri: r.days?.fri||'', sat: r.days?.sat||'', sun: r.days?.sun||'', sort_order: i
                });
                if (!error) results.roster++;
                else results.errors.push('Roster: ' + error);
            }
            console.log('Roster synced:', results.roster);
        }
    } catch (e) { console.error(e); results.errors.push('Roster: ' + e.message); }
    
    console.log('=== SYNC COMPLETE ===', results);
    alert('Sync Complete!\n\nContacts: ' + results.contacts + '\nEscalation: ' + results.escalation + '\nRoster: ' + results.roster + 
          (results.errors.length ? '\n\nErrors: ' + results.errors.length : ''));
    return { success: true, results };
};

window.clearDatabaseTables = async function() {
    if (!confirm('DELETE ALL DATA from database?')) return false;
    await supabaseRequest('contacts', 'DELETE', null, '?id=gt.0');
    await supabaseRequest('escalation_matrix', 'DELETE', null, '?id=gt.0');
    await supabaseRequest('roster', 'DELETE', null, '?id=gt.0');
    alert('Database cleared');
    return true;
};

console.log('Config.js loaded - Using REST API (no SDK needed)');
console.log('Supabase configured:', isSupabaseConfigured());
