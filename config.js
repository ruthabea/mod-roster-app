// Supabase Configuration
const SUPABASE_URL = 'https://yvbemhhnrgmccasifzey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2YmVtaGhucmdtY2Nhc2lmemV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODg3ODQsImV4cCI6MjA5NjY2NDc4NH0.I2nk7xpCoBewq3_anek_PjOjDW5VC__eIeYJDFSwN0M';

// Initialize Supabase client
let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully');
} catch (e) {
    console.error('Failed to initialize Supabase:', e);
    supabase = null;
}

// Database helper functions
const db = {
    // ==================== CONTACTS ====================
    async getContacts() {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .order('team', { ascending: true })
            .order('area', { ascending: true });
        
        if (error) {
            console.error('Error fetching contacts:', error);
            return null;
        }
        
        // Group by team
        const grouped = {};
        data.forEach(contact => {
            const team = contact.team.toLowerCase();
            if (!grouped[team]) grouped[team] = [];
            grouped[team].push({
                area: contact.area || '',
                name: contact.name || '',
                site: contact.site || '',
                escalation: contact.escalation || '',
                phone: contact.phone || '',
                cpid: contact.cpid || '',
                email: contact.email || '',
                _id: contact.id
            });
        });
        
        return grouped;
    },
    
    async saveContact(team, contact) {
        const { data, error } = await supabase
            .from('contacts')
            .insert({
                team: team,
                area: contact.area,
                name: contact.name,
                site: contact.site,
                escalation: contact.escalation,
                phone: contact.phone,
                cpid: contact.cpid,
                email: contact.email
            })
            .select();
        
        if (error) {
            console.error('Error saving contact:', error);
            return null;
        }
        return data[0];
    },
    
    async updateContact(id, contact) {
        const { data, error } = await supabase
            .from('contacts')
            .update({
                area: contact.area,
                name: contact.name,
                site: contact.site,
                escalation: contact.escalation,
                phone: contact.phone,
                cpid: contact.cpid,
                email: contact.email,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Error updating contact:', error);
            return null;
        }
        return data[0];
    },
    
    async deleteContact(id) {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Error deleting contact:', error);
            return false;
        }
        return true;
    },
    
    // ==================== ESCALATION MATRIX ====================
    async getEscalationMatrix() {
        const { data, error } = await supabase
            .from('escalation_matrix')
            .select('*')
            .order('app', { ascending: true })
            .order('area', { ascending: true });
        
        if (error) {
            console.error('Error fetching escalation matrix:', error);
            return null;
        }
        
        return data.map(row => ({
            app: row.app,
            area: row.area,
            onCall: row.on_call || '',
            first: row.first_esc || '',
            second: row.second_esc || '',
            third: row.third_esc || '',
            fourth: row.fourth_esc || '',
            fifth: row.fifth_esc || '',
            firstAlert: row.first_alert || false,
            secondAlert: row.second_alert || false,
            _id: row.id
        }));
    },
    
    async saveEscalationEntry(entry) {
        const { data, error } = await supabase
            .from('escalation_matrix')
            .insert({
                app: entry.app,
                area: entry.area,
                on_call: entry.onCall,
                first_esc: entry.first,
                second_esc: entry.second,
                third_esc: entry.third,
                fourth_esc: entry.fourth,
                fifth_esc: entry.fifth,
                first_alert: entry.firstAlert,
                second_alert: entry.secondAlert
            })
            .select();
        
        if (error) {
            console.error('Error saving escalation entry:', error);
            return null;
        }
        return data[0];
    },
    
    async updateEscalationEntry(id, entry) {
        const { data, error } = await supabase
            .from('escalation_matrix')
            .update({
                app: entry.app,
                area: entry.area,
                on_call: entry.onCall,
                first_esc: entry.first,
                second_esc: entry.second,
                third_esc: entry.third,
                fourth_esc: entry.fourth,
                fifth_esc: entry.fifth,
                first_alert: entry.firstAlert,
                second_alert: entry.secondAlert,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Error updating escalation entry:', error);
            return null;
        }
        return data[0];
    },
    
    async deleteEscalationEntry(id) {
        const { error } = await supabase
            .from('escalation_matrix')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Error deleting escalation entry:', error);
            return false;
        }
        return true;
    },
    
    // ==================== ROSTER ====================
    async getRoster() {
        const { data, error } = await supabase
            .from('roster')
            .select('*')
            .order('sort_order', { ascending: true });
        
        if (error) {
            console.error('Error fetching roster:', error);
            return null;
        }
        
        return data.map(row => ({
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
            _id: row.id
        }));
    },
    
    async saveRosterEntry(entry, sortOrder = 0) {
        const { data, error } = await supabase
            .from('roster')
            .insert({
                time_shift: entry.time,
                app: entry.app,
                team: entry.team,
                mon: entry.days.mon,
                tue: entry.days.tue,
                wed: entry.days.wed,
                thu: entry.days.thu,
                fri: entry.days.fri,
                sat: entry.days.sat,
                sun: entry.days.sun,
                sort_order: sortOrder
            })
            .select();
        
        if (error) {
            console.error('Error saving roster entry:', error);
            return null;
        }
        return data[0];
    },
    
    async updateRosterEntry(id, entry) {
        const { data, error } = await supabase
            .from('roster')
            .update({
                time_shift: entry.time,
                app: entry.app,
                team: entry.team,
                mon: entry.days.mon,
                tue: entry.days.tue,
                wed: entry.days.wed,
                thu: entry.days.thu,
                fri: entry.days.fri,
                sat: entry.days.sat,
                sun: entry.days.sun,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Error updating roster entry:', error);
            return null;
        }
        return data[0];
    },
    
    async deleteRosterEntry(id) {
        const { error } = await supabase
            .from('roster')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Error deleting roster entry:', error);
            return false;
        }
        return true;
    },
    
    async updateRosterOrder(orderedIds) {
        const updates = orderedIds.map((id, index) => 
            supabase
                .from('roster')
                .update({ sort_order: index })
                .eq('id', id)
        );
        
        await Promise.all(updates);
    }
};

