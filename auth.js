// ==================== Magic Link Authentication ====================
// Email-based authentication with magic links

// Authentication Mode
const AUTH_ENABLED = true; // Set to false to disable authentication

// Session duration (24 hours in milliseconds)
const SESSION_DURATION = 24 * 60 * 60 * 1000;

// Current user session
let currentUser = null;

// Initialize authentication on page load
function initializeAuth() {
    // If authentication is disabled, show app directly
    if (!AUTH_ENABLED) {
        console.log('Authentication disabled. Showing app directly.');
        showAppWithoutAuth();
        return;
    }
    
    // Check for magic link token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('authToken');
    
    if (authToken) {
        // Validate the magic link token
        validateMagicToken(authToken);
        return;
    }
    
    // Check for existing session
    const session = getStoredSession();
    if (session && session.expiresAt > Date.now()) {
        currentUser = session.user;
        // Ensure role is set (for backward compatibility with old sessions)
        if (!currentUser.role) {
            currentUser.role = 'manager';
        }
        showAuthenticatedApp();
        return;
    }
    
    // Clear expired session
    clearSession();
    
    // Show login screen
    showLoginScreen();
}

// Request magic link
async function requestMagicLink() {
    const emailInput = document.getElementById('loginEmail');
    const email = emailInput?.value?.trim();
    
    if (!email) {
        showLoginError('Please enter your email address.');
        return;
    }
    
    // Basic email validation
    if (!email.includes('@')) {
        showLoginError('Please enter a valid email address.');
        return;
    }
    
    showLoginLoading(true);
    hideLoginError();
    
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-magic-link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMagicLinkSent(email);
        } else {
            showLoginError(data.error || 'Failed to send sign-in link. Please try again.');
        }
    } catch (error) {
        console.error('Magic link request error:', error);
        showLoginError('Failed to send sign-in link. Please try again.');
    } finally {
        showLoginLoading(false);
    }
}

