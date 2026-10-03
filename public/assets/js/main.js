import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { auth, db } from './firebase.js';
import { customers } from './features/customers.js';
import { calendarDateRange, filterRecordsByCalendar } from './features/calendar-filter.js';
import { expenseCategories, expenses } from './features/expenses.js';
import { paymentMethodCardsMarkup, paymentMethods, payments, summarizePaymentMethods } from './features/payments.js';
import { products } from './features/products.js';
import { purchases } from './features/purchases.js';
import { renderReports } from './features/reports.js';

const authScreen = document.querySelector('#auth-screen');
const appScreen = document.querySelector('#app-screen');
const viewContainer = document.querySelector('#view-container');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');

const actionIconObserver = new MutationObserver(() => {
    viewContainer.querySelectorAll('.row-actions button').forEach((button) => {
        const label = button.textContent.trim();
        if (!['Edit', 'Delete'].includes(label)) return;
        const deleting = label === 'Delete';
        button.classList.add('icon-action');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = deleting
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/></svg>';
    });
});
actionIconObserver.observe(viewContainer, { childList: true, subtree: true });

const state = { user: null, profile: null, view: 'dashboard', records: {}, customerProductData: [], customerPlanData: [], customerCatalogFilter: 'all', customerRecordData: null, customerPurchaseRows: null, customerContacts: [], customerAccounts: [], registeredUsers: null, registeredUserSearch: '', registeredUserStatus: 'all', registeredUserPeriod: 'all', registeredUserDate: localDateInputValue(new Date()), customerRecordFilter: 'all', customerRecordSearch: '', recordSelection: { collection: '', ids: new Set(), active: false } };
let portalMode = 'customer';
let pendingAuthError = '';
let profileProvisioning = null;
let dashboardCharts = [];
let customerRecordCharts = [];
const profileAvatarChoices = [
    { id: 'mint', label: 'Mint' },
    { id: 'ocean', label: 'Ocean' },
    { id: 'coral', label: 'Coral' },
    { id: 'sunshine', label: 'Sunshine' },
    { id: 'forest', label: 'Forest' },
    { id: 'berry', label: 'Berry' }
];

const definitions = {
    customers,
    products,
    expenses,
    purchases,
    payments,
    users: {
        title: 'Admin accounts', description: 'Create staff or admin sign-ins and assign workspace roles. Passwords are never displayed.',
        columns: [['fullName', 'Name'], ['email', 'Email'], ['role', 'Role'], ['status', 'Status'], ['createdAt', 'Created']],
        fields: []
    }
};

const titles = {
    dashboard: 'Dashboard', customers: 'Customers', products: 'Products & services',
    purchases: 'Purchase Transactions', payments: 'Payments', expenses: 'Expenses', reports: 'Reports', users: 'User Management', 'customer-accounts': 'Customer accounts',
    'customer-dashboard': 'Customer overview', catalog: 'My plan purchase', 'my-purchases': 'Purchase Transactions', transactions: 'Transactions', 'customer-profile': 'Personal information', 'customer-payments': 'Payments', 'customer-payment-report': 'Payment summary', 'customer-expenses': 'My expenses', 'customer-records': 'All records', 'customer-contacts': 'My customers'
};

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function money(value) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);
}

function shortDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? escapeHtml(value) : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function notify(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    toastRoot.append(toast);
    window.setTimeout(() => toast.remove(), 3800);
}

function authErrorMessage(error) {
    const code = error?.code || '';
    const messages = {
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/user-not-found': 'No account was found for this email.',
        'auth/wrong-password': 'Email or password is incorrect.',
        'auth/too-many-requests': 'Too many sign-in attempts. Wait a little and try again.',
        'auth/network-request-failed': 'Could not reach Firebase Authentication. Check your connection and try again.',
        'auth/invalid-api-key': 'Firebase Authentication setup is invalid. Check the Firebase API key and project configuration.',
        'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this Firebase project.'
    };
    if (messages[code]) return messages[code];
    if (error instanceof SyntaxError || /not valid JSON|unexpected token/i.test(error?.message || '')) {
        return 'Firebase Authentication returned an unreadable response. Check that the Email/Password provider is enabled and the Firebase project configuration is correct.';
    }
    return error?.message || 'Could not sign in. Please try again.';
}

async function refreshConnectionStatus() {
    const status = document.querySelector('.connection-status');
    const label = status?.lastElementChild;
    try {
        const response = await fetch('/api/health');
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'Server setup is incomplete.');
        label.textContent = 'Firebase connected';
        status.classList.remove('is-error');
        status.removeAttribute('title');
    } catch (error) {
        label.textContent = 'Server setup required';
        status.classList.add('is-error');
        status.title = error.message;
    }
}

function renderSetup() {
    authScreen.innerHTML = `
        <section class="auth-art">
            <a class="brand" href="#"><img class="brand-mark" src="images/fintrack-mark.svg" alt=""><span>FINTRACK</span></a>
            <div class="auth-art-copy"><h1>Clear books.<br>Better decisions.</h1><p>A focused workspace for customers, purchases, payments, and everyday business costs.</p></div>
            <div class="auth-art-foot">FINTRACK BUSINESS RECORDS</div>
        </section>
        <section class="auth-panel"><div class="auth-card">
            <h2>Connect Firebase</h2>
            <p>One quick project setup, then your workspace is ready.</p>
            <div class="setup-notice">Add your Firebase web app values to <strong>assets/js/firebase.js</strong>, enable Email/Password sign-in, and publish <strong>firestore.rules</strong>. See <strong>FIREBASE_SETUP.md</strong>.</div>
            <div class="field"><label>App stack</label><input value="HTML · CSS · JavaScript · Firebase" readonly></div>
        </div></section>`;
}

function renderAuth(mode = 'customer', error = '') {
    portalMode = mode === 'admin' ? 'admin' : 'customer';
    const creating = mode === 'signup';
    const admin = portalMode === 'admin';
    authScreen.innerHTML = `
        <section class="auth-art">
            <a class="brand" href="#"><img class="brand-mark" src="images/fintrack-mark.svg" alt=""><span>FINTRACK</span></a>
            <div class="auth-art-copy">
                <span class="auth-art-kicker"><span></span> ${admin ? 'FINTRACK WORKSPACE ACCESS' : 'CUSTOMER PURCHASE RECORDS'}</span>
                <h1>${admin ? 'The business view.<br>All in one place.' : 'Every purchase.<br>Clearly accounted for.'}</h1>
                <p>${admin ? 'Sign in to manage customers, plans, payments, expenses, and financial reports.' : 'Browse available plans and keep your purchase history and transactions together.'}</p>
                <div class="auth-preview" aria-hidden="true">
                    <div class="auth-preview-head"><span>WORKSPACE OVERVIEW</span><span>FINTRACK / RECORDS</span></div>
                    <div class="auth-preview-content"><div><small>TRANSACTIONS</small><strong>One clear ledger.</strong></div><div class="auth-preview-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
                    <div class="auth-preview-foot"><span><i></i> CUSTOMERS</span><span><i></i> PURCHASES</span><span><i></i> REPORTS</span></div>
                </div>
            </div>
            <div class="auth-art-foot">FINTRACK <span>/</span> BUSINESS RECORDS & REPORTING</div>
        </section>
        <section class="auth-panel"><div class="auth-card">
            <a class="brand auth-mobile-brand" href="#"><img class="brand-mark" src="images/fintrack-mark.svg" alt=""><span>FINTRACK</span></a>
            <span class="auth-card-kicker">${admin ? 'ADMINISTRATOR ACCESS' : 'CUSTOMER ACCESS'}</span>
            <h2>${creating ? 'Create your account' : admin ? 'Admin sign in' : 'Welcome back'}</h2>
            <p>${creating ? 'Create an account to browse and purchase plans.' : admin ? 'Sign in to manage the Fintrack workspace.' : 'Sign in to view your plans and transactions.'}</p>
            ${error ? `<div class="form-error" role="alert">${escapeHtml(error)}</div>` : ''}
            <form class="auth-form" data-auth-form="${creating ? 'signup' : 'signin'}" data-portal-mode="${portalMode}">
                ${creating ? '<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="fullName" autocomplete="name" required></div><div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" autocomplete="username" required></div><div class="field"><label for="auth-mobile">Mobile number <span class="optional-label">Optional</span></label><input id="auth-mobile" name="mobileNumber" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="50" autocomplete="tel"></div><div class="field"><label for="auth-address">Address <span class="optional-label">Optional</span></label><input id="auth-address" name="address" autocomplete="street-address"></div>' : ''}
                <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" placeholder="you@business.com" autocomplete="email" required></div>
                <div class="field"><div class="auth-label-row"><label for="auth-password">Password</label>${creating ? '' : '<button class="text-button" type="button" data-password-reset>Forgot password?</button>'}</div><div class="password-input-wrap"><input id="auth-password" name="password" type="password" placeholder="Enter your password" autocomplete="${creating ? 'new-password' : 'current-password'}" minlength="6" required><button class="password-toggle" type="button" data-password-toggle="auth-password" aria-label="Show password" aria-pressed="false"><span class="password-eye-icon" aria-hidden="true">&#128065;&#65038;</span></button></div></div>
                ${creating ? '<div class="field"><label for="auth-confirm-password">Confirm password</label><div class="password-input-wrap"><input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required><button class="password-toggle" type="button" data-password-toggle="auth-confirm-password" aria-label="Show confirm password" aria-pressed="false"><span class="password-eye-icon" aria-hidden="true">&#128065;&#65038;</span></button></div></div><label class="terms-check"><input name="acceptTerms" type="checkbox" required><span>I agree to the <a href="/terms.html" target="_blank" rel="noopener noreferrer" data-terms-link>Terms and Conditions</a></span></label>' : ''}
                <button class="button auth-submit" type="submit">${creating ? 'Create account' : 'Sign in to FinTrack'}<span aria-hidden="true">→</span></button>
            </form>
            <p class="auth-switch">${creating ? 'Already registered?' : !admin ? 'New to Fintrack?' : 'Not an administrator?'} <button class="text-button" type="button" ${creating ? 'data-auth-toggle' : admin ? 'data-auth-portal="customer"' : 'data-auth-toggle'}>${creating ? 'Sign in' : admin ? 'Customer access' : 'Create an account'}</button></p>
            ${!creating && !admin ? '<p class="auth-switch auth-admin-switch"><button class="text-button" type="button" data-auth-portal="admin">Login as Admin</button></p>' : ''}
            <div class="auth-card-note"><span aria-hidden="true">◆</span> Your business records stay connected to your account.</div>
        </div></section>`;
}

async function apiFetch(path, options = {}) {
    if (!state.user) throw new Error('Authentication required.');
    const token = await state.user.getIdToken();
    const response = await fetch(`/api${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'The request could not be completed.');
    return response.status === 204 ? null : response.json();
}

async function loadCustomerProfile(user, details = {}, provision = false) {
    const token = await user.getIdToken();
    const response = await fetch(provision ? '/api/customer/provision' : '/api/customer/profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Customer profile setup failed (HTTP ${response.status}).`);
    return result;
}

async function readRecords(name) {
    const rows = await apiFetch(`/${name}`);
    state.records[name] = rows;
    return rows;
}

async function readAll(names) {
    await Promise.all(names.map((name) => readRecords(name)));
}

function setView(view) {
    if (!titles[view] || (view === 'users' && !state.profile?.isMainAdmin) || (view === 'customer-accounts' && state.profile?.role !== 'admin')) return;
    dashboardCharts.forEach((chart) => chart.destroy());
    dashboardCharts = [];
    customerRecordCharts.forEach((chart) => chart.destroy());
    customerRecordCharts = [];
    state.view = view;
    state.recordSelection = { collection: view, ids: new Set(), active: false };
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
    document.querySelector('#section-name').textContent = titles[view].toUpperCase();
    document.querySelector('#page-title').textContent = titles[view];
    renderView().catch((error) => {
        const message = error.message || 'Could not load this section.';
        viewContainer.innerHTML = `<section class="panel"><div class="panel-body"><div class="form-error" role="alert">${escapeHtml(message)}</div><button class="button" data-action="retry-view">Try again</button></div></section>`;
        notify(message, true);
    });
}

async function renderView() {
    viewContainer.innerHTML = '<div class="loading">Loading records…</div>';
    if (state.profile?.isMainAdmin) {
        if (state.view === 'dashboard') return renderAdminDashboard();
        if (state.view === 'users') return renderUserManagement();
        return;
    }
    if (state.profile?.role === 'customer') {
        if (state.view === 'customer-dashboard') return renderCustomerDashboard();
        if (state.view === 'catalog') return renderCustomerCatalog();
        if (state.view === 'my-purchases') return renderCustomerPurchases();
        if (state.view === 'transactions') return renderCustomerTransactions();
        if (state.view === 'customer-profile') return renderCustomerProfile();
        if (state.view === 'customer-payments') return renderCustomerPayments();
        if (state.view === 'customer-payment-report') return renderCustomerPaymentReport();
        if (state.view === 'customer-expenses') return renderCustomerExpenses();
        if (state.view === 'customer-records') return renderCustomerRecords();
        if (state.view === 'customer-contacts') return renderCustomerContacts();
        return;
    }
    if (state.view === 'customer-accounts') return renderCustomerAccounts();
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'reports') return renderReports({ apiFetch, escapeHtml, money, viewContainer });
    return renderCollectionView(state.view);
}

function metric(label, value, note, icon) {
    return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon" aria-hidden="true">${icon}</span></div><strong class="metric-value">${value}</strong><span class="metric-note">${note}</span></article>`;
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sixMonthRange() {
    const dates = [];
    const current = new Date();
    for (let offset = 5; offset >= 0; offset -= 1) {
        const date = new Date(current.getFullYear(), current.getMonth() - offset, 1);
        dates.push({ key: monthKey(date), label: date.toLocaleDateString('en-PH', { month: 'short' }) });
    }
    return dates;
}

function monthlyTotals(rows, dateField, amountField, range) {
    const totals = new Map(range.map((month) => [month.key, 0]));
    for (const row of rows) {
        const key = String(row[dateField] || '').slice(0, 7);
        if (totals.has(key)) totals.set(key, totals.get(key) + Number(row[amountField] || 0));
    }
    return range.map((month) => totals.get(month.key));
}

function drawLineChart(canvasId, range, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    dashboardCharts.push(new window.Chart(canvas, {
        type: 'line',
        data: { labels: range.map((month) => month.label), datasets: datasets.map((dataset) => ({ ...dataset, fill: false, tension: .3, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 })) },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { color: '#91a3b9', usePointStyle: true, boxWidth: 7, padding: 16 } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#91a3b9' } },
                y: { beginAtZero: true, grid: { color: 'rgba(145, 163, 185, .12)' }, ticks: { color: '#91a3b9', callback: (value) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value) } }
            }
        }
    }));
}

function drawDoughnutChart(canvasId, labels, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    dashboardCharts.push(new window.Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: ['#63d2c0', '#e7b45c', '#79a9e8', '#ef8b78'], borderColor: '#142238', borderWidth: 3, hoverOffset: 5 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { position: 'bottom', labels: { color: '#91a3b9', usePointStyle: true, boxWidth: 7, padding: 15 } } }
        }
    }));
}

function drawWorkspaceCharts(purchases, payments, expenses) {
    const range = sixMonthRange();
    drawLineChart('workspace-activity-chart', range, [
        { label: 'Sales', data: monthlyTotals(purchases, 'purchaseDate', 'totalAmount', range), borderColor: '#63d2c0' },
        { label: 'Payments', data: monthlyTotals(payments, 'paymentDate', 'amount', range), borderColor: '#79a9e8' },
        { label: 'Expenses', data: monthlyTotals(expenses, 'expenseDate', 'amount', range), borderColor: '#ef8b78' }
    ]);
    const methods = { Cash: 0, 'Digital wallets': 0, 'Credit cards': 0, Other: 0 };
    for (const payment of payments) {
        const method = String(payment.paymentMethod || '').toLowerCase();
        const category = method.includes('wallet') || method.includes('gcash') || method.includes('maya') ? 'Digital wallets' : method.includes('card') ? 'Credit cards' : method === 'cash' ? 'Cash' : 'Other';
        methods[category] += Number(payment.amount || 0);
    }
    drawDoughnutChart('workspace-payment-chart', Object.keys(methods), Object.values(methods));
}

function drawCustomerCharts(purchases, payments, expenses) {
    const range = sixMonthRange();
    drawLineChart('customer-activity-chart', range, [
        { label: 'Purchases', data: monthlyTotals(purchases, 'purchaseDate', 'totalAmount', range), borderColor: '#63d2c0' },
        { label: 'Payments', data: monthlyTotals(payments, 'paymentDate', 'amount', range), borderColor: '#79a9e8' },
        { label: 'Expenses', data: monthlyTotals(expenses, 'expenseDate', 'amount', range), borderColor: '#ef8b78' }
    ]);
    drawDoughnutChart('customer-balance-chart', ['Paid', 'Still to pay'], [
        purchases.reduce((sum, purchase) => sum + Number(purchase.amountPaid || 0), 0),
        purchases.reduce((sum, purchase) => sum + Number(purchase.balanceAmount || 0), 0)
    ]);
}

function updateAvatar(element, profile = state.profile) {
    if (!element) return;
    element.classList.remove('has-image');
    const selected = profileAvatarChoices.find((choice) => choice.id === profile?.avatarId) || profileAvatarChoices[0];
    element.innerHTML = profileAvatarMarkup(selected.id);
}

function profileAvatarMarkup(id) {
    const selected = profileAvatarChoices.find((choice) => choice.id === id) || profileAvatarChoices[0];
    return `<span class="profile-avatar-art profile-avatar-art-${selected.id}" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="avatar-art-bg" cx="32" cy="32" r="32"/><path class="avatar-art-shirt" d="M8 64c1-14 10-23 24-23s23 9 24 23H8Z"/><path class="avatar-art-neck" d="M26 37h12v10H26z"/><ellipse class="avatar-art-face" cx="32" cy="27" rx="12" ry="14"/><path class="avatar-art-hair" d="M20 27c-1-11 4-18 13-18 10 0 15 7 12 19-2-4-4-7-7-9-4 4-10 6-18 6v2Z"/><circle class="avatar-art-eye" cx="27" cy="28" r="1"/><circle class="avatar-art-eye" cx="37" cy="28" r="1"/><path class="avatar-art-smile" d="M28 34c2 2 6 2 8 0"/></svg></span>`;
}

