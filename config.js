// Supabase Configuration
const SUPABASE_URL = 'https://yvbemhhnrgmccasifzey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2YmVtaGhucmdtY2Nhc2lmemV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODg3ODQsImV4cCI6MjA5NjY2NDc4NH0.I2nk7xpCoBewq3_anek_PjOjDW5VC__eIeYJDFSwN0M';

// Initialize Supabase client
let supabase = null;

function initSupabase() {
    if (window.supabase && window.supabase.createClient) {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase client initialized successfully');
            return true;
        } catch (e) {
            console.error('Failed to initialize Supabase:', e);
            return false;
        }
    }
    console.log('Supabase SDK not loaded');
    return false;
}

// Try to initialize on load
initSupabase();

// Check if Supabase is configured
function isSupabaseConfigured() {
    if (!supabase) initSupabase();
    return supabase !== null;
}

// Database helper functions
const db = {
    async getContacts() {
        if (!supabase) return null;
        const { data, error } = await supabase.from('contacts').select('*').order('team').order('area');
        if (error) { console.error('Error:', error); return null; }
        const grouped = {};
        data.forEach(c => {
            const team = c.team.toLowerCase();
            if (!grouped[team]) grouped[team] = [];
            grouped[team].push({ area: c.area||'', name: c.name||'', site: c.site||'', escalation: c.escalation||'', phone: c.phone||'', cpid: c.cpid||'', email: c.email||'', _id: c.id });
        });
        return grouped;
    },
    async saveContact(team, contact) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('contacts').insert({ team, area: contact.area, name: contact.name, site: contact.site, escalation: contact.escalation, phone: contact.phone, cpid: contact.cpid, email: contact.email }).select();
        return error ? null : data[0];
    },
    async updateContact(id, contact) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('contacts').update({ area: contact.area, name: contact.name, site: contact.site, escalation: contact.escalation, phone: contact.phone, cpid: contact.cpid, email: contact.email, updated_at: new Date().toISOString() }).eq('id', id).select();
        return error ? null : data[0];
    },
    async deleteContact(id) {
        if (!supabase) return false;
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        return !error;
    },
    async getEscalationMatrix() {
        if (!supabase) return null;
        const { data, error } = await supabase.from('escalation_matrix').select('*').order('app').order('area');
        if (error) return null;
        return data.map(r => ({ app: r.app, area: r.area, onCall: r.on_call||'', first: r.first_esc||'', second: r.second_esc||'', third: r.third_esc||'', fourth: r.fourth_esc||'', fifth: r.fifth_esc||'', firstAlert: r.first_alert||false, secondAlert: r.second_alert||false, _id: r.id }));
    },
    async saveEscalationEntry(entry) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('escalation_matrix').insert({ app: entry.app, area: entry.area, on_call: entry.onCall, first_esc: entry.first, second_esc: entry.second, third_esc: entry.third, fourth_esc: entry.fourth, fifth_esc: entry.fifth, first_alert: entry.firstAlert, second_alert: entry.secondAlert }).select();
        return error ? null : data[0];
    },
    async updateEscalationEntry(id, entry) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('escalation_matrix').update({ app: entry.app, area: entry.area, on_call: entry.onCall, first_esc: entry.first, second_esc: entry.second, third_esc: entry.third, fourth_esc: entry.fourth, fifth_esc: entry.fifth, first_alert: entry.firstAlert, second_alert: entry.secondAlert, updated_at: new Date().toISOString() }).eq('id', id).select();
        return error ? null : data[0];
    },
    async deleteEscalationEntry(id) {
        if (!supabase) return false;
        const { error } = await supabase.from('escalation_matrix').delete().eq('id', id);
        return !error;
    },
    async getRoster() {
        if (!supabase) return null;
        const { data, error } = await supabase.from('roster').select('*').order('sort_order');
        if (error) return null;
        return data.map(r => ({ time: r.time_shift, app: r.app, team: r.team, days: { mon: r.mon||'', tue: r.tue||'', wed: r.wed||'', thu: r.thu||'', fri: r.fri||'', sat: r.sat||'', sun: r.sun||'' }, _id: r.id }));
    },
    async saveRosterEntry(entry, sortOrder) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('roster').insert({ time_shift: entry.time, app: entry.app, team: entry.team, mon: entry.days.mon, tue: entry.days.tue, wed: entry.days.wed, thu: entry.days.thu, fri: entry.days.fri, sat: entry.days.sat, sun: entry.days.sun, sort_order: sortOrder }).select();
        return error ? null : data[0];
    },
    async updateRosterEntry(id, entry) {
        if (!supabase) return null;
        const { data, error } = await supabase.from('roster').update({ time_shift: entry.time, app: entry.app, team: entry.team, mon: entry.days.mon, tue: entry.days.tue, wed: entry.days.wed, thu: entry.days.thu, fri: entry.days.fri, sat: entry.days.sat, sun: entry.days.sun, updated_at: new Date().toISOString() }).eq('id', id).select();
        return error ? null : data[0];
    },
    async deleteRosterEntry(id) {
        if (!supabase) return false;
        const { error } = await supabase.from('roster').delete().eq('id', id);
        return !error;
    },
    async updateRosterOrder(orderedIds) {
        if (!supabase) return;
        for (let i = 0; i < orderedIds.length; i++) {
            await supabase.from('roster').update({ sort_order: i }).eq('id', orderedIds[i]);
        }
    }
};

