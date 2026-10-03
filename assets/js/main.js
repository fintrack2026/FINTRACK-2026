import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

const authScreen = document.querySelector('#auth-screen');
const appScreen = document.querySelector('#app-screen');
const viewContainer = document.querySelector('#view-container');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');

const state = { user: null, profile: null, view: 'dashboard', records: {} };

const definitions = {
    customers: {
        title: 'Customers', description: 'Keep customer details and contact information together.',
        columns: [['customerName', 'Name'], ['contactNumber', 'Contact'], ['email', 'Email'], ['createdAt', 'Added']],
        fields: [['customerName', 'Customer name', 'text', true], ['contactNumber', 'Contact number', 'tel'], ['email', 'Email', 'email'], ['address', 'Address', 'textarea']]
    },
    products: {
        title: 'Products & services', description: 'Manage your catalogue, prices, and stock levels.',
        columns: [['productName', 'Name'], ['category', 'Category'], ['type', 'Type'], ['price', 'Price'], ['stockQuantity', 'Stock'], ['status', 'Status']],
        fields: [['productName', 'Name', 'text', true], ['category', 'Category', 'text'], ['description', 'Description', 'textarea'], ['type', 'Type', 'select', true, ['product', 'service']], ['price', 'Price', 'number', true], ['stockQuantity', 'Stock quantity', 'number'], ['status', 'Status', 'select', true, ['active', 'inactive']]]
    },
    expenses: {
        title: 'Expenses', description: 'Record and review business expenses.',
        columns: [['title', 'Expense'], ['category', 'Category'], ['amount', 'Amount'], ['expenseDate', 'Date']],
        fields: [['title', 'Expense name', 'text', true], ['category', 'Category', 'text', true], ['amount', 'Amount', 'number', true], ['expenseDate', 'Expense date', 'date', true], ['description', 'Description', 'textarea']]
    },
    purchases: {
        title: 'Purchases', description: 'Track customer purchases, balances, and stock changes.',
        columns: [['purchaseDate', 'Date'], ['customerName', 'Customer'], ['totalAmount', 'Total'], ['amountPaid', 'Paid'], ['balanceAmount', 'Balance'], ['paymentStatus', 'Status']],
        fields: []
    },
    payments: {
        title: 'Payments', description: 'Apply customer payments to outstanding purchase balances.',
        columns: [['paymentDate', 'Date'], ['customerName', 'Customer'], ['purchaseId', 'Purchase'], ['amount', 'Amount'], ['notes', 'Notes']],
        fields: []
    },
    users: {
        title: 'Users', description: 'Create accounts and manage workspace access.',
        columns: [['fullName', 'Name'], ['email', 'Email'], ['role', 'Role']],
        fields: []
    }
};

const titles = {
    dashboard: 'Business overview', customers: 'Customers', products: 'Products & services',
    purchases: 'Purchases', payments: 'Payments', expenses: 'Expenses', reports: 'Reports', users: 'Users'
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

function renderSetup() {
    authScreen.innerHTML = `
        <section class="auth-art">
            <a class="brand" href="#"><span class="brand-mark">F</span><span>fintrack</span></a>
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

function renderAuth(mode = 'signin', error = '') {
    const creating = mode === 'signup';
    authScreen.innerHTML = `
        <section class="auth-art">
            <a class="brand" href="#"><span class="brand-mark">F</span><span>fintrack</span></a>
            <div class="auth-art-copy"><h1>Clear books.<br>Better decisions.</h1><p>A focused workspace for customers, purchases, payments, and everyday business costs.</p></div>
            <div class="auth-art-foot">FINTRACK BUSINESS RECORDS</div>
        </section>
        <section class="auth-panel"><div class="auth-card">
            <h2>${creating ? 'Create your account' : 'Welcome back'}</h2>
            <p>${creating ? 'Start a fresh Fintrack workspace.' : 'Sign in to your business workspace.'}</p>
            ${error ? `<div class="form-error" role="alert">${escapeHtml(error)}</div>` : ''}
            <form class="auth-form" data-auth-form="${creating ? 'signup' : 'signin'}">
                ${creating ? '<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="fullName" autocomplete="name" required></div>' : ''}
                <div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div>
                <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" minlength="6" required></div>
                <button class="button" type="submit">${creating ? 'Create account' : 'Sign in'}</button>
            </form>
            <p class="auth-switch">${creating ? 'Already registered?' : 'New to Fintrack?'} <button class="text-button" type="button" data-auth-toggle>${creating ? 'Sign in' : 'Create an account'}</button></p>
        </div></section>`;
}

async function apiFetch(path, options = {}) {
    if (!state.user) throw new Error('Authentication required.');
    const token = await state.user.getIdToken();
    const response = await fetch(`/api${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'The request could not be completed.');
    return response.status === 204 ? null : response.json();
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
    if (!titles[view] || (view === 'users' && state.profile?.role !== 'admin')) return;
    state.view = view;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
    document.querySelector('#section-name').textContent = view.toUpperCase();
    document.querySelector('#page-title').textContent = titles[view];
    renderView().catch((error) => notify(error.message || 'Could not load this section.', true));
}

async function renderView() {
    viewContainer.innerHTML = '<div class="loading">Loading records…</div>';
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'reports') return renderReports();
    return renderCollectionView(state.view);
}