async function renderDashboard() {
    const [summary, purchases, payments, expenses] = await Promise.all([apiFetch('/dashboard'), readRecords('purchases'), readRecords('payments'), readRecords('expenses')]);
    const month = monthKey(new Date());
    const collectedThisMonth = payments.filter((payment) => String(payment.paymentDate || '').startsWith(month));
    const recent = [...purchases].sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''))).slice(0, 6);

    viewContainer.innerHTML = `
        <div class="view-heading"><div><h2>At a glance</h2><p>Your business activity in one place.</p></div><button class="button" data-action="new" data-collection="purchases">New purchase</button></div>
        <div class="metrics">
            ${metric('Total sales', money(summary.sales), `${purchases.length} purchase records`, '↗')}
            ${metric('Outstanding', money(summary.receivables), 'Customer balances due', '₱')}
            ${metric('Registered customers', summary.registeredCustomers, `${summary.linkedRegisteredCustomers} linked · ${summary.unlinkedRegisteredCustomers} unlinked · ${summary.customers} records`, '◉')}
            ${metric('Expenses', money(summary.expenses), 'Business expenses recorded', '↘')}
        </div>
        <div class="dashboard-charts">
            <section class="panel chart-panel"><div class="panel-header"><h3>Six-month activity</h3><span class="record-count">Sales, payments, expenses</span></div><div class="chart-canvas"><canvas id="workspace-activity-chart" role="img" aria-label="Line chart showing six months of sales, payments, and expenses"></canvas></div></section>
            <section class="panel chart-panel"><div class="panel-header"><h3>Payment methods</h3><span class="record-count">Collected by method</span></div><div class="chart-canvas chart-canvas-doughnut"><canvas id="workspace-payment-chart" role="img" aria-label="Doughnut chart showing payments by method"></canvas></div></section>
        </div>
        <section class="panel"><div class="panel-header"><h3>Recent purchases</h3><button class="text-button" data-view="purchases">View all</button></div>
            ${recent.length ? purchaseTable(recent) : emptyState('No purchases yet', 'Create a purchase to start tracking sales.')}
        </section>
        <div class="dashboard-collection-summary"><span>Payments collected this month</span><strong>${money(collectedThisMonth.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))}</strong><small>${collectedThisMonth.length} payment ${collectedThisMonth.length === 1 ? 'record' : 'records'}</small></div>`;
    drawWorkspaceCharts(purchases, payments, expenses);
}

async function renderAdminDashboard() {
    const { summary, recentUsers } = await apiFetch('/admin/overview');
    const recentRows = recentUsers.length ? `<div class="table-wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>REGISTERED</th><th>STATUS</th><th></th></tr></thead><tbody>${recentUsers.map((user) => `<tr><td><strong>${escapeHtml(user.fullName || 'Unnamed user')}</strong></td><td>${escapeHtml(user.email || '—')}</td><td>${shortDate(user.createdAt)}</td><td>${statusPill(user.status)}</td><td><button class="small-button" type="button" data-action="registered-user-details" data-id="${escapeHtml(user.id)}">Details</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('No registered users', 'Newly registered accounts will appear here.');
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>System overview</h2><p>Account registration and access status.</p></div><button class="button" type="button" data-view="users">Manage users</button></div><div class="metrics admin-overview-metrics">${metric('Total Registered Users', summary.totalUsers, 'All authentication accounts', '◎')}${metric('Active Users', summary.activeUsers, 'Accounts that can sign in', '✓')}${metric('Inactive Users', summary.inactiveUsers, 'Accounts currently disabled', '⊘')}${metric('Recent Registered Users', recentUsers.length, 'Latest five accounts', '＋')}</div><section class="panel"><div class="panel-header"><h3>Recent Registered Users</h3><button class="text-button" type="button" data-view="users">View all users</button></div>${recentRows}</section>`;
}

async function renderUserManagement(filterText = state.registeredUserSearch, refresh = true) {
    if (refresh || !state.registeredUsers) {
        const result = await apiFetch('/admin/users');
        state.registeredUsers = result.users;
    }
    state.registeredUserSearch = filterText;
    const users = [...state.registeredUsers].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    let periodUsers = users;
    if (state.registeredUserPeriod !== 'all') {
        const { from, to } = calendarDateRange(state.registeredUserPeriod, state.registeredUserDate);
        periodUsers = users.filter((user) => {
            const createdAt = new Date(user.createdAt);
            if (Number.isNaN(createdAt.valueOf())) return false;
            const date = createdAt.toISOString().slice(0, 10);
            return date >= from && date <= to;
        });
    }
    const statusUsers = state.registeredUserStatus === 'all'
        ? periodUsers
        : periodUsers.filter((user) => user.status === state.registeredUserStatus);
    const needle = filterText.trim().toLowerCase();
    const filtered = needle ? statusUsers.filter((user) => [user.fullName, user.email, user.role, user.status, user.id].some((value) => String(value || '').toLowerCase().includes(needle))) : statusUsers;
    const activeUsers = users.filter((user) => user.status === 'active').length;
    const inactiveUsers = users.length - activeUsers;
    const statusFilters = [
        { id: 'all', label: 'All', count: periodUsers.length },
        { id: 'active', label: 'Active', count: periodUsers.filter((user) => user.status === 'active').length },
        { id: 'inactive', label: 'Inactive', count: periodUsers.filter((user) => user.status === 'inactive').length }
    ];
    const table = filtered.length ? `<div class="table-wrap"><table class="registered-users-table"><thead><tr><th>USER</th><th>EMAIL</th><th>STATUS</th><th>REGISTERED</th><th>LAST SIGN-IN</th><th>ACTIONS</th></tr></thead><tbody>${filtered.map((user) => `<tr><td data-label="User"><strong>${escapeHtml(user.fullName || 'Unnamed user')}</strong>${user.isMainAdmin ? '<small class="record-detail">Main admin</small>' : ''}</td><td data-label="Email">${escapeHtml(user.email || '—')}</td><td data-label="Status">${statusPill(user.status)}</td><td data-label="Registered">${shortDate(user.createdAt)}</td><td data-label="Last sign-in">${shortDate(user.lastSignInAt)}</td><td data-label="Actions"><div class="row-actions"><button class="small-button" type="button" data-action="registered-user-details" data-id="${escapeHtml(user.id)}">Details</button>${user.isMainAdmin ? '' : `<button class="small-button" type="button" data-action="registered-user-status" data-id="${escapeHtml(user.id)}" data-status="${user.status === 'active' ? 'inactive' : 'active'}">${user.status === 'active' ? 'Deactivate' : 'Activate'}</button><button class="small-button delete" type="button" data-action="registered-user-delete" data-id="${escapeHtml(user.id)}">Delete</button>`}</div></td></tr>`).join('')}</tbody></table></div>` : emptyState(needle ? 'No matching users' : 'No registered users', needle ? 'Try a different name, email, or status.' : 'Registered accounts will appear here.');
    viewContainer.innerHTML = `<div class="view-heading user-management-heading"><div><h2>User Management</h2><p>View account details and manage sign-in access.</p></div><div class="toolbar"><input id="registered-user-search" type="search" placeholder="Search users" aria-label="Search registered users" value="${escapeHtml(filterText)}"></div></div><div class="metrics admin-user-metrics">${metric('Total Registered Users', users.length, 'All authentication accounts', '◎')}${metric('Active Users', activeUsers, 'Can sign in', '✓')}${metric('Inactive Users', inactiveUsers, 'Sign-in disabled', '⊘')}</div><div class="registered-user-filterbar"><div class="record-filters registered-user-status-filters" role="group" aria-label="Filter users by status">${statusFilters.map((filter) => `<button class="record-filter${state.registeredUserStatus === filter.id ? ' is-active' : ''}" type="button" data-action="registered-user-filter" data-filter="${filter.id}" aria-pressed="${state.registeredUserStatus === filter.id}">${filter.label}<span>${filter.count}</span></button>`).join('')}</div><div class="transaction-filters registered-user-date-filters"><label class="period-filter"><span>View</span><select id="registered-user-period" aria-label="Registration period"><option value="all" ${state.registeredUserPeriod === 'all' ? 'selected' : ''}>All time</option><option value="day" ${state.registeredUserPeriod === 'day' ? 'selected' : ''}>Day</option><option value="week" ${state.registeredUserPeriod === 'week' ? 'selected' : ''}>Week</option><option value="month" ${state.registeredUserPeriod === 'month' ? 'selected' : ''}>Month</option><option value="year" ${state.registeredUserPeriod === 'year' ? 'selected' : ''}>Year</option></select></label><label class="period-filter transaction-date-filter"><span>Calendar date</span><input id="registered-user-date" type="date" value="${escapeHtml(state.registeredUserDate)}" aria-label="Choose registration date" ${state.registeredUserPeriod === 'all' ? 'disabled' : ''}></label></div></div><section class="panel registered-user-panel"><div class="panel-header"><h3>Registered Users</h3><span class="record-count">Showing ${filtered.length} of ${statusUsers.length}</span></div>${table}</section>`;
}

async function showRegisteredUserDetails(id) {
    const user = await apiFetch(`/admin/users/${encodeURIComponent(id)}`);
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">User details</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><div class="report-line"><span>Name</span><strong>${escapeHtml(user.fullName || 'Unnamed user')}</strong></div><div class="report-line"><span>Email</span><strong>${escapeHtml(user.email || '—')}</strong></div><div class="report-line"><span>User ID</span><strong>${escapeHtml(user.id)}</strong></div><div class="report-line"><span>Role</span><strong>${escapeHtml(user.role)}</strong></div><div class="report-line"><span>Status</span>${statusPill(user.status)}</div><div class="report-line"><span>Registered</span><strong>${shortDate(user.createdAt)}</strong></div><div class="report-line"><span>Last sign-in</span><strong>${shortDate(user.lastSignInAt)}</strong></div><div class="report-line"><span>Email verified</span><strong>${user.emailVerified ? 'Yes' : 'No'}</strong></div></div></section></div>`;
}

async function renderCustomerDashboard() {
    const [purchases, payments, expenses] = await Promise.all([
        apiFetch('/customer/purchases'),
        apiFetch('/customer/payments'),
        apiFetch('/customer/expenses')
    ]);
    const total = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const outstanding = purchases.reduce((sum, purchase) => sum + Number(purchase.balanceAmount || 0), 0);
    const recent = [...purchases].sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''))).slice(0, 5);
    const duePurchases = purchases.filter((purchase) => Number(purchase.balanceAmount) > 0).sort((left, right) => String(left.purchaseDate || '').localeCompare(String(right.purchaseDate || '')));
    const dueItems = duePurchases.map((purchase) => {
        const description = (purchase.items || []).map((item) => `${item.productName} × ${item.quantity}`).join(', ') || 'Purchase';
        return `<li><span><strong>${escapeHtml(description)}</strong><small>Purchase date: ${shortDate(purchase.purchaseDate)}</small></span><strong>${money(purchase.balanceAmount)}</strong></li>`;
    }).join('');
    viewContainer.innerHTML = `
        <div class="view-heading"><div><h2>Your finances</h2><p>Purchases, payments, and expenses at a glance.</p></div></div>
        <div class="metrics customer-metrics">
            ${metric('Total purchases', money(total), `${purchases.length} purchase records`, '↗')}
            ${metric('Total payments', money(paid), `${payments.length} payment records`, '✓')}
            ${metric('Total expenses', money(expenseTotal), `${expenses.length} expense records`, '↘')}
            ${metric('Outstanding balance', money(outstanding), 'Remaining across purchases', '₱')}
        </div>
        <div class="dashboard-charts">
            <section class="panel chart-panel"><div class="panel-header"><h3>Six-month activity</h3><span class="record-count">Purchases, payments, expenses</span></div><div class="chart-canvas"><canvas id="customer-activity-chart" role="img" aria-label="Line chart showing six months of purchases, payments, and expenses"></canvas></div></section>
            <section class="panel chart-panel"><div class="panel-header"><h3>Purchase balance</h3><span class="record-count">Paid vs still to pay</span></div><div class="chart-canvas chart-canvas-doughnut"><canvas id="customer-balance-chart" role="img" aria-label="Doughnut chart showing paid and outstanding balances"></canvas></div></section>
        </div>
        <section class="due-reminder-note" aria-labelledby="due-reminder-title"><div class="due-reminder-head"><div><span class="due-reminder-kicker">PAYMENT REMINDER</span><h3 id="due-reminder-title">All dues to pay</h3></div>${duePurchases.length ? '<button class="button due-reminder-action" data-action="new-customer-payment">Record payment</button>' : ''}</div>${duePurchases.length ? `<ul class="due-reminder-list">${dueItems}</ul>` : '<p class="due-reminder-clear">You’re all caught up. No outstanding balances.</p>'}</section>
        <section class="panel"><div class="panel-header"><h3>Recent purchases</h3><button class="text-button" data-view="customer-records">View all records</button></div>
            ${recent.length ? customerPurchaseTable(recent) : emptyState('No purchases yet', 'Add a purchase to start your financial records.')}
        </section>`;
    drawCustomerCharts(purchases, payments, expenses);
}

function planMoneyValue(value) {
    if (value && typeof value === 'object') value = value.amount ?? value.value ?? value.total ?? value.budget;
    if (typeof value === 'string') value = value.replace(/₱|PHP/gi, '').replaceAll(',', '').trim();
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : undefined;
}

function normalizeCustomerPlan(plan) {
    const description = String(plan.description || '');
    const legacyMeta = /^FINTRACK_PLAN_V1\|([^|]+)\|([\d.]+)$/.exec(description);
    const descriptionBudget = /(?:budget|limit)\s*[:=\-]\s*(?:₱|PHP\s*)?([\d,]+(?:\.\d+)?)/i.exec(description);
    const items = (plan.items || []).map((item) => {
        const quantity = Number(item.quantity || 0);
        const estimatedPrice = Number(item.estimatedPrice ?? item.price ?? 0);
        return { ...item, estimatedPrice, subtotal: Number(item.subtotal ?? quantity * estimatedPrice) };
    });
    const estimatedTotal = Number(plan.estimatedTotal ?? plan.totalPrice ?? items.reduce((sum, item) => sum + item.subtotal, 0));
    const storedBudget = planMoneyValue(plan.budget);
    const alternateBudget = planMoneyValue(plan.planBudget ?? plan.budgetAmount ?? plan.plannedBudget ?? plan.estimatedBudget ?? plan.spendingLimit ?? plan.totalBudget ?? plan.budgetLimit ?? plan.budgetedAmount ?? plan.maxBudget ?? plan.Budget);
    const legacyBudget = legacyMeta ? Number(legacyMeta[2]) : descriptionBudget ? Number(descriptionBudget[1].replaceAll(',', '')) : undefined;
    const budget = storedBudget !== undefined && storedBudget > 0
        ? storedBudget
        : alternateBudget !== undefined && alternateBudget > 0
            ? alternateBudget
            : legacyBudget ?? storedBudget;
    return { ...plan, items, planDate: plan.planDate || legacyMeta?.[1], budget, estimatedTotal, remaining: plan.remaining ?? (budget === undefined ? undefined : Number(budget) - estimatedTotal) };
}

function purchaseActualTotal(purchase) {
    return (purchase.items || []).reduce((sum, item) => {
        const actual = item.includedItems?.length
            ? item.includedItems.reduce((includedTotal, included) => includedTotal + Number(included.actualSubtotal ?? included.estimatedSubtotal ?? included.subtotal ?? Number(included.quantity || 0) * Number(included.estimatedPrice ?? included.price ?? 0)), 0) * Number(item.quantity || 1)
            : Number(item.subtotal ?? 0);
        return sum + actual;
    }, 0);
}