// ==================== SYNC FUNCTION ====================
window.syncLocalStorageToDatabase = async function() {
    if (!initSupabase()) {
        console.error('Cannot sync: Supabase not available. Deploy to GitHub Pages first.');
        alert('Cannot sync: Supabase SDK not loaded.\n\nPlease deploy to GitHub Pages first, then run sync from the live URL.');
        return { success: false, message: 'Supabase not available' };
    }
    
    const results = { contacts: 0, escalation: 0, roster: 0, errors: [] };
    console.log('Starting sync from localStorage to Supabase...');
    
    // Sync Contacts
    try {
        const contactsData = localStorage.getItem('oncall_contacts_data');
        if (contactsData) {
            console.log('Syncing contacts...');
            const contacts = JSON.parse(contactsData);
            for (const [team, teamContacts] of Object.entries(contacts)) {
                for (const contact of teamContacts) {
                    const { error } = await supabase.from('contacts').insert({
                        team, area: contact.area||'', name: contact.name||'', site: contact.site||'',
                        escalation: contact.escalation||'', phone: contact.phone||'', cpid: contact.cpid||'', email: contact.email||''
                    });
                    if (!error) results.contacts++;
                    else results.errors.push('Contact: ' + error.message);
                }
            }
            console.log('Contacts synced:', results.contacts);
        }
    } catch (e) { results.errors.push('Contacts error: ' + e.message); }
    
    // Sync Escalation Matrix
    try {
        const escData = localStorage.getItem('escalation_matrix_data');
        if (escData) {
            console.log('Syncing escalation matrix...');
            for (const e of JSON.parse(escData)) {
                const { error } = await supabase.from('escalation_matrix').insert({
                    app: e.app||'', area: e.area||'', on_call: e.onCall||'', first_esc: e.first||'',
                    second_esc: e.second||'', third_esc: e.third||'', fourth_esc: e.fourth||'', fifth_esc: e.fifth||'',
                    first_alert: e.firstAlert||false, second_alert: e.secondAlert||false
                });
                if (!error) results.escalation++;
                else results.errors.push('Escalation: ' + error.message);
            }
            console.log('Escalation matrix synced:', results.escalation);
        }
    } catch (e) { results.errors.push('Escalation error: ' + e.message); }
    
    // Sync Roster
    try {
        const rosterData = localStorage.getItem('oncall_roster_data');
        if (rosterData) {
            console.log('Syncing roster...');
            const entries = JSON.parse(rosterData);
            for (let i = 0; i < entries.length; i++) {
                const r = entries[i];
                const { error } = await supabase.from('roster').insert({
                    time_shift: r.time||'', app: r.app||'', team: r.team||'',
                    mon: r.days?.mon||'', tue: r.days?.tue||'', wed: r.days?.wed||'', thu: r.days?.thu||'',
                    fri: r.days?.fri||'', sat: r.days?.sat||'', sun: r.days?.sun||'', sort_order: i
                });
                if (!error) results.roster++;
                else results.errors.push('Roster: ' + error.message);
            }
            console.log('Roster synced:', results.roster);
        }
    } catch (e) { results.errors.push('Roster error: ' + e.message); }
    
    console.log('=== SYNC COMPLETE ===');
    console.log('Contacts:', results.contacts);
    console.log('Escalation:', results.escalation);
    console.log('Roster:', results.roster);
    if (results.errors.length > 0) console.log('Errors:', results.errors);
    
    alert('Sync Complete!\n\nContacts: ' + results.contacts + '\nEscalation: ' + results.escalation + '\nRoster: ' + results.roster);
    return { success: true, results };
};

window.clearDatabaseTables = async function() {
    if (!initSupabase()) { alert('Supabase not available'); return false; }
    if (!confirm('DELETE ALL DATA from database?')) return false;
    await supabase.from('contacts').delete().neq('id', 0);
    await supabase.from('escalation_matrix').delete().neq('id', 0);
    await supabase.from('roster').delete().neq('id', 0);
    alert('Database cleared');
    return true;
};

console.log('Config.js loaded. Supabase:', supabase ? 'Ready' : 'Not available (deploy to GitHub Pages)');