// Validate magic link token
async function validateMagicToken(token) {
    showLoginScreen();
    showLoginLoading(true);
    document.getElementById('loginFormContainer').classList.add('hidden');
    document.getElementById('loginLoadingText').textContent = 'Verifying your sign-in link...';
    
    try {
        // Validate token against database
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/auth_tokens?token=eq.${token}&used=eq.false&select=*`,
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Failed to validate token');
        }
        
        const tokens = await response.json();
        
        if (tokens.length === 0) {
            showLoginError('This sign-in link is invalid or has already been used.');
            showLoginLoading(false);
            document.getElementById('loginFormContainer').classList.remove('hidden');
            clearUrlParams();
            return;
        }
        
        const tokenData = tokens[0];
        
        // Check if token is expired
        if (new Date(tokenData.expires_at) < new Date()) {
            showLoginError('This sign-in link has expired. Please request a new one.');
            showLoginLoading(false);
            document.getElementById('loginFormContainer').classList.remove('hidden');
            clearUrlParams();
            return;
        }
        
        // Mark token as used
        await fetch(
            `${SUPABASE_URL}/rest/v1/auth_tokens?id=eq.${tokenData.id}`,
            {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ used: true })
            }
        );
        
        // Get role from token data (defaults to 'manager' for backward compatibility)
        const userRole = tokenData.role || 'manager';
        
        // Get user name - check managers first, then contacts
        let userName = tokenData.email.split('@')[0];
        
        if (userRole === 'manager') {
            const managerResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/managers?email=ilike.${encodeURIComponent(tokenData.email)}&select=*`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                }
            );
            const managers = await managerResponse.json();
            if (managers[0]?.name) userName = managers[0].name;
        } else {
            // Staff - get name from contacts
            const contactResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/contacts?email=ilike.${encodeURIComponent(tokenData.email)}&select=name`,
                {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    }
                }
            );
            const contacts = await contactResponse.json();
            if (contacts[0]?.name) userName = contacts[0].name;
        }
        
        // Create session with role
        currentUser = {
            email: tokenData.email,
            name: userName,
            role: userRole
        };
        
        // Store session
        storeSession(currentUser);
        
        // Clear URL params
        clearUrlParams();
        
        // Show app with role-based access
        showAuthenticatedApp();
        
    } catch (error) {
        console.error('Token validation error:', error);
        showLoginError('Failed to verify sign-in link. Please try again.');
        showLoginLoading(false);
        document.getElementById('loginFormContainer').classList.remove('hidden');
        clearUrlParams();
    }
}

// Clear URL parameters
function clearUrlParams() {
    const url = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', url);
}

// Store session in localStorage
function storeSession(user) {
    const session = {
        user: user,
        expiresAt: Date.now() + SESSION_DURATION
    };
    localStorage.setItem('mod_auth_session', JSON.stringify(session));
}

// Get stored session
function getStoredSession() {
    try {
        const sessionData = localStorage.getItem('mod_auth_session');
        return sessionData ? JSON.parse(sessionData) : null;
    } catch {
        return null;
    }
}

// Clear session
function clearSession() {
    localStorage.removeItem('mod_auth_session');
    currentUser = null;
}

// Sign out
function signOut() {
    clearSession();
    showLoginScreen();
    
    // Reset login form
    const emailInput = document.getElementById('loginEmail');
    if (emailInput) emailInput.value = '';
    
    document.getElementById('loginFormContainer')?.classList.remove('hidden');
    document.getElementById('magicLinkSent')?.classList.add('hidden');
    hideLoginError();
}

// Show authenticated app
function showAuthenticatedApp() {
    showLoginLoading(false);
    
    // Update user display
    const userName = currentUser?.name || currentUser?.email || 'User';
    const userRole = currentUser?.role || 'manager';
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (userNameEl) {
        userNameEl.textContent = userName;
    }
    
    if (userAvatarEl) {
        // Show initials
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        userAvatarEl.innerHTML = initials || '?';
        userAvatarEl.classList.add('has-initials');
    }
    
    // Hide login, show app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    // Apply role-based visibility
    applyRoleBasedAccess(userRole);
    
    console.log('User authenticated:', userName, '| Role:', userRole);
}

// Apply role-based access control
function applyRoleBasedAccess(role) {
    const isStaff = role === 'staff';
    
    // Elements to hide for staff (limited access)
    const managerOnlyElements = document.querySelectorAll('[data-role="manager"]');
    managerOnlyElements.forEach(el => {
        if (isStaff) {
            el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });
    
    // Add body class for role-based CSS
    document.body.classList.remove('role-manager', 'role-staff');
    document.body.classList.add(`role-${role}`);
    
    // For staff, auto-navigate to vacation requests
    if (isStaff) {
        // Navigate to vacation screen and requests tab
        setTimeout(() => {
            if (typeof switchScreen === 'function') {
                switchScreen('vacation');
            }
            // Switch to "My Requests" tab
            const myRequestsTab = document.querySelector('[onclick*="switchVacationTab"][onclick*="requests"]');
            if (myRequestsTab) {
                myRequestsTab.click();
            }
        }, 100);
    }
}

// Show login screen
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    showLoginLoading(false);
}

// Show app without auth (for development)
function showAppWithoutAuth() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = 'Development Mode';
    }
    
    console.log('Running in development mode (no authentication)');
}

// Show magic link sent message
function showMagicLinkSent(email) {
    document.getElementById('loginFormContainer').classList.add('hidden');
    document.getElementById('magicLinkSent').classList.remove('hidden');
    document.getElementById('sentToEmail').textContent = email;
}

// Back to email input
function backToEmailInput() {
    document.getElementById('magicLinkSent').classList.add('hidden');
    document.getElementById('loginFormContainer').classList.remove('hidden');
}

// UI Helpers
function showLoginLoading(show) {
    const loadingEl = document.getElementById('loginLoading');
    const buttonEl = document.getElementById('loginButton');
    
    if (loadingEl) {
        loadingEl.classList.toggle('hidden', !show);
    }
    if (buttonEl) {
        buttonEl.disabled = show;
        buttonEl.style.opacity = show ? '0.6' : '1';
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

function hideLoginError() {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
}

// Handle Enter key on email input
function handleEmailKeypress(event) {
    if (event.key === 'Enter') {
        requestMagicLink();
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
});

// Get current user info
function getCurrentUser() {
    return currentUser;
}

// Check if user is authenticated
function isAuthenticated() {
    return currentUser !== null;
}

// Get current user's role
function getUserRole() {
    return currentUser?.role || 'manager';
}

// Check if current user is a manager (full access)
function isManager() {
    return getUserRole() === 'manager';
}

// Check if current user is staff (limited access)
function isStaff() {
    return getUserRole() === 'staff';
}