async function renderCustomerCatalog() {
    const [customerProducts, rawCustomerPlans] = await Promise.all([apiFetch('/customer/products'), apiFetch('/customer/plans')]);
    const customerPlans = rawCustomerPlans.map(normalizeCustomerPlan);
    state.customerProductData = customerProducts;
    state.customerPlanData = customerPlans;
    const customerRows = customerProducts.length ? `<div class="table-wrap"><table class="customer-products-table customer-mobile-cards"><thead><tr><th>NAME</th><th>CATEGORY</th><th>TYPE</th><th>PRICE</th><th>STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
        ${customerProducts.map((product) => { const active = product.status !== 'inactive'; return `<tr><td data-label="Name"><strong>${escapeHtml(product.productName)}</strong>${product.description ? `<small class="record-detail">${escapeHtml(product.description)}</small>` : ''}</td><td data-label="Category">${escapeHtml(product.category || '—')}</td><td data-label="Type">${escapeHtml(product.type)}</td><td data-label="Price">${money(product.price)}</td><td data-label="Stock">${Number(product.stockQuantity || 0)}</td><td data-label="Status"><button class="plan-state-toggle ${active ? 'is-active' : 'is-inactive'}" type="button" data-action="customer-product-toggle" data-id="${escapeHtml(product.id)}" data-status="${active ? 'inactive' : 'active'}" aria-label="Set ${escapeHtml(product.productName)} ${active ? 'inactive' : 'active'}" title="Click to set ${active ? 'inactive' : 'active'}">${active ? 'Active' : 'Inactive'}</button></td><td data-label="Actions"><div class="row-actions"><button class="small-button catalog-icon-button" type="button" data-action="customer-product-edit" data-id="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.productName)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/></svg></button><button class="small-button delete catalog-icon-button" type="button" data-action="customer-product-delete" data-id="${escapeHtml(product.id)}" aria-label="Delete ${escapeHtml(product.productName)}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : emptyState('No products or services added yet', 'Add your own items to keep them in your customer account.');
    const planRows = customerPlans.length ? `<div class="table-wrap"><table class="customer-plans-table customer-mobile-cards"><thead><tr><th>PLAN</th><th>DATE</th><th>ITEMS</th><th>BUDGET</th><th>ESTIMATED TOTAL</th><th>REMAINING</th><th>STATE</th><th>BUDGET STATUS</th><th>ACTIONS</th></tr></thead><tbody>${customerPlans.map((plan) => {
        const items = plan.items || [];
        const legacyMeta = /^FINTRACK_PLAN_V1\|([^|]+)\|([\d.]+)$/.exec(plan.description || '');
        const budget = plan.budget ?? (legacyMeta ? Number(legacyMeta[2]) : undefined);
        const estimatedTotal = Number(plan.estimatedTotal ?? plan.totalPrice ?? items.reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0)), 0));
        const hasBudget = budget !== undefined && budget !== null;
        const planDate = plan.planDate || legacyMeta?.[1];
        const remaining = hasBudget ? Number(plan.remaining ?? (Number(budget) - estimatedTotal)) : 0;
        const status = plan.budgetStatus || (!hasBudget ? plan.status || '—' : remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET');
        const state = plan.state === 'inactive' ? 'inactive' : 'active';
        const itemRows = `<div class="plan-items-preview"><div class="plan-items-preview-head"><span>Item</span><span>Qty</span><span>Estimated</span><span>Subtotal</span></div>${items.map((item) => `<div class="plan-items-preview-row"><span title="${escapeHtml(item.itemName)}">${escapeHtml(item.itemName)}</span><span>${Number(item.quantity)}</span><span>${money(item.estimatedPrice ?? item.price)}</span><strong>${money(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0))}</strong></div>`).join('')}</div>`;
        return `<tr><td data-label="Plan"><strong>${escapeHtml(plan.planName)}</strong></td><td data-label="Date">${shortDate(planDate)}</td><td data-label="Items">${itemRows}</td><td data-label="Budget">${hasBudget ? money(budget) : '—'}</td><td data-label="Estimated total">${money(estimatedTotal)}</td><td data-label="Remaining">${hasBudget ? money(remaining) : '—'}</td><td data-label="State"><button class="plan-state-toggle ${state === 'active' ? 'is-active' : 'is-inactive'}" type="button" data-action="customer-plan-toggle" data-id="${escapeHtml(plan.id)}" data-state="${state === 'active' ? 'inactive' : 'active'}" aria-label="Set ${escapeHtml(plan.planName)} ${state === 'active' ? 'inactive' : 'active'}" title="Click to set ${state === 'active' ? 'inactive' : 'active'}">${state === 'active' ? 'Active' : 'Inactive'}</button></td><td data-label="Budget status">${hasBudget ? `<span class="plan-budget-status ${status === 'OVER BUDGET' ? 'is-over' : status === 'ON BUDGET' ? 'is-even' : ''}">${escapeHtml(status)}</span>` : '—'}</td><td data-label="Actions"><div class="row-actions"><button class="small-button catalog-icon-button" type="button" data-action="customer-plan-edit" data-id="${escapeHtml(plan.id)}" aria-label="Edit ${escapeHtml(plan.planName)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/></svg></button><button class="small-button delete catalog-icon-button" type="button" data-action="customer-plan-delete" data-id="${escapeHtml(plan.id)}" aria-label="Delete ${escapeHtml(plan.planName)}" title="Delete plan"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button></div></td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('No plans added yet', 'Create a plan to track your estimated spending against a budget.');
    const filter = state.customerCatalogFilter || 'all';
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Products & services</h2><p>Manage your products, services, and purchase plans.</p></div><div class="toolbar"><button class="small-button catalog-icon-button" type="button" data-action="new-customer-product" aria-label="Add Product" title="Add Product"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 5 9-5M12 12v9"/></svg></button><button class="small-button catalog-icon-button is-primary" type="button" data-action="new-customer-plan" aria-label="Add Plan" title="Add Plan"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5M12 12v6M9 15h6"/></svg></button></div></div>
        <div class="record-filters catalog-filters" role="group" aria-label="Organize products and plans"><button class="record-filter${filter === 'all' ? ' is-active' : ''}" type="button" data-action="customer-catalog-filter" data-filter="all" aria-pressed="${filter === 'all'}">All<span>${customerProducts.length + customerPlans.length}</span></button><button class="record-filter${filter === 'products' ? ' is-active' : ''}" type="button" data-action="customer-catalog-filter" data-filter="products" aria-pressed="${filter === 'products'}">Products & services<span>${customerProducts.length}</span></button><button class="record-filter${filter === 'plans' ? ' is-active' : ''}" type="button" data-action="customer-catalog-filter" data-filter="plans" aria-pressed="${filter === 'plans'}">Plans<span>${customerPlans.length}</span></button></div>
        <section class="panel record-section catalog-products-section" ${filter === 'plans' ? 'hidden' : ''}><div class="panel-header"><h3>Your products & services</h3><span class="record-count">${customerProducts.length} ${customerProducts.length === 1 ? 'item' : 'items'}</span></div>${customerRows}</section>
        <section class="panel record-section catalog-plans-section" ${filter === 'products' ? 'hidden' : ''}><div class="panel-header"><h3>Your plans</h3><span class="record-count">${customerPlans.length} ${customerPlans.length === 1 ? 'plan' : 'plans'}</span></div>${planRows}</section>`;
}

async function renderCustomerPurchases(period, anchorDate, filterText = '', refresh = true, restoreFocus = false) {
    const selection = setCustomerCalendarSelection(period, anchorDate);
    if (refresh || !state.customerPurchaseRows) state.customerPurchaseRows = await apiFetch('/customer/purchases');
    const purchases = filterRecordsByCalendar(state.customerPurchaseRows, 'purchaseDate', selection.period, selection.date)
        .sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')));
    const needle = filterText.trim().toLowerCase();
    const filteredPurchases = needle ? purchases.filter((purchase) => [
        purchase.id, purchase.customerName, purchase.processedBy, purchase.purchaseDate, purchase.paymentStatus,
        ...(purchase.items || []).flatMap((item) => [item.productName, item.quantity]),
        purchaseActualTotal(purchase), purchase.amountPaid, purchase.balanceAmount
    ].some((value) => String(value ?? '').toLowerCase().includes(needle))) : purchases;
    state.customerPurchaseData = filteredPurchases;
    const purchaseBulkControls = customerRecordBulkToolbar('customer-purchases', filteredPurchases);
    const listContent = filteredPurchases.length
        ? customerPurchaseTransactionsTable(filteredPurchases)
        : emptyState(needle ? 'No matching transactions' : 'No purchases in this period', needle ? 'Try a different search.' : 'Purchases will appear here.');
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Purchase Transactions</h2><p>Your purchases, totals, and remaining balances.</p></div><div class="transaction-filters">${customerCalendarFilter(selection)}</div><button class="button" data-action="new-customer-purchase">Create transaction</button></div><section class="panel"><div class="purchase-search-toolbar"><input id="customer-purchase-search" type="search" aria-label="Search purchase transactions" placeholder="Search transactions" value="${escapeHtml(filterText)}"><span class="record-count">Showing ${filteredPurchases.length} of ${purchases.length}</span>${purchaseBulkControls}</div>${listContent}</section>`;
    if (restoreFocus) {
        const search = viewContainer.querySelector('#customer-purchase-search');
        search?.focus();
        search?.setSelectionRange(filterText.length, filterText.length);
    }
}

async function renderCustomerContacts(filterText = '', restoreFocus = false, refresh = true) {
    if (refresh) state.customerContacts = await apiFetch('/customer/contacts');
    const contacts = [...state.customerContacts].sort((left, right) => String(left.customerName || '').localeCompare(String(right.customerName || '')));
    const needle = filterText.trim().toLowerCase();
    const filtered = needle ? contacts.filter((contact) => [contact.customerName, contact.email, contact.contactNumber, contact.address].some((value) => String(value || '').toLowerCase().includes(needle))) : contacts;
    const rows = filtered.length ? `<div class="table-wrap"><table class="customer-contact-table"><colgroup><col class="contact-name-col"><col class="contact-phone-col"><col class="contact-email-col"><col class="contact-address-col"><col class="contact-actions-col"></colgroup><thead><tr><th>NAME</th><th>PHONE</th><th>EMAIL</th><th>ADDRESS</th><th class="contact-actions-heading">ACTIONS</th></tr></thead><tbody>${filtered.map((contact) => `<tr><td><strong>${escapeHtml(contact.customerName)}</strong></td><td>${escapeHtml(contact.contactNumber || '—')}</td><td>${escapeHtml(contact.email || '—')}</td><td>${escapeHtml(contact.address || '—')}</td><td class="contact-actions-cell"><div class="row-actions"><button class="small-button" data-action="edit-customer-contact" data-id="${escapeHtml(contact.id)}">Edit</button><button class="small-button delete" data-action="delete-customer-contact" data-id="${escapeHtml(contact.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState(needle ? 'No matching customers' : 'No customers yet', needle ? 'Try a different name, phone, or email.' : 'Add your first customer contact to get started.');
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>My customers</h2><p>Manage contacts saved to your account.</p></div><div class="toolbar customer-contact-toolbar"><input id="customer-contact-search" type="search" placeholder="Search customers" aria-label="Search your customers" value="${escapeHtml(filterText)}"><button class="button" data-action="new-customer-contact">Add customer</button></div></div>
        <section class="customer-contact-overview" aria-label="Customer count"><span class="customer-contact-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="16" r="8"/><path d="M9 40c1.8-8.2 7.3-12.3 15-12.3S37.2 31.8 39 40"/></svg></span><div><span class="customer-contact-count-label">TOTAL CUSTOMERS</span><strong>${contacts.length}</strong><small>Saved contacts</small></div><span class="customer-contact-overview-note">Your customer list</span></section>
        <section class="panel customer-contact-records"><div class="panel-header"><div><h3>Customer records</h3><p>Contact details for the people you manage.</p></div><span class="record-count">Showing ${filtered.length} of ${contacts.length}</span></div>${rows}</section>`;
    if (restoreFocus) {
        const search = viewContainer.querySelector('#customer-contact-search');
        search?.focus();
        search?.setSelectionRange(filterText.length, filterText.length);
    }
}

function renderCustomerProfile() {
    const selectedAvatar = profileAvatarChoices.some((choice) => choice.id === state.profile.avatarId) ? state.profile.avatarId : profileAvatarChoices[0].id;
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Personal information</h2><p>Keep your contact details and profile photo up to date.</p></div></div>
        <section class="panel"><form class="data-form customer-profile-form panel-body" data-record-form="customer-profile">
            <div class="profile-avatar-field"><div class="profile-avatar-current"><span id="profile-photo-preview" class="avatar avatar-large">${profileAvatarMarkup(selectedAvatar)}</span><div class="profile-photo-details"><strong>Profile avatar</strong><small>Choose one of these six avatars.</small></div></div><fieldset class="profile-avatar-picker"><legend>Choose your avatar</legend><div class="profile-avatar-options">${profileAvatarChoices.map((choice) => `<label class="profile-avatar-option"><input type="radio" name="avatarId" value="${choice.id}" aria-label="${choice.label} avatar" ${selectedAvatar === choice.id ? 'checked' : ''}><span class="profile-avatar-option-image">${profileAvatarMarkup(choice.id)}</span><span class="profile-avatar-option-label">${choice.label}</span></label>`).join('')}</div></fieldset></div>
            <div class="profile-fields">
                ${fieldMarkup(['fullName', 'Full name', 'text', true], state.profile.fullName || '')}
                <div class="field"><label for="customer-profile-email">Email address</label><input id="customer-profile-email" type="email" value="${escapeHtml(state.profile.email || '')}" readonly></div>
                ${fieldMarkup(['contactNumber', 'Phone number', 'tel'], state.profile.contactNumber || '')}
                ${fieldMarkup(['address', 'Address', 'textarea'], state.profile.address || '')}
            </div>
            <div><button class="button" type="submit">Save changes</button></div>
        </form></section>`;
    updateAvatar(document.querySelector('#profile-photo-preview'));
}

async function renderCustomerPayments(period, anchorDate) {
    const selection = setCustomerCalendarSelection(period, anchorDate);
    const { purchases, payments } = await apiFetch('/customer/records');
    const filteredPayments = filterRecordsByCalendar(payments, 'paymentDate', selection.period, selection.date).sort((left, right) => String(right.paymentDate || '').localeCompare(String(left.paymentDate || '')));
    state.customerPaymentData = filteredPayments;
    const bulkControls = customerRecordBulkToolbar('customer-payments', filteredPayments);
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Payments</h2><p>Record payments against your purchases and monitor balances.</p></div><div class="transaction-filters">${customerCalendarFilter(selection)}</div><button class="button" data-action="new-customer-payment">Record payment</button></div>
        <section class="panel"><div class="record-selection-toolbar">${bulkControls}</div>${filteredPayments.length ? customerPaymentTable(filteredPayments, purchases) : emptyState('No payments in this period', 'Payments will appear here.')}</section>`;
}

async function renderCustomerPaymentReport(period, anchorDate) {
    const selection = setCustomerCalendarSelection(period, anchorDate);
    const allPayments = await apiFetch('/customer/payments');
    const payments = filterRecordsByCalendar(allPayments, 'paymentDate', selection.period, selection.date);
    const methods = summarizePaymentMethods(payments);
    const total = methods.reduce((sum, method) => sum + method.total, 0);
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Payment summary</h2><p>Your collected payments grouped by payment method.</p></div><div class="transaction-filters">${customerCalendarFilter(selection)}</div></div>
        <div class="payment-summary-layout"><div class="payment-summary-total">${metric('Total collected', money(total), `${methods.reduce((sum, item) => sum + item.count, 0)} recorded payments`, '✓')}</div><div class="payment-summary-methods">${methods.map((method) => metric(method.title, money(method.total), `${method.count} ${method.count === 1 ? 'payment' : 'payments'}`, method.mark)).join('')}</div></div>
        <section class="panel payment-report-panel"><div class="panel-header"><div><h3>Payments by method</h3><p>Cash, GCash, bank transfer, and others</p></div></div><div class="payment-report-chart"><canvas id="customer-payment-report-chart" role="img" aria-label="Doughnut chart showing customer payments by method"></canvas></div></section>`;
    const canvas = document.getElementById('customer-payment-report-chart');
    if (canvas && window.Chart) new window.Chart(canvas, {
        type: 'doughnut',
        data: { labels: methods.map(({ title }) => title), datasets: [{ data: methods.map(({ total: amount }) => amount), backgroundColor: ['#63d2c0', '#79a9e8', '#e7b45c', '#91a3b9'], borderColor: '#142238', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: '#91a3b9', usePointStyle: true } } } }
    });
}