function metric(label, value, note, icon) {
    return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon" aria-hidden="true">${icon}</span></div><strong class="metric-value">${value}</strong><span class="metric-note">${note}</span></article>`;
}

async function renderDashboard() {
    await readAll(['customers', 'products', 'purchases', 'expenses']);
    const customers = state.records.customers;
    const products = state.records.products;
    const purchases = state.records.purchases;
    const expenses = state.records.expenses;
    const sales = purchases.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const receivables = purchases.reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);
    const recent = [...purchases].sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''))).slice(0, 6);

    viewContainer.innerHTML = `
        <div class="view-heading"><div><h2>At a glance</h2><p>Your business activity in one place.</p></div><button class="button" data-action="new" data-collection="purchases">New purchase</button></div>
        <div class="metrics">
            ${metric('Total sales', money(sales), `${purchases.length} purchase records`, '↗')}
            ${metric('Outstanding', money(receivables), 'Customer balances due', '₱')}
            ${metric('Customers', customers.length, 'Active customer records', '◉')}
            ${metric('Expenses', money(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)), `${expenses.length} expense records`, '↘')}
        </div>
        <section class="panel"><div class="panel-header"><h3>Recent purchases</h3><button class="text-button" data-view="purchases">View all</button></div>
            ${recent.length ? purchaseTable(recent) : emptyState('No purchases yet', 'Create a purchase to start tracking sales.')}
        </section>
        <p class="metric-note" style="margin-top:14px">${products.length} products and services in your catalogue</p>`;
}

function emptyState(title, message) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
}

function purchaseTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>TOTAL</th><th>PAID</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${shortDate(row.purchaseDate)}</td><td>${escapeHtml(row.customerName || 'Customer')}</td><td>${money(row.totalAmount)}</td><td>${money(row.amountPaid)}</td><td>${money(row.balanceAmount)}</td><td>${statusPill(row.paymentStatus)}</td></tr>`).join('')}</tbody></table></div>`;
}

function statusPill(value) {
    const text = String(value || 'active');
    const cls = ['unpaid', 'inactive', 'overdue'].includes(text.toLowerCase()) ? ` ${text.toLowerCase()}` : '';
    return `<span class="status-pill${cls}">${escapeHtml(text)}</span>`;
}

