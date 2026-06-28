// ==================== Microsoft Azure AD Authentication ====================
// Using MSAL.js (Microsoft Authentication Library)

let msalInstance = null;
let currentUser = null;

// Initialize MSAL on page load
function initializeMsal() {
    try {
        if (typeof msal === 'undefined') {
            console.error('MSAL library not loaded');
            showLoginError('Authentication library failed to load. Please refresh the page.');
            return false;
        }
        
        // Check if tenant ID is configured
        if (MS_AUTH_TENANT_ID === 'YOUR_TENANT_ID_HERE') {
            console.warn('Azure AD Tenant ID not configured. Authentication disabled.');
            // For development: auto-show app without auth
            showAppWithoutAuth();
            return false;
        }
        
        msalInstance = new msal.PublicClientApplication(msalConfig);
        
        // Handle redirect response
        msalInstance.handleRedirectPromise()
            .then(handleResponse)
            .catch(error => {
                console.error('Redirect error:', error);
                showLoginError('Authentication error. Please try again.');
            });
        
        return true;
    } catch (error) {
        console.error('MSAL initialization error:', error);
        showLoginError('Failed to initialize authentication.');
        return false;
    }
}

// Handle authentication response
async function handleResponse(response) {
    if (response) {
        // User just logged in via redirect
        currentUser = response.account;
        await showAuthenticatedApp();
    } else {
        // Check if user is already logged in
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            currentUser = accounts[0];
            await showAuthenticatedApp();
        } else {
            // Show login screen
            showLoginScreen();
        }
    }
}

// Sign in with Microsoft
async function signIn() {
    if (!msalInstance) {
        showLoginError('Authentication not initialized. Please refresh the page.');
        return;
    }
    
    showLoginLoading(true);
    hideLoginError();
    
    try {
        // Try popup first, fall back to redirect
        const response = await msalInstance.loginPopup(loginRequest);
        currentUser = response.account;
        await showAuthenticatedApp();
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.errorCode === 'popup_window_error' || error.errorCode === 'empty_window_error') {
            // Popup blocked, try redirect
            try {
                await msalInstance.loginRedirect(loginRequest);
            } catch (redirectError) {
                console.error('Redirect error:', redirectError);
                showLoginError('Login failed. Please check your popup blocker and try again.');
            }
        } else if (error.errorCode === 'user_cancelled') {
            showLoginError('Login cancelled.');
        } else {
            showLoginError('Login failed: ' + (error.message || 'Unknown error'));
        }
        showLoginLoading(false);
    }
}

// Sign out
function signOut() {
    if (!msalInstance) return;
    
    const logoutRequest = {
        account: currentUser,
        postLogoutRedirectUri: MS_AUTH_REDIRECT_URI
    };
    
    msalInstance.logoutPopup(logoutRequest)
        .then(() => {
            currentUser = null;
            showLoginScreen();
        })
        .catch(error => {
            console.error('Logout error:', error);
            // Force logout anyway
            currentUser = null;
            showLoginScreen();
        });
}

// Show authenticated app
async function showAuthenticatedApp() {
    showLoginLoading(false);
    
    // Update user display
    const userName = currentUser?.name || currentUser?.username || 'User';
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (userNameEl) {
        userNameEl.textContent = userName;
    }
    
    if (userAvatarEl && currentUser?.name) {
        // Show initials
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        userAvatarEl.innerHTML = initials;
        userAvatarEl.classList.add('has-initials');
    }
    
    // Verify user is authorized (check against managers table)
    const isAuthorized = await checkUserAuthorization(currentUser?.username);
    
    if (!isAuthorized) {
        showLoginError('Access denied. You are not authorized to access this application.');
        signOut();
        return;
    }
    
    // Hide login, show app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    console.log('User authenticated:', userName);
}

// Check if user is authorized (exists in managers table)
async function checkUserAuthorization(email) {
    if (!email) return false;
    
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/managers?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            console.error('Authorization check failed');
            return true; // Allow access if check fails (fail open for now)
        }
        
        const data = await response.json();
        return data.length > 0;
    } catch (error) {
        console.error('Authorization check error:', error);
        return true; // Allow access if check fails
    }
}

// Show login screen
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    showLoginLoading(false);
}

// Show app without auth (for development when tenant ID not configured)
function showAppWithoutAuth() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    // Set default user
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = 'Development Mode';
    }
    
    console.log('Running in development mode (no authentication)');
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    initializeMsal();
});

// Get current user info
function getCurrentUser() {
    return currentUser;
}

// Check if user is authenticated
function isAuthenticated() {
    return currentUser !== null;
}