async function renderCustomerExpenses(period, anchorDate) {
    const selection = setCustomerCalendarSelection(period, anchorDate);
    const allExpenses = await apiFetch('/customer/expenses');
    const expenses = filterRecordsByCalendar(allExpenses, 'expenseDate', selection.period, selection.date);
    expenses.sort((left, right) => String(right.expenseDate || '').localeCompare(String(left.expenseDate || '')));
    state.customerExpenseData = expenses;
    const bulkControls = customerRecordBulkToolbar('customer-expenses', expenses);
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>My expenses</h2><p>Your personal expense history.</p></div><div class="transaction-filters">${customerCalendarFilter(selection)}</div><button class="button" data-action="new-customer-expense">Add expense</button></div>
        <section class="panel"><div class="record-selection-toolbar">${bulkControls}</div>${expenses.length ? customerExpenseTable(expenses) : emptyState('No expenses in this period', 'Expenses will appear here.')}</section>`;
}

async function renderCustomerRecords(filter = state.customerRecordFilter, refresh = true, period, anchorDate, restoreSearchFocus = false) {
    const selection = setCustomerCalendarSelection(period, anchorDate);
    state.customerRecordFilter = filter;
    if (refresh || !state.customerRecordData) state.customerRecordData = await apiFetch('/customer/records');
    const purchases = filterRecordsByCalendar(state.customerRecordData.purchases, 'purchaseDate', selection.period, selection.date);
    const payments = filterRecordsByCalendar(state.customerRecordData.payments, 'paymentDate', selection.period, selection.date);
    const expenses = filterRecordsByCalendar(state.customerRecordData.expenses, 'expenseDate', selection.period, selection.date);
    const purchaseDescriptions = new Map(purchases.map((purchase) => [purchase.id, (purchase.items || []).map((item) => `${item.productName} × ${item.quantity}`).join(', ') || 'Purchase']));
    const records = [
        ...purchases.map((purchase) => { const total = purchaseActualTotal(purchase); const balance = Math.max(0, total - Number(purchase.amountPaid || 0)); return { id: purchase.id, purchaseId: purchase.id, date: purchase.purchaseDate, type: 'Purchase', description: purchaseDescriptions.get(purchase.id), detail: `Paid ${money(purchase.amountPaid)} · Balance ${money(balance)}`, amount: total, status: balance ? (Number(purchase.amountPaid || 0) ? 'partial' : 'unpaid') : 'paid' }; }),
        ...payments.map((payment) => ({ id: payment.id, purchaseId: payment.purchaseId, date: payment.paymentDate, type: 'Payment', description: purchaseDescriptions.get(payment.purchaseId) || payment.purchaseLabel || 'Payment', detail: [payment.paymentMethod, payment.notes].filter(Boolean).join(' · '), amount: Number(payment.amount || 0), status: payment.paymentStatus || 'paid' })),
        ...expenses.map((expense) => ({ id: expense.id, date: expense.expenseDate, type: 'Expense', description: expense.title, detail: [expense.category, expense.description].filter(Boolean).join(' · '), amount: Number(expense.amount || 0), status: 'Recorded' }))
    ].sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
    const outstanding = purchases.map((purchase) => ({ purchase, balance: Math.max(0, purchaseActualTotal(purchase) - Number(purchase.amountPaid || 0)) })).filter(({ balance }) => balance > 0).map(({ purchase, balance }) => ({ id: purchase.id, date: purchase.purchaseDate, type: 'Balance', description: purchaseDescriptions.get(purchase.id), amount: balance, status: purchase.paymentStatus || 'unpaid' }));
    const purchaseTotal = purchases.reduce((sum, purchase) => sum + purchaseActualTotal(purchase), 0);
    const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const outstandingTotal = outstanding.reduce((sum, row) => sum + row.amount, 0);
    const filters = [
        { id: 'all', label: 'All', count: records.length, rows: records },
        { id: 'purchases', label: 'Purchases', count: purchases.length, rows: records.filter((record) => record.type === 'Purchase') },
        { id: 'payments', label: 'Payments', count: payments.length, rows: records.filter((record) => record.type === 'Payment') },
        { id: 'expenses', label: 'Expenses', count: expenses.length, rows: records.filter((record) => record.type === 'Expense') },
        { id: 'outstanding', label: 'Outstanding', count: outstanding.length, rows: outstanding }
    ];
    const selected = filters.find((item) => item.id === filter) || filters[0];
    const needle = state.customerRecordSearch.trim().toLowerCase();
    const visibleRows = needle ? selected.rows.filter((record) => [record.date, record.type, record.description, record.detail, record.amount, record.status].some((value) => String(value ?? '').toLowerCase().includes(needle))) : selected.rows;
    const table = visibleRows.length ? customerRecordTable(visibleRows) : emptyState(needle ? 'No matching records' : `No ${selected.label.toLowerCase()} yet`, needle ? 'Try a different search term.' : 'New records will appear here.');
    const periodLabel = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }[selection.period] || 'Month';
    const { from, to } = calendarDateRange(selection.period, selection.date);
    const chartInterval = selection.period === 'year' ? 'Monthly' : 'Daily';
    viewContainer.innerHTML = `<div class="print-record-heading"><h2>FinTrack · All records</h2><p>${selected.label} · ${periodLabel} · ${shortDate(from)} – ${shortDate(to)}${needle ? ` · Search: ${escapeHtml(state.customerRecordSearch)}` : ''} · ${visibleRows.length} records</p></div>
        <div class="view-heading"><div><h2>All records</h2><p>One timeline for your purchases, payments, expenses, and balances.</p></div><div class="transaction-filters customer-record-filters">${customerCalendarFilter(selection)}<button class="small-button record-print-button customer-record-print-button" type="button" data-action="print-customer-records" aria-label="Print all records as PDF" title="Print all records as PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5h-2M7 14h10v7H7zM18 11h.01"/></svg></button></div></div>
        <div class="customer-record-charts"><section class="panel chart-panel"><div class="panel-header"><div><h3>Purchase Transaction Records</h3><p>${chartInterval} purchase totals</p></div><span class="record-count">${purchases.length} ${purchases.length === 1 ? 'transaction' : 'transactions'} · ${money(purchaseTotal)}</span></div><div class="customer-record-chart-canvas"><canvas id="customer-purchase-record-chart" role="img" aria-label="Purchase transaction totals for the selected period"></canvas></div></section><section class="panel chart-panel"><div class="panel-header"><div><h3>Expenses</h3><p>${chartInterval} expense totals</p></div><span class="record-count">${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} · ${money(expenseTotal)}</span></div><div class="customer-record-chart-canvas"><canvas id="customer-expense-record-chart" role="img" aria-label="Expense totals for the selected period"></canvas></div></section></div>
        <div class="metrics customer-metrics record-overview-metrics">${metric('Total purchases', money(purchaseTotal), `${purchases.length} ${purchases.length === 1 ? 'purchase record' : 'purchase records'}`, '↗')}${metric('Total payments', money(paymentTotal), `${payments.length} ${payments.length === 1 ? 'payment record' : 'payment records'}`, '✓')}${metric('Total expenses', money(expenseTotal), `${expenses.length} ${expenses.length === 1 ? 'expense record' : 'expense records'}`, '↘')}${metric('Outstanding balance', money(outstandingTotal), 'Remaining across purchases', '₱')}</div>
        <section class="panel record-browser"><div class="record-filters" role="group" aria-label="Filter records">${filters.map((item) => `<button class="record-filter${item.id === selected.id ? ' is-active' : ''}" type="button" aria-pressed="${item.id === selected.id}" data-action="customer-record-filter" data-filter="${item.id}">${item.label}<span>${item.count}</span></button>`).join('')}<input type="search" id="customer-record-search" placeholder="Search records" value="${escapeHtml(state.customerRecordSearch)}" aria-label="Search ${selected.label.toLowerCase()} records"></div><div class="panel-header"><h3>${selected.label}</h3><span class="record-count">${needle ? `${visibleRows.length} of ` : ''}${selected.rows.length} ${selected.rows.length === 1 ? 'record' : 'records'}</span></div>${table}</section>`;
    if (restoreSearchFocus) {
        const search = viewContainer.querySelector('#customer-record-search');
        search?.focus();
        search?.setSelectionRange(state.customerRecordSearch.length, state.customerRecordSearch.length);
    }
    drawCustomerRecordCharts(purchases, expenses, selection);
}

function drawCustomerRecordCharts(purchases, expenses, selection) {
    customerRecordCharts.forEach((chart) => chart.destroy());
    customerRecordCharts = [];
    if (!window.Chart) return;

    const { from, to } = calendarDateRange(selection.period, selection.date);
    const periods = [];
    if (selection.period === 'year') {
        for (let month = 0; month < 12; month += 1) periods.push(`${from.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`);
    } else {
        const cursor = new Date(`${from}T00:00:00.000Z`);
        const finalDate = new Date(`${to}T00:00:00.000Z`);
        while (cursor <= finalDate) {
            periods.push(cursor.toISOString().slice(0, 10));
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }
    const periodKey = (date) => selection.period === 'year' ? date.slice(0, 7) : date;
    const labels = periods.map((date) => new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-PH', selection.period === 'year' ? { month: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }));
    const totalByDate = (records, field) => {
        const amounts = new Map(periods.map((date) => [periodKey(date), 0]));
        for (const record of records) {
            const date = periodKey(String(record[field] || '').slice(0, 10));
            if (amounts.has(date)) amounts.set(date, amounts.get(date) + Number(record.totalAmount ?? record.amount ?? 0));
        }
        return periods.map((date) => amounts.get(periodKey(date)));
    };
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => money(context.parsed.y) } } },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#91a3b9', maxTicksLimit: 8 } },
            y: { beginAtZero: true, grid: { color: 'rgba(145, 163, 185, .12)' }, ticks: { color: '#91a3b9', callback: (value) => money(value) } }
        }
    };
    const charts = [
        { id: 'customer-purchase-record-chart', records: purchases, field: 'purchaseDate', color: '#63d2c0' },
        { id: 'customer-expense-record-chart', records: expenses, field: 'expenseDate', color: '#ef8b78' }
    ];
    for (const chart of charts) {
        const canvas = document.getElementById(chart.id);
        if (!canvas) continue;
        customerRecordCharts.push(new window.Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: totalByDate(chart.records, chart.field), backgroundColor: chart.color, borderRadius: 4, maxBarThickness: 28 }] },
            options: chartOptions
        }));
    }
}

async function printCustomerRecords() {
    const chartImages = [];
    const originalChartColors = customerRecordCharts.map((chart) => ({
        chart,
        xTicks: chart.options.scales.x.ticks.color,
        yTicks: chart.options.scales.y.ticks.color,
        grid: chart.options.scales.y.grid.color
    }));
    for (const { chart } of originalChartColors) {
        chart.options.scales.x.ticks.color = '#475569';
        chart.options.scales.y.ticks.color = '#475569';
        chart.options.scales.y.grid.color = 'rgba(71, 85, 105, .16)';
        chart.update('none');
        try {
            const image = document.createElement('img');
            image.className = 'print-chart-image';
            image.src = chart.canvas.toDataURL('image/png');
            image.alt = chart.canvas.getAttribute('aria-label') || 'Financial chart';
            chart.canvas.classList.add('print-captured');
            chart.canvas.after(image);
            chartImages.push(image);
        } catch {}
    }
    document.body.classList.add('print-customer-records');
    const cleanup = () => {
        document.body.classList.remove('print-customer-records');
        chartImages.forEach((image) => image.remove());
        originalChartColors.forEach(({ chart, xTicks, yTicks, grid }) => {
            chart.canvas.classList.remove('print-captured');
            chart.options.scales.x.ticks.color = xTicks;
            chart.options.scales.y.ticks.color = yTicks;
            chart.options.scales.y.grid.color = grid;
            chart.update('none');
        });
    };
    await Promise.all(chartImages.map((image) => image.decode().catch(() => {})));
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
}

function customerRecordTable(records) {
    return `<div class="table-wrap"><table><thead><tr><th>DATE</th><th>TYPE</th><th>DETAILS</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${records.map((record) => `<tr><td>${shortDate(record.date)}</td><td><span class="record-type record-type-${record.type.toLowerCase()}">${escapeHtml(record.type)}</span></td><td><strong>${escapeHtml(record.description)}</strong>${record.detail ? `<small class="record-detail">${escapeHtml(record.detail)}</small>` : ''}</td><td>${money(record.amount)}</td><td>${statusPill(record.status)}</td><td><button class="small-button record-print-button" type="button" data-action="customer-record-print" data-record-type="${escapeHtml(record.type)}" data-record-id="${escapeHtml(record.purchaseId || record.id)}" aria-label="Print ${escapeHtml(record.type.toLowerCase())} receipt" title="Print"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7zM18 11h.01"/></svg></button></td></tr>`).join('')}</tbody></table></div>`;
}

function customerPaymentTable(payments, purchases = []) {
    return `<div class="table-wrap"><table class="customer-payments-table customer-mobile-cards"><thead><tr><th>Payment ID</th><th>Transaction ID</th><th>Customer</th><th>Amount Paid</th><th>Payment Method</th><th>Payment Date</th><th>Processed By</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>${payments.map((payment) => {
        const purchase = purchases.find((item) => item.id === payment.purchaseId);
        const paymentId = String(payment.id || '');
        const transactionId = String(payment.purchaseId || '');
        return `<tr data-record-id="${escapeHtml(payment.id)}" data-record-collection="customer-payments"><td data-label="Payment ID">${customerRecordSelectionCheckbox(payment, 'customer-payments')}<span title="${escapeHtml(paymentId)}">${escapeHtml(paymentId.slice(0, 8) || '—')}</span></td><td data-label="Transaction ID"><span title="${escapeHtml(transactionId)}">${escapeHtml(transactionId.slice(0, 8) || '—')}</span></td><td data-label="Customer">${escapeHtml(payment.customerName || purchase?.customerName || '—')}</td><td data-label="Amount paid">${money(payment.amount)}</td><td data-label="Payment method">${escapeHtml(payment.paymentMethod || 'Other')}</td><td data-label="Payment date">${shortDate(payment.paymentDate)}</td><td data-label="Processed by">${escapeHtml(payment.processedBy || '—')}</td><td data-label="Remarks">${escapeHtml(payment.notes || '—')}</td><td data-label="Actions"><div class="row-actions">${payment.userId === state.user?.uid ? `<button class="small-button" data-action="customer-payment-edit" data-id="${escapeHtml(payment.id)}">Edit</button><button class="small-button delete" data-action="customer-record-delete" data-kind="payments" data-id="${escapeHtml(payment.id)}">Delete</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function customerExpenseTable(expenses) {
    return `<div class="table-wrap"><table class="customer-expenses-table customer-mobile-cards"><thead><tr><th>DATE</th><th>EXPENSE</th><th>CATEGORY</th><th>DESCRIPTION / NOTES</th><th>AMOUNT</th><th>ACTIONS</th></tr></thead><tbody>${expenses.map((expense) => `<tr data-record-id="${escapeHtml(expense.id)}" data-record-collection="customer-expenses"><td data-label="Date">${customerRecordSelectionCheckbox(expense, 'customer-expenses')}${shortDate(expense.expenseDate)}</td><td data-label="Expense">${escapeHtml(expense.title)}</td><td data-label="Category">${escapeHtml(expense.category)}</td><td data-label="Description / notes">${escapeHtml(expense.description || '—')}</td><td data-label="Amount">${money(expense.amount)}</td><td data-label="Actions"><div class="row-actions"><button class="small-button" data-action="customer-expense-edit" data-id="${escapeHtml(expense.id)}">Edit</button><button class="small-button delete" data-action="customer-record-delete" data-kind="expenses" data-id="${escapeHtml(expense.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function customerRecordSelectionCheckbox(record, collection) {
    if (record.userId !== state.user?.uid || !state.recordSelection.active || state.recordSelection.collection !== collection) return '';
    return `<input class="record-row-select" type="checkbox" data-collection="${collection}" value="${escapeHtml(record.id)}" aria-label="Select record" ${state.recordSelection.ids.has(record.id) ? 'checked' : ''}>`;
}

function customerRecordBulkToolbar(collection, records) {
    if (!state.recordSelection.active || state.recordSelection.collection !== collection) return '';
    const selectable = records.filter((record) => record.userId === state.user?.uid);
    const visibleIds = new Set(selectable.map((record) => record.id));
    for (const id of state.recordSelection.ids) if (!visibleIds.has(id)) state.recordSelection.ids.delete(id);
    const selectedCount = state.recordSelection.ids.size;
    const allSelected = selectable.length > 0 && selectable.every((record) => state.recordSelection.ids.has(record.id));
    return `<label class="record-select-all"><input id="record-select-all" type="checkbox" data-collection="${collection}" ${allSelected ? 'checked' : ''} ${selectable.length ? '' : 'disabled'}><span>Select all</span></label><button class="bulk-delete-button" type="button" data-action="bulk-delete" data-collection="${collection}" aria-label="Delete selected records" title="Delete selected records" ${selectedCount ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5L4 6m5 4v6m6-6v6"/></svg><span>${selectedCount || ''}</span></button><button class="text-button selection-cancel" type="button" data-action="customer-selection-cancel">Cancel</button>`;
}

async function openCustomerPaymentForm() {
    const purchases = (await apiFetch('/customer/purchases')).filter((purchase) => Number(purchase.balanceAmount) > 0);
    if (!purchases.length) {
        notify('Create a purchase transaction first. You can record a payment after it has an outstanding balance.');
        setView('my-purchases');
        return openCustomerPurchaseForm();
    }
    const options = `<option value="">Choose a purchase or transaction</option>${purchases.map((purchase) => {
        const description = (purchase.items || []).map((item) => item.productName).join(', ') || 'Purchase';
        return `<option value="${escapeHtml(purchase.id)}" data-balance="${Number(purchase.balanceAmount) || 0}">${escapeHtml(description)} · ${shortDate(purchase.purchaseDate)} · due ${money(purchase.balanceAmount)}</option>`;
    }).join('')}`;
    const fields = `<div class="field"><label for="customer-payment-purchase">Purchase / transaction</label><select id="customer-payment-purchase" name="purchaseId" required>${options}</select></div>
        ${fieldMarkup(['amount', 'Payment amount', 'number', true])}
        ${fieldMarkup(['paymentDate', 'Payment date', 'date', true], new Date().toISOString().slice(0, 10))}
        ${paymentMethodCardsMarkup()}
        ${fieldMarkup(['notes', 'Notes', 'textarea'])}
        <div class="payment-summary"><div><span>Remaining balance</span><strong data-payment-balance>Select a purchase</strong></div><span data-payment-status></span></div>`;
    customerFormModal('Record payment', 'customer-payment', fields, 'Save payment');
    updateCustomerPaymentEstimate();
}

function openCustomerExpenseForm(expense = null) {
    const fields = `${fieldMarkup(['title', 'Expense name', 'text', true], expense?.title || '')}
        ${fieldMarkup(['category', 'Category', 'select', true, expenseCategories], expense?.category || '')}
        ${fieldMarkup(['amount', 'Amount', 'number', true], expense?.amount ?? '')}
        ${fieldMarkup(['expenseDate', 'Date', 'date', true], expense?.expenseDate || new Date().toISOString().slice(0, 10))}
        ${fieldMarkup(['description', 'Description / notes', 'textarea'], expense?.description || '')}`;
    customerFormModal(expense ? 'Edit expense' : 'Add expense', 'customer-expense', fields, expense ? 'Save changes' : 'Save expense');
    modalRoot.querySelector('[data-record-form="customer-expense"]').dataset.id = expense?.id || '';
}

function openCustomerContactForm(contact = null) {
    const fields = [
        ['customerName', 'Name', 'text', true],
        ['contactNumber', 'Phone number', 'tel'],
        ['email', 'Email address', 'email'],
        ['address', 'Address', 'textarea']
    ].map((field) => fieldMarkup(field, contact?.[field[0]] || '')).join('');
    customerFormModal(contact ? 'Edit customer' : 'Add customer', 'customer-contact', fields, contact ? 'Save changes' : 'Save customer');
    modalRoot.querySelector('[data-record-form="customer-contact"]').dataset.id = contact?.id || '';
}

function customerFormModal(title, name, fields, submitLabel) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${title}</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><form class="data-form" data-record-form="${name}">${fields}<div class="modal-actions"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">${submitLabel}</button></div></form></div></section></div>`;
    modalRoot.querySelector('input, select, textarea')?.focus();
}

function updateCustomerPaymentEstimate() {
    const form = modalRoot.querySelector('[data-record-form="customer-payment"]');
    if (!form) return;
    const purchase = form.querySelector('[name="purchaseId"] option:checked');
    const balance = Number(purchase?.dataset.balance || 0);
    const amountField = form.querySelector('[name="amount"]');
    amountField.max = balance || '';
    const amount = Math.max(0, Number(amountField.value) || 0);
    const remaining = Math.max(0, balance - amount);
    form.querySelector('[data-payment-balance]').textContent = purchase?.value ? money(remaining) : 'Select a purchase';
    form.querySelector('[data-payment-status]').textContent = !purchase?.value || amount === 0 ? 'Unpaid' : remaining === 0 ? 'Paid' : 'Partially paid';
}

async function openCustomerPurchaseForm(selectedProductId = '') {
    const [products, contacts, rawPlans] = await Promise.all([apiFetch('/customer/products'), apiFetch('/customer/contacts'), apiFetch('/customer/plans')]);
    const plans = rawPlans.map(normalizeCustomerPlan);
    state.customerPlanData = plans;
    const activeProducts = products.filter((product) => product.status === 'active');
    if (!activeProducts.length && !plans.length) {
        notify('Add a product or service first. Your transaction will open after setup.');
        return openCustomerProductForm();
    }
    const customerId = state.profile?.customerId;
    const customerName = state.profile?.customerName || state.profile?.fullName || state.user?.email || 'My account';
    const customerOptions = `<option value="${escapeHtml(customerId || '')}">My account · ${escapeHtml(customerName)}</option>${contacts.map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(contact.customerName)}</option>`).join('')}`;
    const fields = `<div class="field"><label for="customer-purchase-customer">Customer</label><select id="customer-purchase-customer" name="customerId" required>${customerOptions}</select></div>
        <p class="field-hint">Choose your own account or one of your saved customers.</p>
        ${fieldMarkup(['purchaseDate', 'Purchase date', 'date', true], new Date().toISOString().slice(0, 10))}
        <div class="field"><span class="field-label">Purchase items</span><div class="customer-purchase-line-header"><span>Product / plan</span><span>Quantity</span><span>Line total</span><span></span></div><div class="customer-purchase-lines" data-customer-purchase-lines>${customerPurchaseLineMarkup(activeProducts, selectedProductId, plans)}</div><button class="text-button customer-purchase-add" type="button" data-action="add-customer-purchase-line">+ Add another item</button></div>
        ${fieldMarkup(['remarks', 'Remarks', 'textarea'])}
        <div class="purchase-total"><span>Actual total</span><strong data-purchase-total>${money(0)}</strong></div>`;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">Create Purchase Transaction</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><form class="data-form" data-record-form="customer-purchase">${fields}<div class="modal-actions"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Create transaction</button></div></form></div></section></div>`;
    updateCustomerPurchaseTotal();
    modalRoot.querySelectorAll('.customer-purchase-line').forEach(updateCustomerPurchasePlanDetails);
}

async function openCustomerPurchaseEditForm(id) {
    const purchase = state.customerPurchaseData?.find((item) => item.id === id);
    if (!purchase || purchase.userId !== state.user?.uid) throw new Error('This purchase transaction cannot be edited.');
    const [products, contacts, rawPlans] = await Promise.all([apiFetch('/customer/products'), apiFetch('/customer/contacts'), apiFetch('/customer/plans')]);
    const plans = rawPlans.map(normalizeCustomerPlan);
    state.customerPlanData = plans;
    const customers = [
        ...(state.profile?.customerId ? [{ id: state.profile.customerId, customerName: `My account · ${state.profile.customerName || state.profile.fullName || 'Customer'}` }] : []),
        ...contacts
    ];
    if (!customers.some((customer) => customer.id === purchase.customerId)) customers.unshift({ id: purchase.customerId, customerName: purchase.customerName || 'Current customer' });
    const customerOptions = customers.map((customer) => `<option value="${escapeHtml(customer.id)}" ${customer.id === purchase.customerId ? 'selected' : ''}>${escapeHtml(customer.customerName)}</option>`).join('');
    const purchaseLines = (purchase.items || []).map((item) => {
        const productId = item.itemType === 'plan' || item.includedItems?.length ? `plan:${item.productId}` : `customer-product:${item.productId}`;
        return customerPurchaseLineMarkup(products, productId, plans, item.quantity);
    }).join('');
    const fields = `<div class="field"><label for="customer-purchase-customer">Customer</label><select id="customer-purchase-customer" name="customerId" required>${customerOptions}</select></div>
        ${fieldMarkup(['purchaseDate', 'Purchase date', 'date', true], purchase.purchaseDate)}
        <div class="field"><span class="field-label">Purchase items</span><div class="customer-purchase-line-header"><span>Product / plan</span><span>Quantity</span><span>Line total</span><span></span></div><div class="customer-purchase-lines" data-customer-purchase-lines>${purchaseLines || customerPurchaseLineMarkup(products, '', plans)}</div><button class="text-button customer-purchase-add" type="button" data-action="add-customer-purchase-line">+ Add another item</button></div>
        ${fieldMarkup(['remarks', 'Remarks', 'textarea'], purchase.remarks || '')}
        <div class="purchase-total"><span>Actual total</span><strong data-purchase-total>${money(purchase.totalAmount)}</strong></div>`;
    customerFormModal('Edit purchase transaction', 'customer-purchase', fields, 'Save changes');
    const form = modalRoot.querySelector('[data-record-form="customer-purchase"]');
    form.dataset.id = id;
    form.querySelectorAll('.customer-purchase-line').forEach((line, lineIndex) => {
        updateCustomerPurchasePlanDetails(line);
        const includedItems = purchase.items[lineIndex]?.includedItems || [];
        line.querySelectorAll('.plan-actual-price').forEach((input, itemIndex) => {
            input.value = includedItems[itemIndex]?.actualSubtotal ?? input.value;
        });
    });
    updateCustomerPurchaseTotal();
}

function openCustomerPaymentEditForm(id) {
    const payment = state.customerPaymentData?.find((item) => item.id === id);
    if (!payment || payment.userId !== state.user?.uid) throw new Error('This payment cannot be edited.');
    const selectedMethod = paymentMethods.some((method) => method.value === payment.paymentMethod) ? payment.paymentMethod : 'others';
    const fields = `<div class="field"><label>Transaction ID</label><input value="${escapeHtml(payment.purchaseId || '')}" disabled></div>
        <div class="field"><label>Customer</label><input value="${escapeHtml(payment.customerName || '—')}" disabled></div>
        ${fieldMarkup(['amount', 'Amount paid', 'number', true], payment.amount)}
        ${fieldMarkup(['paymentDate', 'Payment date', 'date', true], payment.paymentDate)}
        ${paymentMethodCardsMarkup(selectedMethod)}
        ${fieldMarkup(['notes', 'Remarks', 'textarea'], payment.notes || '')}`;
    customerFormModal('Edit payment', 'customer-payment', fields, 'Save changes');
    modalRoot.querySelector('[data-record-form="customer-payment"]').dataset.id = id;
}

function customerPurchaseLineMarkup(products, selectedProductId = '', plans = [], quantity = 1) {
    const productOptions = products.map((product) => `<option value="customer-product:${escapeHtml(product.id)}" data-price="${Number(product.price) || 0}" ${product.id === selectedProductId || `customer-product:${product.id}` === selectedProductId ? 'selected' : ''}>${escapeHtml(product.productName)} · ${money(product.price)}</option>`).join('');
    const planOptions = plans.filter((plan) => plan.state !== 'inactive' || `plan:${plan.id}` === selectedProductId).map((plan) => {
        const legacyTotal = (plan.items || []).reduce((total, item) => total + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0)), 0);
        const total = Number(plan.estimatedTotal ?? plan.totalPrice ?? legacyTotal);
        return `<option value="plan:${escapeHtml(plan.id)}" data-price="${total}" ${`plan:${plan.id}` === selectedProductId ? 'selected' : ''}>${escapeHtml(plan.planName)} · Plan · ${money(total)}</option>`;
    }).join('');
    const options = `<option value="">Choose a product, service, or plan</option>${productOptions ? `<optgroup label="Products & services">${productOptions}</optgroup>` : ''}${planOptions ? `<optgroup label="Purchase plans">${planOptions}</optgroup>` : ''}`;
    return `<div class="customer-purchase-line"><select name="productId" aria-label="Product, service, or plan" required>${options}</select><input name="quantity" type="number" min="1" step="1" value="${Number(quantity) || 1}" aria-label="Quantity" required><strong data-line-total>${money(0)}</strong><button class="small-button delete" type="button" data-action="remove-customer-purchase-line" aria-label="Remove item" title="Remove item" disabled>×</button><div class="purchase-plan-actuals" data-plan-actuals hidden></div></div>`;
}