async function renderCollectionView(name, filterText = '') {
    const definition = definitions[name];
    let rows = await readRecords(name);
    if (name === 'payments' && rows.length) {
        const customers = await readRecords('customers');
        const purchases = await readRecords('purchases');
        rows = rows.map((row) => ({
            ...row,
            customerName: row.customerName || customers.find((customer) => customer.id === row.customerId)?.customerName || 'Customer',
            purchaseId: row.purchaseLabel || purchases.find((purchase) => purchase.id === row.purchaseId)?.purchaseDate || row.purchaseId
        }));
    }
    rows.sort((a, b) => String(b.createdAt || b.purchaseDate || b.expenseDate || b.paymentDate || '').localeCompare(String(a.createdAt || a.purchaseDate || a.expenseDate || a.paymentDate || '')));
    if (filterText) {
        const needle = filterText.toLowerCase();
        rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)));
    }

    const canWrite = name !== 'purchases' && name !== 'payments' && (name !== 'users' || state.profile?.role === 'admin');
    const addLabel = { customers: 'Add customer', products: 'Add product', expenses: 'Add expense', purchases: 'New purchase', payments: 'Record payment', users: 'Add user' }[name];
    const rowsHtml = rows.length ? `<div class="table-wrap"><table><thead><tr>${definition.columns.map((column) => `<th>${column[1].toUpperCase()}</th>`).join('')}<th>ACTIONS</th></tr></thead><tbody>
        ${rows.map((row) => `<tr>${definition.columns.map(([field]) => `<td>${formatCell(field, row[field], row)}</td>`).join('')}<td><div class="row-actions">${name === 'purchases' ? `<button class="small-button" data-action="purchase-view" data-id="${escapeHtml(row.id)}">Details</button>` : ''}${name === 'payments' ? '' : name === 'users' ? `<button class="small-button" data-action="edit" data-collection="users" data-id="${escapeHtml(row.id)}">Role</button>` : canWrite ? `<button class="small-button" data-action="edit" data-collection="${name}" data-id="${escapeHtml(row.id)}">Edit</button><button class="small-button delete" data-action="delete" data-collection="${name}" data-id="${escapeHtml(row.id)}">Delete</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table></div>` : emptyState(`No ${definition.title.toLowerCase()} found`, 'New records will appear here.');

    viewContainer.innerHTML = `<div class="view-heading"><div><h2>${definition.title}</h2><p>${definition.description}</p></div><div class="toolbar"><input type="search" id="record-search" placeholder="Search ${definition.title.toLowerCase()}" value="${escapeHtml(filterText)}" aria-label="Search ${definition.title}"><button class="button" data-action="new" data-collection="${name}">${addLabel}</button></div></div><section class="panel">${rowsHtml}</section>`;
}

function formatCell(field, value, row) {
    if (field === 'price' || field === 'amount' || field === 'totalAmount' || field === 'amountPaid' || field === 'balanceAmount') return money(value);
    if (field.toLowerCase().includes('date') || field === 'createdAt') return shortDate(value);
    if (field === 'status' || field === 'paymentStatus' || field === 'role') return statusPill(value);
    if (field === 'customerName' && row.customerId && !value) return 'Customer';
    return escapeHtml(value ?? '—');
}

async function renderReports(from = '', to = '') {
    await readAll(['purchases', 'expenses']);
    const insideRange = (value) => (!from || String(value) >= from) && (!to || String(value) <= to);
    const purchases = state.records.purchases.filter((row) => insideRange(row.purchaseDate));
    const expenses = state.records.expenses.filter((row) => insideRange(row.expenseDate));
    const salesTotal = purchases.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const paidTotal = purchases.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
    const dueTotal = purchases.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0);
    viewContainer.innerHTML = `
        <div class="view-heading"><div><h2>Financial reports</h2><p>Totals are calculated from your Firestore records.</p></div></div>
        <section class="panel" style="margin-bottom:14px"><div class="panel-header"><h3>Date range</h3></div><div class="panel-body"><div class="toolbar" style="padding:12px 0"><label class="field">From<input type="date" id="report-from" value="${escapeHtml(from)}"></label><label class="field">To<input type="date" id="report-to" value="${escapeHtml(to)}"></label><button class="button" data-action="filter-report">Apply</button></div></div></section>
        <div class="report-grid"><section class="panel"><div class="panel-header"><h3>Profit & loss</h3></div><div class="panel-body"><div class="report-line"><span>Sales</span><strong>${money(salesTotal)}</strong></div><div class="report-line"><span>Expenses</span><strong>${money(expenseTotal)}</strong></div><div class="report-line"><span>Net</span><strong>${money(salesTotal - expenseTotal)}</strong></div></div></section>
        <section class="panel"><div class="panel-header"><h3>Receivables</h3></div><div class="panel-body"><div class="report-line"><span>Collected</span><strong>${money(paidTotal)}</strong></div><div class="report-line"><span>Outstanding</span><strong>${money(dueTotal)}</strong></div><div class="report-line"><span>Transactions</span><strong>${purchases.length}</strong></div></div></section></div>`;
}