// Check if Supabase is configured
function isSupabaseConfigured() {
    return supabase !== null && 
           SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' && 
           SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// ==================== SYNC LOCAL STORAGE TO DATABASE ====================
async function syncLocalStorageToDatabase() {
    if (!isSupabaseConfigured()) {
        console.error('Supabase is not configured');
        return { success: false, message: 'Supabase not configured' };
    }
    
    const results = {
        contacts: { synced: 0, errors: 0 },
        escalation: { synced: 0, errors: 0 },
        roster: { synced: 0, errors: 0 }
    };
    
    console.log('Starting sync from localStorage to Supabase...');
    
    // 1. Sync Contacts
    const contactsData = localStorage.getItem('oncall_contacts_data');
    if (contactsData) {
        console.log('Syncing contacts...');
        const contacts = JSON.parse(contactsData);
        for (const [team, teamContacts] of Object.entries(contacts)) {
            for (const contact of teamContacts) {
                try {
                    const { error } = await supabase.from('contacts').insert({
                        team: team,
                        area: contact.area || '',
                        name: contact.name || '',
                        site: contact.site || '',
                        escalation: contact.escalation || '',
                        phone: contact.phone || '',
                        cpid: contact.cpid || '',
                        email: contact.email || ''
                    });
                    if (error) {
                        console.error('Contact sync error:', error);
                        results.contacts.errors++;
                    } else {
                        results.contacts.synced++;
                    }
                } catch (e) {
                    console.error('Contact sync exception:', e);
                    results.contacts.errors++;
                }
            }
        }
        console.log(`Contacts: ${results.contacts.synced} synced, ${results.contacts.errors} errors`);
    }
    
    // 2. Sync Escalation Matrix
    const escalationData = localStorage.getItem('escalation_matrix_data');
    if (escalationData) {
        console.log('Syncing escalation matrix...');
        const entries = JSON.parse(escalationData);
        for (const entry of entries) {
            try {
                const { error } = await supabase.from('escalation_matrix').insert({
                    app: entry.app || '',
                    area: entry.area || '',
                    on_call: entry.onCall || '',
                    first_esc: entry.first || '',
                    second_esc: entry.second || '',
                    third_esc: entry.third || '',
                    fourth_esc: entry.fourth || '',
                    fifth_esc: entry.fifth || '',
                    first_alert: entry.firstAlert || false,
                    second_alert: entry.secondAlert || false
                });
                if (error) {
                    console.error('Escalation sync error:', error);
                    results.escalation.errors++;
                } else {
                    results.escalation.synced++;
                }
            } catch (e) {
                console.error('Escalation sync exception:', e);
                results.escalation.errors++;
            }
        }
        console.log(`Escalation: ${results.escalation.synced} synced, ${results.escalation.errors} errors`);
    }
    
    // 3. Sync Roster
    const rosterData = localStorage.getItem('oncall_roster_data');
    if (rosterData) {
        console.log('Syncing roster...');
        const entries = JSON.parse(rosterData);
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            try {
                const { error } = await supabase.from('roster').insert({
                    time_shift: entry.time || '',
                    app: entry.app || '',
                    team: entry.team || '',
                    mon: entry.days?.mon || '',
                    tue: entry.days?.tue || '',
                    wed: entry.days?.wed || '',
                    thu: entry.days?.thu || '',
                    fri: entry.days?.fri || '',
                    sat: entry.days?.sat || '',
                    sun: entry.days?.sun || '',
                    sort_order: i
                });
                if (error) {
                    console.error('Roster sync error:', error);
                    results.roster.errors++;
                } else {
                    results.roster.synced++;
                }
            } catch (e) {
                console.error('Roster sync exception:', e);
                results.roster.errors++;
            }
        }
        console.log(`Roster: ${results.roster.synced} synced, ${results.roster.errors} errors`);
    }
    
    console.log('Sync complete!', results);
    return { success: true, results };
}

// Function to clear database tables (use with caution)
async function clearDatabaseTables() {
    if (!isSupabaseConfigured()) {
        console.error('Supabase is not configured');
        return false;
    }
    
    if (!confirm('This will DELETE ALL DATA from the database. Are you sure?')) {
        return false;
    }
    
    console.log('Clearing database tables...');
    
    await supabase.from('contacts').delete().neq('id', 0);
    await supabase.from('escalation_matrix').delete().neq('id', 0);
    await supabase.from('roster').delete().neq('id', 0);
    
    console.log('Database tables cleared');
    return true;
}

// Make sync function available globally
window.syncLocalStorageToDatabase = syncLocalStorageToDatabase;
window.clearDatabaseTables = clearDatabaseTables;