function updateCustomerPurchasePlanDetails(line) {
    const panel = line.querySelector('[data-plan-actuals]');
    const selectedId = line.querySelector('[name="productId"]')?.value || '';
    const plan = selectedId.startsWith('plan:') ? state.customerPlanData?.find((item) => `plan:${item.id}` === selectedId) : null;
    if (!panel) return;
    if (!plan) { panel.hidden = true; panel.innerHTML = ''; return; }
    const items = plan.items || [];
    panel.hidden = false;
    const planEstimatedTotal = Number(plan.estimatedTotal ?? plan.totalPrice ?? items.reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0)), 0));
    panel.innerHTML = `<div class="purchase-plan-title"><strong>${escapeHtml(plan.planName)} items</strong></div><div class="purchase-plan-header"><span>Item</span><span>Qty</span><span>Estimated</span><span>Actual</span></div>${items.map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const estimated = Number(item.subtotal ?? quantity * Number(item.estimatedPrice ?? item.price ?? 0));
        return `<div class="purchase-plan-item" data-estimated-subtotal="${estimated}"><span>${escapeHtml(item.itemName || 'Item')}</span><span>${quantity}</span><span>${money(estimated)}</span><input class="plan-actual-price" type="number" min="0" step="0.01" value="${estimated}" data-item-index="${index}" aria-label="Actual price for ${escapeHtml(item.itemName || 'item')}"></div>`;
    }).join('')}<div class="purchase-plan-summary"><span>Estimated total <strong data-plan-estimated>${money(planEstimatedTotal)}</strong></span><span>Budget <strong data-plan-budget>${money(planMoneyValue(plan.budget) ?? 0)}</strong></span><span>Actual total <strong data-plan-actual-total>${money(planEstimatedTotal)}</strong></span><span>Remaining <strong data-plan-actual-remaining>${money((planMoneyValue(plan.budget) ?? 0) - planEstimatedTotal)}</strong></span><strong class="plan-budget-status" data-plan-actual-status>UNDER BUDGET</strong></div>`;
    updateCustomerPurchaseTotal();
}

function openCustomerProductForm(product = null) {
    const defaults = product || { productName: '', category: '', description: '', type: 'product', price: '', stockQuantity: '0', status: 'active' };
    const fields = products.fields.map((field) => fieldMarkup(field, defaults[field[0]])).join('');
    customerFormModal(product ? 'Edit product or service' : 'Add product or service', 'customer-product', fields, product ? 'Save changes' : 'Save product');
    if (product) modalRoot.querySelector('[data-record-form="customer-product"]').dataset.id = product.id;
}

function customerPlanItemMarkup(item = {}) {
    const itemName = escapeHtml(item.itemName || '');
    const quantity = Number(item.quantity || 1);
    const price = Number(item.estimatedPrice ?? item.price ?? 0);
    return `<div class="customer-plan-item"><input name="itemName" type="text" placeholder="Item" aria-label="Item name" maxlength="150" value="${itemName}" required><input name="itemQuantity" type="number" min="1" step="1" value="${quantity}" aria-label="Quantity" required><input name="itemPrice" type="number" min="0" step="0.01" value="${price}" aria-label="Estimated price" required><strong data-item-subtotal>${money(quantity * price)}</strong><button class="small-button delete" type="button" data-action="remove-customer-plan-item" aria-label="Remove item" title="Remove item">×</button></div>`;
}

function openCustomerPlanForm(plan = null) {
    const fields = `<div class="customer-plan-basics"><div class="field"><label for="customer-plan-name">Plan name</label><input id="customer-plan-name" name="planName" placeholder="e.g. Grocery" maxlength="150" required></div>${fieldMarkup(['budget', 'Budget', 'number', true])}${fieldMarkup(['planDate', 'Date', 'date', true], localDateInputValue(new Date()))}</div>
        <input type="hidden" name="state" value="${plan?.state === 'inactive' ? 'inactive' : 'active'}">
        <div class="field"><span class="field-label">Items to buy</span><div class="customer-plan-item-header"><span>Item</span><span>Qty</span><span>Estimated price</span><span>Subtotal</span><span></span></div><div class="customer-plan-items" data-customer-plan-items>${customerPlanItemMarkup()}</div><button class="small-button catalog-icon-button customer-plan-add" type="button" data-action="add-customer-plan-item" aria-label="Add item" title="Add item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>
        <div class="customer-plan-summary"><div><span>Estimated total</span><strong data-plan-total>${money(0)}</strong></div><div><span>Remaining</span><strong data-plan-remaining>${money(0)}</strong></div><div><span>Status</span><strong class="plan-budget-status" data-plan-status>UNDER BUDGET</strong></div></div>`;
    customerFormModal(plan ? 'Edit plan' : 'Add plan', 'customer-plan', fields, plan ? 'Save changes' : 'Save plan');
    const form = modalRoot.querySelector('[data-record-form="customer-plan"]');
    if (plan) {
        form.dataset.id = plan.id;
        form.querySelector('[name="planName"]').value = plan.planName || '';
        form.querySelector('[name="budget"]').value = plan.budget ?? 0;
        form.querySelector('[name="planDate"]').value = plan.planDate || localDateInputValue(new Date());
        const items = plan.items?.length ? plan.items : [{}];
        form.querySelector('[data-customer-plan-items]').innerHTML = items.map(customerPlanItemMarkup).join('');
    }
    updateCustomerPlanTotal();
}

function updateCustomerPlanTotal() {
    const form = modalRoot.querySelector('[data-record-form="customer-plan"]');
    if (!form) return;
    let total = 0;
    form.querySelectorAll('.customer-plan-item').forEach((item) => {
        const quantity = Math.max(0, Math.floor(Number(item.querySelector('[name="itemQuantity"]').value) || 0));
        const price = Math.max(0, Number(item.querySelector('[name="itemPrice"]').value) || 0);
        const subtotal = quantity * price;
        total += subtotal;
        item.querySelector('[data-item-subtotal]').textContent = money(subtotal);
    });
    const budget = Math.max(0, Number(form.querySelector('[name="budget"]').value) || 0);
    const remaining = budget - total;
    const status = remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET';
    form.querySelector('[data-plan-total]').textContent = money(total);
    form.querySelector('[data-plan-remaining]').textContent = money(remaining);
    const statusElement = form.querySelector('[data-plan-status]');
    statusElement.textContent = status;
    statusElement.classList.toggle('is-over', status === 'OVER BUDGET');
    statusElement.classList.toggle('is-even', status === 'ON BUDGET');
    const items = form.querySelectorAll('.customer-plan-item');
    form.querySelectorAll('[data-action="remove-customer-plan-item"]').forEach((button) => { button.disabled = items.length === 1; });
}