function fieldMarkup([name, label, type, required = false, options = []], value = '') {
    const safeName = escapeHtml(name);
    const safeValue = escapeHtml(value ?? '');
    if (type === 'textarea') return `<div class="field"><label for="field-${safeName}">${label}</label><textarea id="field-${safeName}" name="${safeName}">${safeValue}</textarea></div>`;
    if (type === 'select') return `<div class="field"><label for="field-${safeName}">${label}</label><select id="field-${safeName}" name="${safeName}" ${required ? 'required' : ''}><option value="">Select ${label.toLowerCase()}</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>`;
    const numeric = type === 'number' ? ' min="0" step="0.01"' : '';
    return `<div class="field"><label for="field-${safeName}">${label}</label><input id="field-${safeName}" name="${safeName}" type="${type}" value="${safeValue}" ${required ? 'required' : ''}${numeric}></div>`;
}

function optionList(rows, idField, labelField, selected = '') {
    return `<option value="">Choose one</option>${rows.map((row) => `<option value="${escapeHtml(row.id)}" ${selected === row.id ? 'selected' : ''}>${escapeHtml(row[labelField] || row[idField] || 'Unnamed')}</option>`).join('')}`;
}

async function openForm(name, record = null) {
    if (name === 'purchases') await readAll(['customers', 'products']);
    if (name === 'payments') await readAll(['purchases', 'customers']);
    let fields = '';
    if (name === 'purchases') {
        fields = `<div class="field"><label>Customer</label><select name="customerId" required>${optionList(state.records.customers, 'id', 'customerName')}</select></div>
            <div class="field"><label>Items</label><div data-line-items>${purchaseLineMarkup()}</div><button class="small-button" type="button" data-action="add-line">Add another item</button></div>
            ${fieldMarkup(['purchaseDate', 'Purchase date', 'date', true], new Date().toISOString().slice(0, 10))}
            ${fieldMarkup(['remarks', 'Remarks', 'textarea'])}`;
    } else if (name === 'payments') {
        const duePurchases = state.records.purchases.filter((purchase) => Number(purchase.balanceAmount) > 0);
        fields = `<div class="field"><label>Purchase</label><select name="purchaseId" required>${optionList(duePurchases, 'id', 'customerName')}</select></div>
            ${fieldMarkup(['amount', 'Amount received', 'number', true])}
            ${fieldMarkup(['paymentDate', 'Payment date', 'date', true], new Date().toISOString().slice(0, 10))}
            ${fieldMarkup(['notes', 'Notes', 'textarea'])}`;
    } else if (name === 'users') {
        if (record) {
            fields = `<div class="field"><label>Name</label><input value="${escapeHtml(record.fullName)}" disabled></div><div class="field"><label>Email</label><input value="${escapeHtml(record.email)}" disabled></div>${fieldMarkup(['role', 'Role', 'select', true, ['staff', 'admin']], record.role)}`;
        } else {
            fields = `${fieldMarkup(['fullName', 'Full name', 'text', true])}${fieldMarkup(['email', 'Email', 'email', true])}${fieldMarkup(['password', 'Temporary password', 'password', true])}${fieldMarkup(['role', 'Role', 'select', true, ['staff', 'admin']], 'staff')}`;
        }
    } else {
        fields = definitions[name].fields.map((field) => fieldMarkup(field, record?.[field[0]] ?? (field[0] === 'status' ? 'active' : ''))).join('');
    }
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${record ? 'Edit' : 'Add'} ${definitions[name].title.replace(/s$/, '')}</h2><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-content"><form class="data-form" data-record-form="${name}" data-id="${escapeHtml(record?.id || '')}">${fields}<div class="modal-actions"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button" type="submit">Save record</button></div></form></div></section></div>`;
    modalRoot.querySelector('input, select, textarea')?.focus();
}

function purchaseLineMarkup() {
    return `<div class="purchase-line"><select name="productId" required>${optionList(state.records.products.filter((item) => item.status === 'active'), 'id', 'productName')}</select><input name="quantity" type="number" min="1" step="1" value="1" required><button class="small-button delete" type="button" data-action="remove-line">Remove</button></div>`;
}

function closeModal() {
    modalRoot.innerHTML = '';
}

async function savePurchase(formData) {
    const customerId = formData.get('customerId');
    const productIds = formData.getAll('productId');
    const quantities = formData.getAll('quantity');
    const date = formData.get('purchaseDate');
    const customer = state.records.customers.find((item) => item.id === customerId);
    const items = productIds.map((productId, index) => ({ productId, quantity: Number(quantities[index]) }));
    if (!customer || !items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error('Choose a customer and valid item quantities.');
    await apiFetch('/purchases', { method: 'POST', body: JSON.stringify({ customerId, purchaseDate: date, remarks: String(formData.get('remarks') || '').trim(), items }) });
}

async function savePayment(formData) {
    const purchaseId = formData.get('purchaseId');
    const amount = Number(formData.get('amount'));
    await apiFetch('/payments', { method: 'POST', body: JSON.stringify({ purchaseId, amount, paymentDate: formData.get('paymentDate'), paymentMethod: String(formData.get('paymentMethod') || ''), notes: String(formData.get('notes') || '').trim() }) });
}

async function createManagedUser(formData) {
    await apiFetch('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(formData.entries())) });
}

async function saveRecord(form) {
    const formData = new FormData(form);
    const name = form.dataset.recordForm;
    const id = form.dataset.id;
    if (name === 'purchases') return savePurchase(formData);
    if (name === 'payments') return savePayment(formData);
    if (name === 'users' && !id) return createManagedUser(formData);
    const data = Object.fromEntries(formData.entries());
    if (name === 'products') {
        data.price = Number(data.price || 0);
        data.stockQuantity = Number(data.stockQuantity || 0);
    }
    if (name === 'expenses') data.amount = Number(data.amount || 0);
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

function renderApp() {
    authScreen.hidden = true;
    appScreen.hidden = false;
    document.querySelector('#account-name').textContent = state.profile.fullName || state.user.email;
    document.querySelector('#account-role').textContent = state.profile.role || 'staff';
    document.querySelector('#account-avatar').textContent = (state.profile.fullName || state.user.email || 'F').trim().charAt(0).toUpperCase();
    document.querySelector('.admin-only').hidden = state.profile.role !== 'admin';
    setView(state.view);
}

renderAuth();
onAuthStateChanged(auth, async (user) => {
        if (!user) {
            state.user = null;
            state.profile = null;
            appScreen.hidden = true;
            authScreen.hidden = false;
            renderAuth();
            return;
        }
        state.user = user;
        try {
            const profileRef = doc(db, 'users', user.uid);
            let snapshot = await getDoc(profileRef);
            if (!snapshot.exists()) {
                await setDoc(profileRef, { fullName: user.displayName || user.email, email: user.email, role: 'staff', createdAt: new Date().toISOString() });
                snapshot = await getDoc(profileRef);
            }
            state.profile = snapshot.data();
            renderApp();
        } catch (error) {
            await signOut(auth);
            renderAuth('signin', error.message || 'Could not load your account profile.');
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
                const credential = await createUserWithEmailAndPassword(auth, values.get('email'), values.get('password'));
                await setDoc(doc(db, 'users', credential.user.uid), { fullName: String(values.get('fullName')).trim(), email: credential.user.email, role: 'staff', createdAt: new Date().toISOString() });
            } else {
                await signInWithEmailAndPassword(auth, values.get('email'), values.get('password'));
            }
        } else {
            await saveRecord(recordForm);
            const view = recordForm.dataset.recordForm;
            closeModal();
            notify('Record saved.');
            await renderCollectionView(view);
        }
    } catch (error) {
        if (authForm) renderAuth(authForm.dataset.authForm, error.message || 'Could not sign in.');
        else notify(error.message || 'Could not save this record.', true);
    } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
    }
});

document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) return setView(viewButton.dataset.view);
    if (event.target.closest('[data-auth-toggle]')) return renderAuth(authScreen.querySelector('[data-auth-form]')?.dataset.authForm === 'signin' ? 'signup' : 'signin');
    if (event.target.closest('#sign-out')) return signOut(auth);
    if (event.target.closest('[data-close-modal]')) return closeModal();
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action, collection: name, id } = actionButton.dataset;
    try {
        if (action === 'new') return openForm(name);
        if (action === 'add-line') { actionButton.closest('[data-line-items]').insertAdjacentHTML('beforeend', purchaseLineMarkup()); return; }
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
        if (action === 'filter-report') return renderReports(document.querySelector('#report-from').value, document.querySelector('#report-to').value);
    } catch (error) {
        notify(error.message || 'That action could not be completed.', true);
    }
});

document.addEventListener('input', (event) => {
    if (event.target.id === 'record-search') renderCollectionView(state.view, event.target.value).catch((error) => notify(error.message, true));
});