function updateCustomerPurchaseTotal() {
    const form = modalRoot.querySelector('[data-record-form="customer-purchase"]');
    if (!form) return;
    let total = 0;
    form.querySelectorAll('.customer-purchase-line').forEach((line) => {
        const product = line.querySelector('[name="productId"] option:checked');
        const price = Number(product?.dataset.price || 0);
        const quantity = Math.max(0, Math.floor(Number(line.querySelector('[name="quantity"]').value) || 0));
        const planPanel = line.querySelector('[data-plan-actuals]');
        let lineTotal = price * quantity;
        if (planPanel && !planPanel.hidden) {
            const actualPlanTotal = [...planPanel.querySelectorAll('.plan-actual-price')].reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
            const estimatedPlanTotal = [...planPanel.querySelectorAll('.purchase-plan-item')].reduce((sum, item) => sum + Number(item.dataset.estimatedSubtotal || 0), 0);
            const plan = state.customerPlanData?.find((item) => `plan:${item.id}` === line.querySelector('[name="productId"]').value);
            const budget = planMoneyValue(plan?.budget) ?? 0;
            const remaining = budget - actualPlanTotal;
            const status = remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET';
            lineTotal = actualPlanTotal * quantity;
            planPanel.querySelector('[data-plan-estimated]').textContent = money(estimatedPlanTotal);
            planPanel.querySelector('[data-plan-actual-total]').textContent = money(actualPlanTotal);
            planPanel.querySelector('[data-plan-actual-remaining]').textContent = money(remaining);
            const statusElement = planPanel.querySelector('[data-plan-actual-status]');
            statusElement.textContent = status;
            statusElement.classList.toggle('is-over', status === 'OVER BUDGET');
            statusElement.classList.toggle('is-even', status === 'ON BUDGET');
        }
        total += lineTotal;
        line.querySelector('[data-line-total]').textContent = money(lineTotal);
    });
    const lines = form.querySelectorAll('.customer-purchase-line');
    form.querySelectorAll('[data-action="remove-customer-purchase-line"]').forEach((button) => { button.disabled = lines.length === 1; });
    form.querySelector('[data-purchase-total]').textContent = money(total);
}
async function renderCustomerAccounts(filterText = '', restoreFocus = false, refresh = true) {
    if (refresh) state.customerAccounts = await apiFetch('/customer-accounts');
    const accounts = [...state.customerAccounts].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    const linked = accounts.filter((account) => account.customerLinked).length;
    const unlinked = accounts.length - linked;
    const needle = filterText.trim().toLowerCase();
    const filtered = needle ? accounts.filter((account) => `${account.fullName} ${account.email} ${account.status} ${account.customerLinked ? 'linked' : 'unlinked'}`.toLowerCase().includes(needle)) : accounts;
    const rows = filtered.length ? `<div class="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>STATUS</th><th>CUSTOMER RECORD</th><th>REGISTERED</th></tr></thead><tbody>${filtered.map((account) => `<tr><td><strong>${escapeHtml(account.fullName || 'Unnamed customer')}</strong></td><td>${escapeHtml(account.email || '—')}</td><td>${statusPill(account.status)}</td><td>${statusPill(account.customerLinked ? 'Linked' : 'Not linked')}</td><td>${shortDate(account.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : emptyState(needle ? 'No matching customer accounts' : 'No customer accounts yet', needle ? 'Try a different name, email, or link status.' : 'Registered customer accounts will appear here.');
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Registered customer accounts</h2><p>Account totals use customer-role profiles; linked status is checked against actual customer records.</p></div><div class="toolbar"><input type="search" id="customer-account-search" placeholder="Search name, email, or status" value="${escapeHtml(filterText)}" aria-label="Search customer accounts"></div></div>
        <div class="customer-account-summary"><div><span>Registered accounts</span><strong>${accounts.length}</strong></div><div><span>Linked records</span><strong>${linked}</strong></div><div><span>Not linked</span><strong>${unlinked}</strong></div></div>
        <section class="panel"><div class="panel-header"><h3>Customer accounts</h3><span class="record-count">Showing ${filtered.length} of ${accounts.length}</span></div>${rows}</section>`;
    if (restoreFocus) {
        const search = viewContainer.querySelector('#customer-account-search');
        search?.focus();
        search?.setSelectionRange(filterText.length, filterText.length);
    }
}

function customerPurchaseTable(purchases) {
    return `<div class="table-wrap"><table><thead><tr><th>DATE</th><th>PRODUCT / SERVICE</th><th>TOTAL</th><th>PAID</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>${purchases.map((purchase) => { const total = purchaseActualTotal(purchase); const balance = Math.max(0, total - Number(purchase.amountPaid || 0)); return `<tr><td>${shortDate(purchase.purchaseDate)}</td><td>${escapeHtml((purchase.items || []).map((item) => `${item.productName} × ${item.quantity}`).join(', ') || 'Purchase')}</td><td>${money(total)}</td><td>${money(purchase.amountPaid)}</td><td>${money(balance)}</td><td>${statusPill(balance === 0 ? 'paid' : Number(purchase.amountPaid || 0) > 0 ? 'partial' : 'unpaid')}</td></tr>`; }).join('')}</tbody></table></div>`;
}

function customerPurchaseTransactionsTable(purchases) {
    return `<div class="table-wrap"><table class="purchase-transactions-table"><thead><tr><th>ID</th><th>Customer</th><th>Processed By</th><th>Total Amount</th><th>Amount Paid</th><th>Balance</th><th>Status</th><th>Purchase Date</th><th>Actions</th></tr></thead><tbody>${purchases.map((purchase) => { const actualTotal = purchaseActualTotal(purchase); const balance = Math.max(0, actualTotal - Number(purchase.amountPaid || 0)); const paymentStatus = balance <= 0 ? 'paid' : Number(purchase.amountPaid || 0) > 0 ? 'partial' : 'unpaid'; return `<tr data-record-id="${escapeHtml(purchase.id)}" data-record-collection="customer-purchases"><td data-label="ID">${customerRecordSelectionCheckbox(purchase, 'customer-purchases')}<span title="${escapeHtml(purchase.id)}">${escapeHtml(String(purchase.id || '').slice(0, 8) || '—')}</span></td><td data-label="Customer">${escapeHtml(purchase.customerName || '—')}</td><td data-label="Processed By">${escapeHtml(purchase.processedBy || (purchase.userId === state.user?.uid ? state.profile?.fullName : '') || '—')}</td><td data-label="Total Amount">${money(actualTotal)}</td><td data-label="Amount Paid">${money(purchase.amountPaid)}</td><td data-label="Balance">${money(balance)}</td><td data-label="Status">${statusPill(paymentStatus)}</td><td data-label="Purchase Date">${shortDate(purchase.purchaseDate)}</td><td data-label="Actions"><div class="row-actions"><button class="small-button purchase-view-icon" type="button" data-action="customer-purchase-view" data-id="${escapeHtml(purchase.id)}" aria-label="View purchase items" title="View purchase items"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="small-button record-print-button" type="button" data-action="customer-purchase-receipt" data-id="${escapeHtml(purchase.id)}" aria-label="View or print receipt" title="View or print receipt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5h-2M7 14h10v7H7zM18 11h.01"/></svg></button>${purchase.userId === state.user?.uid ? `<button class="small-button catalog-icon-button" type="button" data-action="customer-purchase-edit" data-id="${escapeHtml(purchase.id)}" aria-label="Edit purchase" title="Edit purchase"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/></svg></button><button class="small-button delete catalog-icon-button" type="button" data-action="customer-record-delete" data-kind="purchases" data-id="${escapeHtml(purchase.id)}" aria-label="Delete purchase" title="Delete purchase"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
}

async function renderCustomerTransactions(period = 'month', anchorDate = localDateInputValue(new Date())) {
    const query = new URLSearchParams({ period, date: anchorDate });
    const result = await apiFetch(`/customer/transactions?${query}`);
    const totals = ['Purchase', 'Payment', 'Expense'].map((type) => {
        const entries = result.transactions.filter((item) => item.type === type);
        return { type, count: entries.length, amount: entries.reduce((sum, item) => sum + Number(item.amount || 0), 0) };
    });
    const periodLabel = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }[period] || 'Month';
    const summaries = totals.map((entry) => metric(`${entry.type}s`, money(entry.amount), `${entry.count} ${entry.count === 1 ? 'transaction' : 'transactions'} · ${periodLabel.toLowerCase()}`, entry.type === 'Purchase' ? '↗' : entry.type === 'Payment' ? '₱' : '↘')).join('');
    const rows = result.transactions.length ? `<div class="table-wrap"><table><thead><tr><th>DATE</th><th>TYPE</th><th>DETAILS</th><th>METHOD</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>${result.transactions.map((item) => `<tr><td>${shortDate(item.date)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.method)}</td><td>${money(item.amount)}</td><td>${statusPill(item.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('No transactions in this period', 'Purchase, payment, and expense activity will appear here.');
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>Transaction monitoring</h2><p>${periodLabel} · ${shortDate(result.from)} – ${shortDate(result.to)}</p></div><div class="transaction-filters"><label class="period-filter"><span>View</span><select id="transaction-period" aria-label="Transaction period"><option value="day" ${period === 'day' ? 'selected' : ''}>Day</option><option value="week" ${period === 'week' ? 'selected' : ''}>Week</option><option value="month" ${period === 'month' ? 'selected' : ''}>Month</option><option value="year" ${period === 'year' ? 'selected' : ''}>Year</option></select></label><label class="period-filter transaction-date-filter"><span>Calendar date</span><input id="transaction-date" type="date" value="${escapeHtml(anchorDate)}" aria-label="Choose a day, week, month, or year"></label></div></div><div class="metrics transaction-summary">${summaries}</div><section class="panel">${rows}</section>`;
}

function localDateInputValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function setMobileNavigationOpen(open) {
    const toggle = document.querySelector('#mobile-menu-toggle');
    const backdrop = document.querySelector('#mobile-nav-backdrop');
    if (!toggle || !backdrop) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    backdrop.hidden = !open;
    document.body.classList.toggle('mobile-nav-open', open);
}

function setCustomerCalendarSelection(period = state.customerCalendarPeriod || 'month', date = state.customerCalendarDate || localDateInputValue(new Date())) {
    state.customerCalendarPeriod = period;
    state.customerCalendarDate = date;
    return { period, date };
}

function customerCalendarFilter({ period, date }) {
    return `<label class="period-filter"><span>View</span><select id="customer-calendar-period" aria-label="Calendar period"><option value="day" ${period === 'day' ? 'selected' : ''}>Day</option><option value="week" ${period === 'week' ? 'selected' : ''}>Week</option><option value="month" ${period === 'month' ? 'selected' : ''}>Month</option><option value="year" ${period === 'year' ? 'selected' : ''}>Year</option></select></label><label class="period-filter transaction-date-filter"><span>Calendar date</span><input id="customer-calendar-date" type="date" value="${escapeHtml(date)}" aria-label="Choose a day, week, month, or year"></label>`;
}

function renderCustomerCalendarView(period, date) {
    if (state.view === 'my-purchases') return renderCustomerPurchases(period, date, document.querySelector('#customer-purchase-search')?.value || '', false);
    if (state.view === 'customer-payments') return renderCustomerPayments(period, date);
    if (state.view === 'customer-payment-report') return renderCustomerPaymentReport(period, date);
    if (state.view === 'customer-expenses') return renderCustomerExpenses(period, date);
    if (state.view === 'customer-records') return renderCustomerRecords(state.customerRecordFilter, false, period, date);
}

function emptyState(title, message) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
}

function purchaseTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>TOTAL</th><th>PAID</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>${rows.map((row) => { const total = purchaseActualTotal(row); const balance = Math.max(0, total - Number(row.amountPaid || 0)); const paymentStatus = balance === 0 ? 'paid' : Number(row.amountPaid || 0) > 0 ? 'partial' : 'unpaid'; return `<tr><td>${shortDate(row.purchaseDate)}</td><td>${escapeHtml(row.customerName || 'Customer')}</td><td>${money(total)}</td><td>${money(row.amountPaid)}</td><td>${money(balance)}</td><td>${statusPill(paymentStatus)}</td></tr>`; }).join('')}</tbody></table></div>`;
}

function statusPill(value) {
    const rawText = String(value || 'active');
    const text = rawText.toLowerCase() === 'partial' ? 'Partially paid' : rawText;
    const cls = ['unpaid', 'inactive', 'overdue'].includes(text.toLowerCase()) ? ` ${text.toLowerCase()}` : '';
    return `<span class="status-pill${cls}">${escapeHtml(text)}</span>`;
}

async function renderCollectionView(name, filterText = '', { refresh = true, restoreFocus = false } = {}) {
    const definition = definitions[name];
    let rows = refresh || !state.records[name] ? await readRecords(name) : state.records[name];
    if (name === 'payments' && rows.length) {
        const customers = state.records.customers || await readRecords('customers');
        const purchases = state.records.purchases || await readRecords('purchases');
        rows = rows.map((row) => {
            const purchase = purchases.find((item) => item.id === row.purchaseId);
            return {
                ...row,
                customerName: row.customerName || purchase?.customerName || customers.find((customer) => customer.id === row.customerId)?.customerName || 'Customer',
                purchaseId: row.purchaseId || row.purchaseLabel || '—'
            };
        });
    }
    rows.sort((a, b) => String(b.createdAt || b.purchaseDate || b.expenseDate || b.paymentDate || '').localeCompare(String(a.createdAt || a.purchaseDate || a.expenseDate || a.paymentDate || '')));
    if (filterText) {
        const needle = filterText.toLowerCase();
        rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)));
    }

    const supportsBulk = ['purchases', 'payments', 'expenses'].includes(name);
    if (state.recordSelection.collection !== name) state.recordSelection = { collection: name, ids: new Set(), active: false };
    const selectedIds = state.recordSelection.ids;
    const selectionActive = supportsBulk && state.recordSelection.active;
    const canWrite = name !== 'purchases' && name !== 'payments' && (name !== 'users' || state.profile?.role === 'admin');
    const addLabel = { customers: 'Add customer', products: 'Add product or service', expenses: 'Add expense', purchases: 'New purchase', payments: 'Record payment', users: 'Add account' }[name];
    const hasActions = true;
    const rowsHtml = rows.length ? `<div class="table-wrap"><table class="${name === 'purchases' ? 'purchase-transactions-table' : ''}"><thead><tr>${definition.columns.map((column) => `<th>${['purchases', 'payments'].includes(name) ? escapeHtml(column[1]) : column[1].toUpperCase()}</th>`).join('')}${hasActions ? `<th>${name === 'purchases' ? 'Actions' : 'ACTIONS'}</th>` : ''}</tr></thead><tbody>
        ${rows.map((row) => `<tr data-record-id="${escapeHtml(row.id)}" data-record-collection="${name}">${definition.columns.map(([field, label], index) => `<td data-label="${escapeHtml(label)}">${supportsBulk && selectionActive && index === 0 ? `<input class="record-row-select" type="checkbox" data-collection="${name}" value="${escapeHtml(row.id)}" aria-label="Select record" ${selectedIds.has(row.id) ? 'checked' : ''}>` : ''}${formatCell(field, row[field], row)}</td>`).join('')}<td data-label="Actions"><div class="row-actions">${name === 'purchases' ? `<button class="small-button" data-action="purchase-view" data-id="${escapeHtml(row.id)}">View</button><button class="small-button" data-action="purchase-receipt" data-id="${escapeHtml(row.id)}">Receipt</button><button class="small-button" data-action="edit" data-collection="purchases" data-id="${escapeHtml(row.id)}">Edit</button><button class="small-button delete" data-action="delete" data-collection="purchases" data-id="${escapeHtml(row.id)}">Delete</button>` : name === 'payments' ? `<button class="small-button" data-action="edit" data-collection="payments" data-id="${escapeHtml(row.id)}">Edit</button><button class="small-button delete" data-action="delete" data-collection="payments" data-id="${escapeHtml(row.id)}">Delete</button>` : name === 'users' ? `<button class="small-button" data-action="edit" data-collection="users" data-id="${escapeHtml(row.id)}">Role</button>` : canWrite ? `<button class="small-button" data-action="edit" data-collection="${name}" data-id="${escapeHtml(row.id)}">Edit</button><button class="small-button delete" data-action="delete" data-collection="${name}" data-id="${escapeHtml(row.id)}">Delete</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table></div>` : emptyState(`No ${definition.title.toLowerCase()} found`, 'New records will appear here.');

    const selectAllChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
    const bulkActions = selectionActive ? `<label class="record-select-all"><input id="record-select-all" type="checkbox" ${selectAllChecked ? 'checked' : ''}><span>Select all</span></label><button class="bulk-delete-button" type="button" data-action="bulk-delete" data-collection="${name}" aria-label="Delete selected records" title="Delete selected records" ${selectedIds.size ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5L4 6m5 4v6m6-6v6"/></svg><span>${selectedIds.size || ''}</span></button><button class="text-button selection-cancel" type="button" data-action="customer-selection-cancel">Cancel</button>` : '';
    viewContainer.innerHTML = `<div class="view-heading"><div><h2>${definition.title}</h2><p>${definition.description}</p></div><div class="toolbar record-toolbar"><input type="search" id="record-search" placeholder="Search ${definition.title.toLowerCase()}" value="${escapeHtml(filterText)}" aria-label="Search ${definition.title}">${bulkActions}<button class="button" data-action="new" data-collection="${name}">${addLabel}</button></div></div><section class="panel">${rowsHtml}</section>`;
    if (restoreFocus) {
        const search = viewContainer.querySelector('#record-search');
        search?.focus();
        search?.setSelectionRange(filterText.length, filterText.length);
    }
}

function formatCell(field, value, row) {
    if (field === 'price' || field === 'amount' || field === 'totalAmount' || field === 'amountPaid' || field === 'balanceAmount') return money(value);
    if (field === 'id' || field === 'purchaseId') return `<span title="${escapeHtml(value || '')}">${escapeHtml(String(value || '').slice(0, 8) || '—')}</span>`;
    if (field === 'processedBy') return escapeHtml(row.processedBy || (row.userId === state.user?.uid ? state.profile?.fullName : '') || '—');
    if (field.toLowerCase().includes('date') || field === 'createdAt') return shortDate(value);
    if (field === 'status' || field === 'paymentStatus' || field === 'role') return statusPill(value);
    if (field === 'customerName' && row.customerId && !value) return 'Customer';
    return escapeHtml(value ?? '—');
}

function fieldMarkup([name, label, type, required = false, options = []], value = '') {
    const safeName = escapeHtml(name);
    const safeValue = escapeHtml(value ?? '');
    if (type === 'textarea') return `<div class="field"><label for="field-${safeName}">${label}</label><textarea id="field-${safeName}" name="${safeName}">${safeValue}</textarea></div>`;
    if (type === 'select') return `<div class="field"><label for="field-${safeName}">${label}</label><select id="field-${safeName}" name="${safeName}" ${required ? 'required' : ''}><option value="">Select ${label.toLowerCase()}</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>`;
    const numeric = type === 'number' ? ` min="0" step="${name === 'stockQuantity' || name === 'quantity' ? '1' : '0.01'}"` : '';
    const phone = type === 'tel' ? ' inputmode="numeric" pattern="[0-9]*" maxlength="50"' : '';
    return `<div class="field"><label for="field-${safeName}">${label}</label><input id="field-${safeName}" name="${safeName}" type="${type}" value="${safeValue}" ${required ? 'required' : ''}${numeric}${phone}></div>`;
}

function optionList(rows, idField, labelField, selected = '', placeholder = 'Choose one') {
    return `<option value="">${escapeHtml(placeholder)}</option>${rows.map((row) => `<option value="${escapeHtml(row.id)}" ${selected === row.id ? 'selected' : ''}>${escapeHtml(row[labelField] || row[idField] || 'Unnamed')}</option>`).join('')}`;
}

async function openForm(name, record = null) {
    if (name === 'purchases') await readAll(['customers', 'products']);
    if (name === 'payments') await readAll(['purchases', 'customers']);
    let fields = '';
    if (name === 'purchases' && record) {
        const items = (record.items || []).map((item) => `<div class="report-line"><span>${escapeHtml(item.productName)} × ${Number(item.quantity)}</span><strong>${money(item.subtotal)}</strong></div>`).join('');
        fields = `<div class="field"><label>Customer</label><input value="${escapeHtml(record.customerName || '—')}" disabled></div>${fieldMarkup(['purchaseDate', 'Purchase date', 'date', true], record.purchaseDate)}${fieldMarkup(['remarks', 'Remarks', 'textarea'], record.remarks || '')}<div class="field"><span class="field-label">Items and totals are unchanged</span>${items}<div class="report-line"><span>Total amount</span><strong>${money(record.totalAmount)}</strong></div></div>`;
    } else if (name === 'payments' && record) {
        const selectedMethod = paymentMethods.some((method) => method.value === record.paymentMethod) ? record.paymentMethod : 'others';
        fields = `<div class="field"><label>Transaction ID</label><input value="${escapeHtml(record.purchaseId || '')}" disabled></div><div class="field"><label>Customer</label><input value="${escapeHtml(record.customerName || '—')}" disabled></div>${fieldMarkup(['amount', 'Amount paid', 'number', true], record.amount)}${fieldMarkup(['paymentDate', 'Payment date', 'date', true], record.paymentDate)}${paymentMethodCardsMarkup(selectedMethod)}${fieldMarkup(['notes', 'Remarks', 'textarea'], record.notes || '')}`;
    } else if (name === 'purchases' || name === 'payments') {
        fields = await definitions[name].fields({ state, fieldMarkup, optionList, purchaseLineMarkup });
    } else if (name === 'users') {
        if (record) {
            fields = `<div class="field"><label>Name</label><input value="${escapeHtml(record.fullName)}" disabled></div><div class="field"><label>Email</label><input value="${escapeHtml(record.email)}" disabled></div>${fieldMarkup(['role', 'Role', 'select', true, ['staff', 'admin']], record.role)}`;
        } else {
            fields = `${fieldMarkup(['fullName', 'Full name', 'text', true])}${fieldMarkup(['email', 'Email', 'email', true])}${fieldMarkup(['password', 'Temporary password', 'password', true])}${fieldMarkup(['role', 'Role', 'select', true, ['staff', 'admin']], 'staff')}`;
        }
    } else {
        fields = definitions[name].fields.map((field) => fieldMarkup(field, record?.[field[0]] ?? (field[0] === 'status' ? 'active' : ''))).join('');
    }
    const modalTitle = name === 'purchases' ? `${record ? 'Edit' : 'Create'} Purchase Transaction` : `${record ? 'Edit' : 'Add'} ${definitions[name].title.replace(/s$/, '')}`;
    const submitLabel = name === 'purchases' ? record ? 'Save changes' : 'Create transaction' : 'Save record';
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${modalTitle}</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><form class="data-form" data-record-form="${name}" data-id="${escapeHtml(record?.id || '')}">${fields}<div class="modal-actions"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">${submitLabel}</button></div></form></div></section></div>`;
    modalRoot.querySelector('input, select, textarea')?.focus();
}

function purchaseLineMarkup() {
    return `<div class="purchase-line"><select name="productId" aria-label="Product or service" required>${optionList(state.records.products.filter((item) => item.status === 'active'), 'id', 'productName')}</select><input name="quantity" type="number" min="1" step="1" value="1" aria-label="Quantity" required><button class="small-button delete" type="button" data-action="remove-line">Remove</button></div>`;
}

function closeModal() {
    modalRoot.innerHTML = '';
}

async function createManagedUser(formData) {
    await apiFetch('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(formData.entries())) });
}

async function saveRecord(form) {
    const formData = new FormData(form);
    const name = form.dataset.recordForm;
    const id = form.dataset.id;
    if (name === 'customer-profile') {
        const data = Object.fromEntries(['fullName', 'contactNumber', 'address'].map((field) => [field, String(formData.get(field) || '').trim()]));
        data.avatarId = String(formData.get('avatarId') || profileAvatarChoices[0].id);
        return apiFetch('/customer/profile', { method: 'PATCH', body: JSON.stringify(data) });
    }
    if (name === 'customer-product') {
        const data = products.toPayload(formData);
        return apiFetch(`/customer/products${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    }
    if (name === 'customer-plan') {
        const items = [...form.querySelectorAll('.customer-plan-item')].map((item) => ({
            itemName: item.querySelector('[name="itemName"]').value.trim(),
            quantity: Number(item.querySelector('[name="itemQuantity"]').value),
            estimatedPrice: Number(item.querySelector('[name="itemPrice"]').value)
        }));
        const plan = { planName: String(formData.get('planName') || '').trim(), planDate: formData.get('planDate'), budget: Number(formData.get('budget')), state: formData.get('state') || 'active', items };
        const path = `/customer/plans${id ? `/${encodeURIComponent(id)}` : ''}`;
        const method = id ? 'PATCH' : 'POST';
        try {
            return await apiFetch(path, { method, body: JSON.stringify(plan) });
        } catch (error) {
            if (!/Unrecognized key|received nan/i.test(error.message || '')) throw error;
            const legacyItems = items.map(({ itemName, quantity, estimatedPrice }) => ({ itemName, quantity, price: estimatedPrice }));
            const totalPrice = legacyItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
            const legacyPlan = { planName: plan.planName, description: `FINTRACK_PLAN_V1|${plan.planDate}|${plan.budget}`, items: legacyItems, totalPrice };
            return apiFetch(path, { method, body: JSON.stringify(legacyPlan) });
        }
    }
    if (name === 'customer-contact') {
        const data = Object.fromEntries(['customerName', 'contactNumber', 'email', 'address'].map((field) => [field, String(formData.get(field) || '').trim()]));
        return apiFetch(`/customer/contacts${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    }
    if (name === 'customer-purchase') {
        const data = {
            customerId: formData.get('customerId'),
            purchaseDate: formData.get('purchaseDate'),
            remarks: String(formData.get('remarks') || '').trim(),
            items: [...form.querySelectorAll('.customer-purchase-line')].map((line) => ({
                productId: line.querySelector('[name="productId"]').value,
                quantity: Number(line.querySelector('[name="quantity"]').value),
                ...(line.querySelector('[name="productId"]').value.startsWith('plan:') ? { actualSubtotals: [...line.querySelectorAll('.plan-actual-price')].map((input) => Number(input.value)) } : {})
            }))
        };
        return apiFetch(`/customer/purchases${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    }
    if (name === 'customer-payment') {
        if (id) return apiFetch(`/customer/payments/${id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(formData.get('amount')), paymentDate: formData.get('paymentDate'), paymentMethod: formData.get('paymentMethod'), notes: String(formData.get('notes') || '').trim() }) });
        const data = {
            purchaseId: formData.get('purchaseId'),
            amount: Number(formData.get('amount')),
            paymentDate: formData.get('paymentDate'),
            paymentMethod: formData.get('paymentMethod'),
            notes: String(formData.get('notes') || '').trim()
        };
        return apiFetch('/customer/payments', { method: 'POST', body: JSON.stringify(data) });
    }
    if (name === 'customer-expense') {
        const data = {
            title: String(formData.get('title') || '').trim(),
            category: String(formData.get('category') || '').trim(),
            amount: Number(formData.get('amount')),
            expenseDate: formData.get('expenseDate'),
            description: String(formData.get('description') || '').trim()
        };
        return apiFetch(`/customer/expenses${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    }
    if (id && name === 'purchases') {
        return apiFetch(`/purchases/${id}`, { method: 'PATCH', body: JSON.stringify({ purchaseDate: formData.get('purchaseDate'), remarks: String(formData.get('remarks') || '').trim() }) });
    }
    if (id && name === 'payments') {
        return apiFetch(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(formData.get('amount')), paymentDate: formData.get('paymentDate'), paymentMethod: formData.get('paymentMethod'), notes: String(formData.get('notes') || '').trim() }) });
    }
    if (definitions[name].save) return definitions[name].save({ apiFetch, state }, formData);
    if (name === 'users' && !id) return createManagedUser(formData);
    const data = definitions[name].toPayload ? definitions[name].toPayload(formData) : Object.fromEntries(formData.entries());
    if (name === 'users') delete data.email;
    await apiFetch(`/${name}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
}

async function deleteRecord(name, id) {
    if (name === 'customers') {
        const purchases = await readRecords('purchases');
        if (purchases.some((purchase) => purchase.customerId === id)) throw new Error('This customer is used by purchase records and cannot be deleted.');
    }
    if (name === 'products') {
        const purchases = await readRecords('purchases');
        if (purchases.some((purchase) => purchase.items?.some((item) => item.productId === id))) throw new Error('This product is used by purchase records and cannot be deleted.');
    }
    if (name === 'users' && id === state.user.uid) throw new Error('You cannot delete your signed-in account here.');
    await apiFetch(`/${name}/${id}`, { method: 'DELETE' });
}

async function showPurchase(id) {
    const data = await apiFetch(`/purchases/${id}`);
    const items = (data.items || []).map((item) => `<div class="report-line"><span>${escapeHtml(item.productName)} × ${Number(item.quantity)}</span><strong>${money(item.subtotal)}</strong></div>`).join('');
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>Purchase details</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><div class="report-line"><span>Customer</span><strong>${escapeHtml(data.customerName)}</strong></div><div class="report-line"><span>Date</span><strong>${shortDate(data.purchaseDate)}</strong></div>${items}<div class="report-line"><span>Total / balance</span><strong>${money(data.totalAmount)} / ${money(data.balanceAmount)}</strong></div>${data.remarks ? `<p>${escapeHtml(data.remarks)}</p>` : ''}</div></section></div>`;
}

function showCustomerPurchase(id) {
    const purchase = state.customerPurchaseData?.find((item) => item.id === id);
    if (!purchase) throw new Error('Purchase transaction not found in this period.');
    const items = (purchase.items || []).map((item) => {
        const includedItems = item.includedItems || [];
        const planActualTotal = includedItems.reduce((sum, included) => sum + Number(included.actualSubtotal ?? included.estimatedSubtotal ?? 0), 0);
        const budget = Number(item.planBudget || 0);
        const remaining = budget - planActualTotal;
        const budgetStatus = remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET';
        const planItems = includedItems.length ? `<div class="purchase-detail-plan"><strong>Plan items</strong>${includedItems.map((included) => {
            const estimated = Number(included.estimatedSubtotal ?? included.subtotal ?? Number(included.quantity || 0) * Number(included.estimatedPrice ?? included.price ?? 0));
            const actual = Number(included.actualSubtotal ?? estimated);
            return `<div class="report-line purchase-actual-detail"><span>${escapeHtml(included.itemName || 'Item')} × ${Number(included.quantity || 0)}<small>Estimated ${money(estimated)}</small></span><strong>${money(actual)}</strong></div>`;
        }).join('')}<div class="purchase-plan-summary"><span>Estimated total <strong>${money(item.estimatedTotal ?? 0)}</strong></span><span>Budget <strong>${money(budget)}</strong></span><span>Actual total <strong>${money(planActualTotal * Number(item.quantity || 1))}</strong></span><span>Remaining <strong>${money(remaining)}</strong></span><strong class="plan-budget-status ${budgetStatus === 'OVER BUDGET' ? 'is-over' : budgetStatus === 'ON BUDGET' ? 'is-even' : ''}">${budgetStatus}</strong></div></div>` : '';
        return `<div class="report-line"><span>${escapeHtml(item.productName)} × ${Number(item.quantity)}</span><strong>${money(item.subtotal)}</strong></div>${planItems}`;
    }).join('');
    const actualTotal = purchaseActualTotal(purchase);
    const actualBalance = Math.max(0, actualTotal - Number(purchase.amountPaid || 0));
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">Purchase transaction</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><div class="report-line"><span>ID</span><strong>${escapeHtml(purchase.id)}</strong></div><div class="report-line"><span>Customer</span><strong>${escapeHtml(purchase.customerName || '—')}</strong></div><div class="report-line"><span>Processed by</span><strong>${escapeHtml(purchase.processedBy || '—')}</strong></div><div class="report-line"><span>Purchase date</span><strong>${shortDate(purchase.purchaseDate)}</strong></div>${items}<div class="report-line"><span>Total amount · actual</span><strong>${money(actualTotal)}</strong></div><div class="report-line"><span>Amount paid</span><strong>${money(purchase.amountPaid)}</strong></div><div class="report-line"><span>Balance</span><strong>${money(actualBalance)}</strong></div>${purchase.remarks ? `<p>${escapeHtml(purchase.remarks)}</p>` : ''}</div></section></div>`;
}

async function showPurchaseReceipt(id, customer = false) {
    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) throw new Error('Allow pop-ups to view the receipt.');
    receiptWindow.opener = null;
    try {
        const token = await state.user.getIdToken();
        const receiptPath = customer ? `/api/customer/purchases/${encodeURIComponent(id)}/receipt` : `/api/purchases/${encodeURIComponent(id)}/receipt`;
        const response = await fetch(receiptPath, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not load the receipt.');
        const pdfUrl = URL.createObjectURL(await response.blob());
        receiptWindow.location.replace(pdfUrl);
        receiptWindow.addEventListener('unload', () => URL.revokeObjectURL(pdfUrl), { once: true });
    } catch (error) {
        receiptWindow.close();
        throw error;
    }
}

function printCustomerExpense(id) {
    const expense = state.customerRecordData?.expenses?.find((item) => item.id === id);
    if (!expense) throw new Error('Expense record could not be found.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Allow pop-ups to print this record.');
    printWindow.document.write(`<!doctype html><html><head><title>Expense record</title><style>body{font:16px Arial,sans-serif;color:#172235;max-width:640px;margin:48px auto;padding:24px}h1{font-size:22px;border-bottom:1px solid #ccd4dd;padding-bottom:14px}.line{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid #e3e8ed}.line span{color:#5f7185}.note{margin-top:20px;white-space:pre-wrap}@media print{body{margin:0}}</style></head><body><h1>Expense record</h1><div class="line"><span>Date</span><strong>${shortDate(expense.expenseDate)}</strong></div><div class="line"><span>Expense</span><strong>${escapeHtml(expense.title || 'Expense')}</strong></div><div class="line"><span>Category</span><strong>${escapeHtml(expense.category || '—')}</strong></div><div class="line"><span>Amount</span><strong>${money(expense.amount)}</strong></div>${expense.description ? `<p class="note">${escapeHtml(expense.description)}</p>` : ''}<script>window.addEventListener('load',()=>window.print())<\/script></body></html>`);
    printWindow.document.close();
}

function renderApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    const customer = state.profile.role === 'customer';
    const mainAdmin = state.profile.isMainAdmin === true;
    appScreen.classList.toggle('customer-mode', customer);
    document.querySelectorAll('.workspace-only').forEach((item) => { item.hidden = customer || mainAdmin; });
    document.querySelectorAll('.customer-only').forEach((item) => { item.hidden = !customer; });
    document.querySelector('#account-chip').disabled = !customer;
    document.querySelector('.account-chevron').hidden = !customer;
    document.querySelector('#account-chip').setAttribute('aria-label', customer ? 'Open personal information' : `${state.profile.role || 'Staff'} account`);
    document.querySelector('#account-name').textContent = (customer ? state.profile.username : state.profile.fullName) || state.profile.fullName || state.user.email;
    const accountRole = document.querySelector('#account-role');
    accountRole.hidden = customer;
    if (!customer) accountRole.textContent = state.profile.role || 'staff';
    updateAvatar(document.querySelector('#account-avatar'));
    document.querySelectorAll('.admin-only').forEach((item) => { item.hidden = !mainAdmin || item.classList.contains('workspace-only'); });
    document.querySelector('#admin-nav-label').hidden = !mainAdmin;
    if (customer && !['customer-dashboard', 'catalog', 'my-purchases', 'transactions', 'customer-profile', 'customer-payments', 'customer-payment-report', 'customer-expenses', 'customer-records'].includes(state.view)) state.view = 'customer-dashboard';
    if (!customer && ['customer-dashboard', 'catalog', 'my-purchases', 'transactions'].includes(state.view)) state.view = 'dashboard';
    setView(state.view);
}

renderAuth('customer');
refreshConnectionStatus();
onAuthStateChanged(auth, async (user) => {
        if (!user) {
            state.user = null;
            state.profile = null;
            appScreen.hidden = true;
            authScreen.hidden = false;
            renderAuth(portalMode, pendingAuthError);
            pendingAuthError = '';
            return;
        }
        state.user = user;
        try {
            if (portalMode === 'customer') {
                state.profile = profileProvisioning ? await profileProvisioning : null;
                if (!state.profile) {
                    const details = { fullName: user.displayName || user.email || 'Customer' };
                    try {
                        state.profile = await loadCustomerProfile(user, details);
                    } catch (error) {
                        // Accounts created before profile provisioning was wired up may exist in Auth only.
                        if (/customer access required|profile is not ready/i.test(error.message || '')) {
                            state.profile = await loadCustomerProfile(user, details, true);
                        } else throw error;
                    }
                }
            } else {
                const token = await user.getIdToken();
                const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || 'Your account cannot access this workspace.');
                state.profile = result;
            }
            if ((state.profile.role === 'customer') !== (portalMode === 'customer')) {
                pendingAuthError = state.profile.role === 'customer' ? 'This account uses customer access.' : 'This account uses the admin sign-in option.';
                await signOut(auth);
                return;
            }
            renderApp();
        } catch (error) {
            pendingAuthError = authErrorMessage(error);
            await signOut(auth);
        }
});

document.addEventListener('submit', async (event) => {
    const authForm = event.target.closest('[data-auth-form]');
    const recordForm = event.target.closest('[data-record-form]');
    if (!authForm && !recordForm) return;
    event.preventDefault();
    const submitButton = event.target.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
        if (authForm) {
            const values = new FormData(authForm);
            if (authForm.dataset.authForm === 'signup') {
                if (values.get('password') !== values.get('confirmPassword')) throw new Error('Passwords do not match.');
                if (!values.get('acceptTerms')) throw new Error('Please accept the Terms and Conditions to create your account.');
                let finishProvisioning;
                profileProvisioning = new Promise((resolve) => { finishProvisioning = resolve; });
                try {
                    const credential = await createUserWithEmailAndPassword(auth, values.get('email'), values.get('password'));
                    const details = { fullName: String(values.get('fullName')).trim(), username: String(values.get('username')).trim(), mobileNumber: String(values.get('mobileNumber') || '').trim(), address: String(values.get('address') || '').trim(), acceptedTerms: true };
                    await loadCustomerProfile(credential.user, details, true);
                    const profile = await loadCustomerProfile(credential.user, details);
                    finishProvisioning(profile);
                } finally {
                    finishProvisioning(null);
                    profileProvisioning = null;
                }
            } else {
                await signInWithEmailAndPassword(auth, values.get('email'), values.get('password'));
            }
        } else {
            const editing = Boolean(recordForm.dataset.id);
            const savedRecord = await saveRecord(recordForm);
            const view = recordForm.dataset.recordForm;
            closeModal();
            if (view === 'customer-profile') {
                state.profile = { ...state.profile, ...savedRecord };
                document.querySelector('#account-name').textContent = (state.profile.role === 'customer' ? state.profile.username : state.profile.fullName) || state.profile.fullName || state.user.email;
                updateAvatar(document.querySelector('#account-avatar'));
                notify('Profile updated.');
                return setView('customer-profile');
            }
            if (view === 'customer-product') {
                notify(editing ? 'Product or service updated.' : 'Product or service added to your list.');
                return setView('catalog');
            }
            if (view === 'customer-plan') {
                notify(editing ? 'Plan updated.' : 'Plan added to your list.');
                return setView('catalog');
            }
            if (view === 'customer-contact') {
                notify('Customer contact saved.');
                return setView('customer-contacts');
            }
            if (view === 'customer-purchase') {
                notify(editing ? 'Purchase transaction updated.' : 'Purchase added to your history.');
                return setView('my-purchases');
            }
            if (view === 'customer-payment') {
                notify(editing ? 'Payment updated.' : 'Payment recorded.');
                return setView('customer-payments');
            }
            if (view === 'customer-expense') {
                notify(editing ? 'Expense updated.' : 'Expense saved to your history.');
                return setView('customer-expenses');
            }
            notify('Record saved.');
            await renderCollectionView(view);
        }
    } catch (error) {
        if (authForm) renderAuth(authForm.dataset.portalMode === 'admin' ? 'admin' : authForm.dataset.authForm, authErrorMessage(error));
        else notify(error.message || 'Could not save this record.', true);
    } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
    }
});

document.addEventListener('click', async (event) => {
    const termsLink = event.target.closest('[data-terms-link]');
    if (termsLink) {
        event.preventDefault();
        const termsTab = window.open(termsLink.href, '_blank');
        if (termsTab) termsTab.opener = null;
        return;
    }
    const passwordToggle = event.target.closest('[data-password-toggle]');
    if (passwordToggle) {
        const input = document.getElementById(passwordToggle.dataset.passwordToggle);
        if (input) {
            const showing = input.type === 'password';
            input.type = showing ? 'text' : 'password';
            passwordToggle.setAttribute('aria-pressed', String(showing));
            passwordToggle.setAttribute('aria-label', `${showing ? 'Hide' : 'Show'} ${input.name === 'confirmPassword' ? 'confirm password' : 'password'}`);
            passwordToggle.dataset.visible = String(showing);
        }
        return;
    }
    if (event.target.closest('#mobile-menu-toggle')) {
        return setMobileNavigationOpen(document.querySelector('#mobile-menu-toggle')?.getAttribute('aria-expanded') !== 'true');
    }
    if (event.target.closest('#mobile-nav-backdrop')) return setMobileNavigationOpen(false);
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
        setMobileNavigationOpen(false);
        return setView(viewButton.dataset.view);
    }
    if (event.target.closest('[data-auth-portal="admin"]')) return renderAuth('admin');
    if (event.target.closest('[data-auth-portal="customer"]')) return renderAuth('customer');
    if (event.target.closest('[data-auth-toggle]')) return renderAuth(authScreen.querySelector('[data-auth-form]')?.dataset.authForm === 'signin' ? 'signup' : 'customer');
    if (event.target.closest('[data-password-reset]')) {
        const emailInput = authScreen.querySelector('[name="email"]');
        if (!emailInput?.reportValidity()) return;
        try {
            await sendPasswordResetEmail(auth, emailInput.value.trim());
            notify('Password reset email sent. Check your inbox.');
        } catch {
            notify('Could not send a reset email. Check the address and try again.', true);
        }
        return;
    }
    if (event.target.closest('#sign-out')) return signOut(auth);
    if (event.target.closest('button[data-close-modal]') || event.target.matches('.modal-backdrop[data-close-modal]')) return closeModal();
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action, collection: name, id } = actionButton.dataset;
    try {
        if (action === 'registered-user-filter') {
            state.registeredUserStatus = actionButton.dataset.filter || 'all';
            return renderUserManagement(state.registeredUserSearch, false);
        }
        if (action === 'registered-user-details') return showRegisteredUserDetails(id);
        if (action === 'registered-user-status') {
            await apiFetch(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: actionButton.dataset.status }) });
            notify(`User account ${actionButton.dataset.status === 'active' ? 'activated' : 'deactivated'}.`);
            state.registeredUsers = null;
            return renderUserManagement(state.registeredUserSearch);
        }
        if (action === 'registered-user-delete') {
            const user = state.registeredUsers?.find((item) => item.id === id);
            if (!window.confirm(`Delete ${user?.email || 'this account'}? This permanently removes their sign-in.`)) return;
            await apiFetch(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('User account deleted.');
            state.registeredUsers = null;
            return renderUserManagement(state.registeredUserSearch);
        }
        if (action === 'customer-selection-cancel') {
            const collection = state.recordSelection.collection;
            state.recordSelection = { collection, ids: new Set(), active: false };
            return renderRecordCollectionSelection(collection);
        }
        if (action === 'bulk-delete') {
            const selectedIds = [...state.recordSelection.ids];
            if (!selectedIds.length) return;
            if (!window.confirm(`Delete ${selectedIds.length} selected ${name} records? This cannot be undone.`)) return;
            if (name.startsWith('customer-')) {
                const kind = name.slice('customer-'.length);
                const route = { purchases: 'purchases', payments: 'payments', expenses: 'expenses' }[kind];
                if (!route) return;
                if (kind === 'purchases') {
                    const payments = await apiFetch('/customer/payments');
                    if (selectedIds.some((purchaseId) => payments.some((payment) => payment.purchaseId === purchaseId))) {
                        throw new Error('Delete linked payments before deleting their purchases.');
                    }
                }
                for (const selectedId of selectedIds) await apiFetch(`/customer/${route}/${selectedId}`, { method: 'DELETE' });
                state.recordSelection = { collection: name, ids: new Set() };
                notify(`${selectedIds.length} records deleted.`);
                return setView({ purchases: 'my-purchases', payments: 'customer-payments', expenses: 'customer-expenses' }[kind]);
            }
            if (name === 'purchases') {
                const payments = await apiFetch('/payments');
                state.records.payments = payments;
                if (selectedIds.some((purchaseId) => payments.some((payment) => payment.purchaseId === purchaseId))) {
                    throw new Error('Delete linked payments before deleting their purchases.');
                }
            }
            for (const selectedId of selectedIds) await deleteRecord(name, selectedId);
            state.recordSelection = { collection: name, ids: new Set() };
            notify(`${selectedIds.length} ${name} records deleted.`);
            return renderCollectionView(name);
        }
        if (action === 'new') return openForm(name);
        if (action === 'new-customer-purchase') return openCustomerPurchaseForm();
        if (action === 'customer-catalog-filter') {
            state.customerCatalogFilter = actionButton.dataset.filter || 'all';
            const filter = state.customerCatalogFilter;
            viewContainer.querySelectorAll('[data-action="customer-catalog-filter"]').forEach((button) => {
                const active = button.dataset.filter === filter;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            const productsSection = viewContainer.querySelector('.catalog-products-section');
            const plansSection = viewContainer.querySelector('.catalog-plans-section');
            if (productsSection) productsSection.hidden = filter === 'plans';
            if (plansSection) plansSection.hidden = filter === 'products';
            return;
        }
        if (action === 'customer-product-toggle') {
            const status = actionButton.dataset.status;
            await apiFetch(`/customer/products/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
            notify(`Product or service set to ${status}.`);
            return renderCustomerCatalog();
        }
        if (action === 'customer-product-edit') {
            const product = state.customerProductData.find((item) => item.id === id);
            if (!product) throw new Error('Product or service could not be found. Refresh the page and try again.');
            return openCustomerProductForm(product);
        }
        if (action === 'customer-product-delete') {
            const product = state.customerProductData.find((item) => item.id === id);
            if (!product) throw new Error('Product or service could not be found. Refresh the page and try again.');
            if (!window.confirm(`Delete ${product.productName}?`)) return;
            await apiFetch(`/customer/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Product or service deleted.');
            return renderCustomerCatalog();
        }
        if (action === 'new-customer-product') return openCustomerProductForm();
        if (action === 'new-customer-plan') return openCustomerPlanForm();
        if (action === 'customer-plan-edit') {
            const plan = state.customerPlanData.find((item) => item.id === id);
            if (!plan) throw new Error('Plan could not be found. Refresh the page and try again.');
            return openCustomerPlanForm(plan);
        }
        if (action === 'add-customer-plan-item') { modalRoot.querySelector('[data-customer-plan-items]').insertAdjacentHTML('beforeend', customerPlanItemMarkup()); updateCustomerPlanTotal(); return; }
        if (action === 'remove-customer-plan-item') { actionButton.closest('.customer-plan-item')?.remove(); updateCustomerPlanTotal(); return; }
        if (action === 'customer-plan-toggle') {
            await apiFetch(`/customer/plans/${encodeURIComponent(id)}/state`, { method: 'PATCH', body: JSON.stringify({ state: actionButton.dataset.state }) });
            notify(`Plan set to ${actionButton.dataset.state}.`);
            return renderCustomerCatalog();
        }
        if (action === 'customer-plan-delete') {
            if (!window.confirm('Delete this purchase plan?')) return;
            await apiFetch(`/customer/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Purchase plan deleted.');
            return renderCustomerCatalog();
        }
        if (action === 'new-customer-contact') return openCustomerContactForm();
        if (action === 'edit-customer-contact') return openCustomerContactForm(state.customerContacts.find((contact) => contact.id === id));
        if (action === 'delete-customer-contact') {
            if (!window.confirm('Delete this customer contact?')) return;
            await apiFetch(`/customer/contacts/${id}`, { method: 'DELETE' });
            notify('Customer contact deleted.');
            return renderCustomerContacts();
        }
        if (action === 'customer-purchase-edit') return openCustomerPurchaseEditForm(id);
        if (action === 'customer-payment-edit') return openCustomerPaymentEditForm(id);
        if (action === 'customer-expense-edit') return openCustomerExpenseForm(state.customerExpenseData?.find((expense) => expense.id === id));
        if (action === 'customer-record-delete') {
            const kind = actionButton.dataset.kind;
            if (!window.confirm('Delete this record? This cannot be undone.')) return;
            await apiFetch(`/customer/${kind}/${id}`, { method: 'DELETE' });
            notify('Record deleted.');
            return setView({ purchases: 'my-purchases', payments: 'customer-payments', expenses: 'customer-expenses' }[kind]);
        }
                if (action === 'add-customer-purchase-line') {
                    const lines = modalRoot.querySelector('[data-customer-purchase-lines]');
                    const template = lines?.querySelector('.customer-purchase-line');
                    if (!lines || !template) return;
                    const line = template.cloneNode(true);
                    line.querySelector('[name="productId"]').value = '';
                    line.querySelector('[name="quantity"]').value = '1';
                    const panel = line.querySelector('[data-plan-actuals]');
                    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
                    lines.append(line);
                    updateCustomerPurchaseTotal();
                    line.querySelector('[name="productId"]').focus();
                    return;
                }
                if (action === 'remove-customer-purchase-line') {
                    if (modalRoot.querySelectorAll('.customer-purchase-line').length > 1) {
                        actionButton.closest('.customer-purchase-line').remove();
                        updateCustomerPurchaseTotal();
                    }
                    return;
                }
        if (action === 'new-customer-payment') return openCustomerPaymentForm();
        if (action === 'new-customer-expense') return openCustomerExpenseForm();
        if (action === 'customer-record-filter') return renderCustomerRecords(actionButton.dataset.filter, false);
        if (action === 'print-customer-records') return printCustomerRecords();
        if (action === 'customer-record-print') {
            if (actionButton.dataset.recordType === 'Expense') return printCustomerExpense(actionButton.dataset.recordId);
            return showPurchaseReceipt(actionButton.dataset.recordId, true);
        }
        if (action === 'retry-view') return setView(state.view);
        if (action === 'add-line') {
            const lineItems = actionButton.closest('.field')?.querySelector('[data-line-items]');
            lineItems?.insertAdjacentHTML('beforeend', purchaseLineMarkup());
            return;
        }
        if (action === 'remove-line') { const lines = modalRoot.querySelectorAll('.purchase-line'); if (lines.length > 1) actionButton.closest('.purchase-line').remove(); return; }
        if (action === 'edit') {
            const rows = await readRecords(name);
            return openForm(name, rows.find((row) => row.id === id));
        }
        if (action === 'delete') {
            if (!window.confirm('Delete this record?')) return;
            await deleteRecord(name, id);
            notify('Record deleted.');
            return renderCollectionView(name);
        }
        if (action === 'purchase-view') return showPurchase(id);
        if (action === 'purchase-receipt') return showPurchaseReceipt(id);
        if (action === 'customer-purchase-view') return showCustomerPurchase(id);
        if (action === 'customer-purchase-receipt') return showPurchaseReceipt(id, true);
        if (action === 'customer-purchase') {
            return openCustomerPurchaseForm(id);
        }
        if (action === 'filter-report') return renderReports({ apiFetch, escapeHtml, money, viewContainer }, document.querySelector('#report-from').value, document.querySelector('#report-to').value);
    } catch (error) {
        notify(error.message || 'That action could not be completed.', true);
    }
});

let recordPressTimer = null;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMobileNavigationOpen(false);
});

function renderRecordCollectionSelection(collection) {
    if (collection === 'customer-purchases') return renderCustomerPurchases(state.customerCalendarPeriod, state.customerCalendarDate, document.querySelector('#customer-purchase-search')?.value || '', false);
    if (collection === 'customer-payments') return renderCustomerPayments(state.customerCalendarPeriod, state.customerCalendarDate);
    if (collection === 'customer-expenses') return renderCustomerExpenses(state.customerCalendarPeriod, state.customerCalendarDate);
    return renderCollectionView(collection, document.querySelector('#record-search')?.value || '', { refresh: false });
}

document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const row = event.target.closest('tr[data-record-id][data-record-collection]');
    if (!row || event.target.closest('button, a, input, select, textarea')) return;
    const collection = row.dataset.recordCollection;
    if (!['purchases', 'payments', 'expenses', 'customer-purchases', 'customer-payments', 'customer-expenses'].includes(collection)) return;
    window.clearTimeout(recordPressTimer);
    recordPressTimer = window.setTimeout(() => {
        if (state.recordSelection.active && state.recordSelection.collection !== collection) return;
        const selectedIds = state.recordSelection.collection === collection ? new Set(state.recordSelection.ids) : new Set();
        selectedIds.add(row.dataset.recordId);
        state.recordSelection = { collection, ids: selectedIds, active: true };
        renderRecordCollectionSelection(collection)?.catch((error) => notify(error.message, true));
    }, 550);
});

for (const eventName of ['pointerup', 'pointercancel']) {
    document.addEventListener(eventName, () => window.clearTimeout(recordPressTimer));
}

document.addEventListener('input', (event) => {
    if (event.target.matches('input[type="tel"]')) {
        const input = event.target;
        const start = input.selectionStart;
        const digitsBeforeCursor = input.value.slice(0, start ?? input.value.length).replace(/\D/g, '').length;
        input.value = input.value.replace(/\D/g, '');
        const cursor = Math.min(digitsBeforeCursor, input.value.length);
        input.setSelectionRange(cursor, cursor);
    }
    if (event.target.id === 'customer-record-search') {
        state.customerRecordSearch = event.target.value;
        renderCustomerRecords(state.customerRecordFilter, false, state.customerCalendarPeriod, state.customerCalendarDate, true).catch((error) => notify(error.message, true));
    }
    if (event.target.id === 'record-search') {
        state.recordSelection = { collection: state.view, ids: new Set(), active: false };
        renderCollectionView(state.view, event.target.value, { refresh: false, restoreFocus: true }).catch((error) => notify(error.message, true));
    }
    if (event.target.id === 'customer-purchase-search') {
        state.recordSelection = { collection: 'customer-purchases', ids: new Set(), active: false };
        renderCustomerPurchases(state.customerCalendarPeriod, state.customerCalendarDate, event.target.value, false, true).catch((error) => notify(error.message, true));
    }
    if (event.target.id === 'customer-account-search') renderCustomerAccounts(event.target.value, true, false).catch((error) => notify(error.message, true));
    if (event.target.id === 'registered-user-search') renderUserManagement(event.target.value, false).catch((error) => notify(error.message, true));
    if (event.target.id === 'customer-contact-search') renderCustomerContacts(event.target.value, true, false).catch((error) => notify(error.message, true));
    if (event.target.closest('[data-record-form="customer-purchase"]')) updateCustomerPurchaseTotal();
    if (event.target.closest('[data-record-form="customer-plan"]')) updateCustomerPlanTotal();
    if (event.target.closest('[data-record-form="customer-payment"]')) updateCustomerPaymentEstimate();
});

document.addEventListener('change', (event) => {
    if (event.target.id === 'record-select-all' || event.target.matches('.record-row-select')) {
        const selectedIds = state.recordSelection.ids;
        const rowCheckboxes = [...viewContainer.querySelectorAll('.record-row-select')];
        if (event.target.id === 'record-select-all') {
            selectedIds.clear();
            if (event.target.checked) rowCheckboxes.forEach((checkbox) => selectedIds.add(checkbox.value));
        } else if (event.target.checked) selectedIds.add(event.target.value);
        else selectedIds.delete(event.target.value);
        const selectAll = viewContainer.querySelector('#record-select-all');
        const selectedVisible = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
        if (selectAll && event.target.id !== 'record-select-all') {
            selectAll.checked = rowCheckboxes.length > 0 && selectedVisible === rowCheckboxes.length;
            selectAll.indeterminate = selectedVisible > 0 && selectedVisible < rowCheckboxes.length;
        }
        const bulkDelete = viewContainer.querySelector('[data-action="bulk-delete"]');
        if (bulkDelete) {
            bulkDelete.disabled = selectedIds.size === 0;
            bulkDelete.querySelector('span').textContent = selectedIds.size || '';
            bulkDelete.title = selectedIds.size ? `Delete ${selectedIds.size} selected records` : 'Delete selected records';
        }
        return;
    }
    if (event.target.id === 'customer-calendar-period' || event.target.id === 'customer-calendar-date') {
        const period = document.querySelector('#customer-calendar-period')?.value || 'month';
        const date = document.querySelector('#customer-calendar-date')?.value;
        if (date) renderCustomerCalendarView(period, date)?.catch((error) => notify(error.message, true));
    }
    if (event.target.id === 'registered-user-period' || event.target.id === 'registered-user-date') {
        state.registeredUserPeriod = document.querySelector('#registered-user-period')?.value || 'all';
        state.registeredUserDate = document.querySelector('#registered-user-date')?.value || localDateInputValue(new Date());
        renderUserManagement(state.registeredUserSearch, false).catch((error) => notify(error.message, true));
    }
    if (event.target.id === 'transaction-period' || event.target.id === 'transaction-date') {
        const period = document.querySelector('#transaction-period')?.value || 'month';
        const anchorDate = document.querySelector('#transaction-date')?.value;
        if (anchorDate) renderCustomerTransactions(period, anchorDate).catch((error) => notify(error.message, true));
    }
    if (event.target.closest('[data-record-form="customer-purchase"]')) {
        if (event.target.matches('[name="productId"]')) updateCustomerPurchasePlanDetails(event.target.closest('.customer-purchase-line'));
        else updateCustomerPurchaseTotal();
    }
    if (event.target.closest('[data-record-form="customer-plan"]')) updateCustomerPlanTotal();
    if (event.target.closest('[data-record-form="customer-payment"]')) updateCustomerPaymentEstimate();
    if (event.target.matches('[name="avatarId"]') && event.target.closest('[data-record-form="customer-profile"]')) {
        updateAvatar(document.querySelector('#profile-photo-preview'), { ...state.profile, avatarId: event.target.value });
    }
});
