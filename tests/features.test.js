import assert from 'node:assert/strict';
import test from 'node:test';
import { customers } from '../public/assets/js/features/customers.js';
import { filterRecordsByCalendar } from '../public/assets/js/features/calendar-filter.js';
import { customerAllRecordEntries, customerExpenseEntries, customerExpenseSummary, filterRecordsByDateRange, monthlyBudgetSummary, monthlyPaidExpenseTotals } from '../public/assets/js/features/customer-expenses.js';
import { expenseCategories, expenses } from '../public/assets/js/features/expenses.js';
import { paymentMethodCardsMarkup, paymentMethods, payments, summarizePaymentMethods } from '../public/assets/js/features/payments.js';
import { products } from '../public/assets/js/features/products.js';
import { purchases } from '../public/assets/js/features/purchases.js';
import { customerOwnsContact, purchaseReceiptPdf, purchaseStockItems } from '../src/controllers/purchases.js';
import { customerOwnsExpenseRecord, customerOwnsPaymentRecord, customerOwnsPurchaseRecord } from '../src/controllers/customer-portal.js';
import { renderReports } from '../public/assets/js/features/reports.js';
import { customerOwnsPurchase, paymentTotalsAfterChange } from '../src/controllers/payments.js';
import { requireAdmin, requireCustomer, requireWorkspaceMember } from '../src/middleware/auth.js';
import { summarizeCustomerMonitoring } from '../src/services/customer-account.js';
import { normalizeDateRange, summarizePayments, transactionDateRange } from '../src/services/reporting.js';
import { customerMonthlyBudgetMonthSchema, customerMonthlyBudgetSchema, customerPlanSchema, customerProfileSchema, customerProvisionSchema, customerPurchaseUpdateSchema, customerSchema, expenseSchema, managedUserSchema, productSchema, purchaseSchema } from '../src/services/validation.js';

test('customer and staff workspace routes reject other account roles', () => {
    const invoke = (middleware, role) => {
        let error;
        middleware({ profile: { role } }, {}, (value) => { error = value; });
        return error?.status || 200;
    };

    assert.equal(invoke(requireCustomer, 'customer'), 200);
    assert.equal(invoke(requireCustomer, 'staff'), 403);
    assert.equal(invoke(requireWorkspaceMember, 'customer'), 403);
    assert.equal(invoke(requireWorkspaceMember, 'unknown'), 403);
    assert.equal(invoke(requireWorkspaceMember, 'admin'), 403);
    assert.equal(invoke(requireWorkspaceMember, 'staff'), 200);
});

test('only the configured main admin passes admin authorization', async () => {
    const previousUid = process.env.MAIN_ADMIN_UID;
    process.env.MAIN_ADMIN_UID = 'main-admin-uid';
    const invoke = async (uid) => {
        let error;
        await requireAdmin({ user: { uid }, profile: { role: 'admin' } }, {}, (value) => { error = value; });
        return error?.status || 200;
    };

    try {
        assert.equal(await invoke('main-admin-uid'), 200);
        assert.equal(await invoke('other-admin-uid'), 403);
    } finally {
        if (previousUid === undefined) delete process.env.MAIN_ADMIN_UID;
        else process.env.MAIN_ADMIN_UID = previousUid;
    }
});

test('payment reports group cash, wallet, and credit-card payments', () => {
    assert.deepEqual(summarizePayments([
        { paymentMethod: 'cash', amount: 10 },
        { paymentMethod: 'mobile wallet', amount: 5 },
        { paymentMethod: 'credit card', amount: 7 },
        { paymentMethod: 'bank transfer', amount: 3 }
    ]), { cash: 10, digitalWallet: 5, creditCard: 7, other: 3 });
});

test('customers, products, and expenses prepare valid API payloads', () => {
    const customerForm = new FormData();
    customerForm.set('customerName', 'A Customer');
    assert.equal(customers.toPayload(customerForm).customerName, 'A Customer');

    const productForm = new FormData();
    productForm.set('price', '9.5');
    productForm.set('stockQuantity', '4');
    assert.deepEqual([products.toPayload(productForm).price, products.toPayload(productForm).stockQuantity], [9.5, 4]);

    const expenseForm = new FormData();
    expenseForm.set('amount', '25');
    assert.equal(expenses.toPayload(expenseForm).amount, 25);
    assert.ok(expenses.fields.some(([name]) => name === 'paymentMethod'));
});

test('purchases submit a selected customer and item quantities', async () => {
    const formData = new FormData();
    formData.set('customerId', 'customer-1');
    formData.set('purchaseDate', '2026-09-28');
    formData.set('productId', 'product-1');
    formData.set('quantity', '2');
    let request;

    await purchases.save({
        state: { records: { customers: [{ id: 'customer-1' }] } },
        apiFetch: async (...args) => { request = args; }
    }, formData);

    assert.equal(request[0], '/purchases');
    assert.equal(JSON.parse(request[1].body).items[0].quantity, 2);
});

test('purchase validation accepts multiple product and service items', () => {
    assert.equal(purchaseSchema.safeParse({
        customerId: 'customer-1',
        purchaseDate: '2026-09-29',
        items: [
            { productId: 'product-1', quantity: 2 },
            { productId: 'service-1', quantity: 1 }
        ]
    }).success, true);
});

test('customer purchase updates accept editable customer, date, remarks, and item details', () => {
    assert.equal(customerPurchaseUpdateSchema.safeParse({
        customerId: 'contact-1',
        purchaseDate: '2026-09-29',
        remarks: 'Updated purchase',
        items: [
            { productId: 'customer-product:product-1', quantity: 2 },
            { productId: 'plan:plan-1', quantity: 1, actualSubtotals: [125, 75] }
        ]
    }).success, true);
    assert.equal(customerPurchaseUpdateSchema.safeParse({ purchaseDate: '2026-09-29' }).success, true);
    assert.equal(customerPurchaseUpdateSchema.safeParse({ customerId: 'contact-1', purchaseDate: '2026-09-29', items: [] }).success, false);
});

test('customer plans require quantities for products and groceries but not services', () => {
    const basePlan = { planName: 'Home plan', planDate: '2026-09-29', budget: 2000, items: [{ itemName: 'Water bill', estimatedPrice: 1200 }] };
    const servicePlan = customerPlanSchema.safeParse({ ...basePlan, planType: 'services' });
    assert.equal(servicePlan.success, true);
    assert.equal(servicePlan.data.items[0].quantity, 1);
    assert.equal(customerPlanSchema.safeParse({ ...basePlan, planType: 'services', items: [{ ...basePlan.items[0], quantity: 2 }] }).success, false);
    for (const planType of ['products', 'groceries']) {
        assert.equal(customerPlanSchema.safeParse({ ...basePlan, planType }).success, false);
        assert.equal(customerPlanSchema.safeParse({ ...basePlan, planType, items: [{ ...basePlan.items[0], quantity: 2 }] }).success, true);
    }
    assert.equal(customerPlanSchema.safeParse({ ...basePlan, items: [{ ...basePlan.items[0], quantity: 1 }] }).data.planType, 'products');
});

test('payments show due purchases and submit payment details', async () => {
    const formMarkup = await payments.fields({
        state: { records: { purchases: [{ id: 'purchase-1', customerName: 'A Customer', purchaseDate: '2026-09-28', balanceAmount: 18 }] } },
        fieldMarkup: ([name, , type, , options = []]) => type === 'select' ? `<select name="${name}">${options.join(',')}</select>` : `<input name="${name}">`,
        optionList: (rows, idField, labelField) => rows.map((row) => `${row[idField]}:${row[labelField]}`).join(',')
    });
    assert.match(formMarkup, /due 18\.00/);
    assert.match(formMarkup, /Bank Transfer/);
    assert.match(formMarkup, /GCash/);

    const formData = new FormData();
    formData.set('purchaseId', 'purchase-1');
    formData.set('amount', '5');
    formData.set('paymentDate', '2026-09-28');
    let request;
    await payments.save({ apiFetch: async (...args) => { request = args; } }, formData);
    assert.equal(request[0], '/payments');
    assert.equal(JSON.parse(request[1].body).amount, 5);
});

test('reports send date filters to the API and render returned totals', async () => {
    let requestPath;
    const viewContainer = { innerHTML: '' };
    await renderReports({
        apiFetch: async (path) => {
            requestPath = path;
            return { purchases: [], sales: 100, expenseTotal: 20, paid: 80, outstanding: 20, net: 80, paymentMethods: { cash: 30, digitalWallet: 20, creditCard: 30 } };
        },
        escapeHtml: (value) => value,
        money: (value) => String(value),
        viewContainer
    }, '2026-09-01', '2026-09-30');

    assert.equal(requestPath, '/reports?from=2026-09-01&to=2026-09-30');
    assert.match(viewContainer.innerHTML, /100/);
    assert.match(viewContainer.innerHTML, /Payments by method/);
    assert.match(viewContainer.innerHTML, /Credit card/);
});

test('admin account creation accepts workspace roles but not customer role assignment', () => {
    const account = { fullName: 'Workspace User', email: 'user@example.com', password: 'temporary-pass' };
    assert.equal(managedUserSchema.safeParse({ ...account, role: 'admin' }).success, true);
    assert.equal(managedUserSchema.safeParse({ ...account, role: 'staff' }).success, true);
    assert.equal(managedUserSchema.safeParse({ ...account, role: 'customer' }).success, false);
});

test('customer profile updates validate details and one of the preset avatars', () => {
    assert.equal(customerProfileSchema.safeParse({ fullName: 'A Customer', contactNumber: '09123456789', address: 'Main Street', avatarId: 'mint' }).success, true);
    assert.equal(customerProfileSchema.safeParse({ fullName: 'A Customer', avatarId: 'berry' }).success, true);
    assert.equal(customerProfileSchema.safeParse({ fullName: 'A Customer', contactNumber: '0912-345-6789' }).success, false);
    assert.equal(customerProfileSchema.safeParse({ fullName: 'A Customer', avatarId: 'unknown' }).success, false);
    assert.equal(customerProfileSchema.safeParse({ fullName: '' }).success, false);
    assert.equal(customerProfileSchema.safeParse({ fullName: 'A Customer', email: 'new@example.com' }).success, false);
});

test('customer signup phone numbers accept digits only', () => {
    assert.equal(customerProvisionSchema.safeParse({ mobileNumber: '09123456789' }).success, true);
    assert.equal(customerProvisionSchema.safeParse({ mobileNumber: '' }).success, true);
    assert.equal(customerProvisionSchema.safeParse({ mobileNumber: '+639123456789' }).success, false);
});

test('customer expense input validates name, category, amount, date, and notes', () => {
    assert.equal(expenseSchema.safeParse({ title: 'Transport', category: 'Travel', amount: '25', expenseDate: '2026-09-29', description: 'Bus fare' }).success, true);
    assert.equal(expenseSchema.safeParse({ title: '', category: 'Travel', amount: '0', expenseDate: 'bad' }).success, false);
});

test('customer payment can only update a purchase linked to their account', () => {
    const req = { profile: { role: 'customer', customerId: 'customer-1' }, user: { uid: 'user-1' } };
    assert.equal(customerOwnsPurchase(req, { customerId: 'customer-1' }, { accountId: 'user-1' }), true);
    assert.equal(customerOwnsPurchase(req, { customerId: 'customer-2' }, { accountId: 'user-1' }), false);
    assert.equal(customerOwnsPurchase(req, { customerId: 'customer-1' }, { accountId: 'user-2' }), false);
});

test('purchase deletion restores only inventory-backed products from the correct catalog', () => {
    assert.deepEqual(purchaseStockItems([
        { productId: 'workspace-1', itemType: 'product', quantity: 2 },
        { productId: 'workspace-1', itemType: 'product', quantity: 3 },
        { productId: 'legacy-workspace-1', quantity: 1 },
        { productId: 'customer-1', itemType: 'customer-product', quantity: 4 },
        { productId: 'plan-1', itemType: 'plan', quantity: 1 },
        { productId: 'service-1', itemType: 'service', quantity: 1 }
    ]), [
        { collection: 'products', productId: 'workspace-1', quantity: 5 },
        { collection: 'products', productId: 'legacy-workspace-1', quantity: 1 },
        { collection: 'customerProducts', productId: 'customer-1', quantity: 4 }
    ]);
});

test('customer product form fields validate a private product or service entry', () => {
    assert.equal(productSchema.safeParse({ productName: 'Custom Service', category: 'Consulting', description: 'One-on-one session', type: 'service', price: '500', stockQuantity: '0', status: 'active' }).success, true);
    assert.equal(productSchema.safeParse({ productName: '', category: '', description: '', type: 'other', price: '-1', stockQuantity: '-1', status: 'active' }).success, false);
});

test('customer-managed contacts validate independently from workspace customers', () => {
    assert.equal(customerSchema.safeParse({ customerName: 'Local Client', contactNumber: '09123456789', email: '', address: 'Main Street' }).success, true);
    assert.equal(customerSchema.safeParse({ customerName: 'Local Client', contactNumber: '0912abc' }).success, false);
    assert.equal(customerSchema.safeParse({ customerName: '' }).success, false);
});

test('registered customer counts distinguish valid links from stale customer references', () => {
    assert.deepEqual(summarizeCustomerMonitoring([
        { id: 'user-1', role: 'customer', customerId: 'customer-1' },
        { id: 'user-2', role: 'customer', customerId: 'deleted-customer' },
        { id: 'user-3', role: 'customer', customerId: 'customer-3' },
        { id: 'user-4', role: 'staff' }
    ], [
        { id: 'customer-1', accountId: 'user-1' },
        { id: 'customer-3', accountId: 'different-user' },
        { id: 'customer-4' }
    ]), {
        registeredCustomers: 3,
        customers: 3,
        linkedRegisteredCustomers: 1,
        unlinkedRegisteredCustomers: 2,
        linkedCustomerRecords: 1,
        unlinkedCustomerRecords: 2
    });
});

test('transaction calendar ranges support selected days, Monday weeks, months, and years', () => {
    assert.deepEqual(transactionDateRange('day', '2026-09-17'), { from: '2026-09-17', to: '2026-09-17' });
    assert.deepEqual(transactionDateRange('week', '2026-09-17'), { from: '2026-09-14', to: '2026-09-20' });
    assert.deepEqual(transactionDateRange('month', '2026-09-17'), { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(transactionDateRange('year', '2026-09-17'), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(transactionDateRange('year', '2024-02-29'), { from: '2024-01-01', to: '2024-12-31' });
    assert.throws(() => transactionDateRange('day', '2026-02-29'), { status: 400 });
});

test('date range filters accept optional endpoints and reject invalid ranges', () => {
    assert.deepEqual(normalizeDateRange('2026-09-01', '2026-09-30'), { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(normalizeDateRange('', '2026-09-30'), { from: '', to: '2026-09-30' });
    assert.throws(() => normalizeDateRange('2026-10-01', '2026-09-30'), { status: 400 });
    assert.throws(() => normalizeDateRange('2026-02-29', ''), { status: 400 });
});

test('customer record calendar filter matches selected day, week, or month', () => {
    const records = [
        { purchaseDate: '2026-10-01' },
        { purchaseDate: '2026-09-30' },
        { purchaseDate: '2026-10-04' },
        { purchaseDate: '2025-12-31' }
    ];
    assert.deepEqual(filterRecordsByCalendar(records, 'purchaseDate', 'day', '2026-10-01'), [records[0]]);
    assert.deepEqual(filterRecordsByCalendar(records, 'purchaseDate', 'week', '2026-10-01'), [records[0], records[1], records[2]]);
    assert.deepEqual(filterRecordsByCalendar(records, 'purchaseDate', 'month', '2026-10-01'), [records[0], records[2]]);
    assert.deepEqual(filterRecordsByCalendar(records, 'purchaseDate', 'year', '2026-10-01'), [records[0], records[1], records[2]]);
});

test('customer expenses include purchases and payments while totals exclude unpaid balances', () => {
    const purchases = [
        { id: 'purchase-1', purchaseDate: '2026-10-01', totalAmount: 40, amountPaid: 25, balanceAmount: 999, paymentStatus: 'partial' },
        { id: 'purchase-2', purchaseDate: '2026-10-02', totalAmount: 40, amountPaid: 0, balanceAmount: 40, paymentStatus: 'unpaid' },
        { id: 'purchase-3', purchaseDate: '2026-10-01', items: [{ productName: 'Plan' }], totalAmount: 70, amountPaid: 70, balanceAmount: 0, paymentStatus: 'paid' }
    ];
    const payments = [
        { id: 'payment-1', purchaseId: 'purchase-1', paymentDate: '2026-10-03', amount: 25, paymentMethod: 'cash' },
        { id: 'payment-2', purchaseId: 'purchase-3', paymentDate: '2026-10-05', amount: 20 },
        { id: 'payment-3', purchaseId: 'purchase-3', paymentDate: '2026-10-06', amount: 50 }
    ];
    const expenses = [{ id: 'expense-1', expenseDate: '2026-10-04', amount: 10 }];

    const entries = customerExpenseEntries(purchases, payments, expenses);
    assert.deepEqual(customerExpenseSummary(purchases, payments, expenses), { paid: 105, unpaid: 55, totalExpenses: 105 });
    assert.deepEqual(entries.map(({ sourceType }) => sourceType), ['payment', 'expense', 'purchase', 'purchase']);
    assert.deepEqual(entries.filter(({ sourceId }) => sourceId === 'purchase-1').map(({ sourceType, paid, unpaid }) => ({ sourceType, paid, unpaid })), [
        { sourceType: 'purchase', paid: 25, unpaid: 15 }
    ]);
    assert.equal(entries.find(({ sourceId }) => sourceId === 'purchase-1').detail, 'cash');
    assert.deepEqual(entries.filter(({ sourceId }) => sourceId === 'purchase-3').map(({ sourceType, date, paid, unpaid }) => ({ sourceType, date, paid, unpaid })), [
        { sourceType: 'payment', date: '2026-10-06', paid: 70, unpaid: 0 }
    ]);
    assert.equal(entries.find(({ sourceId }) => sourceId === 'purchase-3').receiptId, 'purchase-3');
    assert.deepEqual(filterRecordsByDateRange(entries, 'date', '2026-10-02', '2026-10-03').map(({ id }) => id), ['purchase:purchase-1', 'purchase:purchase-2']);
});

test('monthly paid expenses follow payment and manual expense dates', () => {
    assert.deepEqual(monthlyPaidExpenseTotals(
        [{ paymentDate: '2026-09-30', amount: 12 }, { paymentDate: '2026-10-01', amount: 8 }],
        [{ expenseDate: '2026-10-02', amount: 5 }],
        [{ key: '2026-09' }, { key: '2026-10' }]
    ), [12, 13]);
});

test('all records show each purchase once and change fully paid purchases to payments', () => {
    const records = customerAllRecordEntries([
        { id: 'paid', purchaseDate: '2026-10-01', totalAmount: 100, amountPaid: 100, items: [{ productName: 'Groceries', quantity: 1 }] },
        { id: 'unpaid', purchaseDate: '2026-10-02', totalAmount: 40, amountPaid: 0, items: [{ productName: 'Supplies', quantity: 1 }] },
        { id: 'partial', purchaseDate: '2026-10-02', totalAmount: 60, amountPaid: 20, items: [{ productName: 'Utilities', quantity: 1 }] }
    ], [
        { id: 'payment-1', purchaseId: 'paid', paymentDate: '2026-10-03', amount: 40 },
        { id: 'payment-2', purchaseId: 'paid', paymentDate: '2026-10-04', amount: 60 },
        { id: 'payment-3', purchaseId: 'partial', paymentDate: '2026-10-03', amount: 10 },
        { id: 'payment-4', purchaseId: 'partial', paymentDate: '2026-10-04', amount: 10 },
        { id: 'payment-5', paymentDate: '2026-10-05', amount: 7 }
    ], [
        { id: 'expense-1', expenseDate: '2026-10-04', title: 'Electricity', amount: 15 }
    ]);

    assert.equal(records.length, 5);
    assert.deepEqual(records.find(({ sourceId }) => sourceId === 'paid'), {
        id: 'purchase:paid',
        sourceId: 'paid',
        purchaseId: 'paid',
        sourceType: 'payment',
        date: '2026-10-04',
        title: 'Groceries × 1',
        amount: 100,
        paid: 100,
        unpaid: 0,
        detail: 'Fully paid transaction',
        status: 'paid'
    });
    assert.deepEqual(records.find(({ sourceId }) => sourceId === 'partial'), {
        id: 'purchase:partial',
        sourceId: 'partial',
        purchaseId: 'partial',
        sourceType: 'purchase',
        date: '2026-10-04',
        title: 'Utilities × 1',
        amount: 60,
        paid: 20,
        unpaid: 40,
        detail: undefined,
        status: 'partial'
    });
    assert.equal(records.find(({ sourceId }) => sourceId === 'unpaid').sourceType, 'purchase');
    assert.equal(records.find(({ sourceId }) => sourceId === 'payment-5').sourceType, 'payment');
    assert.equal(records.filter(({ sourceId }) => sourceId === 'paid').length, 1);
});

test('monthly allocated budgets require a valid month and nonnegative amount', () => {
    assert.equal(customerMonthlyBudgetSchema.safeParse({ month: '2026-11', amount: '20000' }).success, true);
    assert.equal(customerMonthlyBudgetSchema.safeParse({ month: '2026-13', amount: 20000 }).success, false);
    assert.equal(customerMonthlyBudgetSchema.safeParse({ month: '2026-11', amount: -1 }).success, false);
    assert.equal(customerMonthlyBudgetMonthSchema.safeParse({ month: '2026-02' }).success, true);
});

test('monthly budget summary keeps negative over-budget balances and does not invent an unset budget', () => {
    assert.deepEqual(monthlyBudgetSummary(20000, 12500, true), {
        allocated: 20000, paid: 12500, remaining: 7500, usagePercent: 62.5, overBudget: false
    });
    assert.deepEqual(monthlyBudgetSummary(20000, 22000, true), {
        allocated: 20000, paid: 22000, remaining: -2000, usagePercent: 110, overBudget: true
    });
    assert.deepEqual(monthlyBudgetSummary(0, 300, false), {
        allocated: 0, paid: 300, remaining: null, usagePercent: null, overBudget: false
    });
});

test('customer purchase transactions can only use contacts owned by the account', () => {
    assert.equal(customerOwnsContact('user-1', { userId: 'user-1' }), true);
    assert.equal(customerOwnsContact('user-1', { userId: 'user-2' }), false);
    assert.equal(customerOwnsContact('user-1', null), false);
});

test('customer payments allow purchases linked to one of their saved contacts', () => {
    const request = { profile: { role: 'customer', customerId: 'customer-1' }, user: { uid: 'user-1' } };
    assert.equal(customerOwnsPurchase(request, { customerId: 'contact-1', userId: 'user-1' }, { userId: 'user-1' }), true);
    assert.equal(customerOwnsPurchase(request, { customerId: 'contact-1', userId: 'user-2' }, { userId: 'user-1' }), false);
});

test('purchase transactions include the requested columns', () => {
    assert.deepEqual(purchases.columns.map(([, label]) => label), [
        'ID', 'User', 'Total Amount', 'Amount Paid', 'Balance', 'Status', 'Purchase Date'
    ]);
});

test('customer receipt access is limited to linked or owned-contact purchases', () => {
    assert.equal(customerOwnsPurchaseRecord('user-1', 'customer-1', { customerId: 'customer-1' }, null), true);
    assert.equal(customerOwnsPurchaseRecord('user-1', 'customer-1', { customerId: 'contact-1', userId: 'user-1' }, { userId: 'user-1' }), true);
    assert.equal(customerOwnsPurchaseRecord('user-1', 'customer-1', { customerId: 'contact-1', userId: 'user-2' }, { userId: 'user-1' }), false);
});

test('purchase receipt endpoint generator returns a PDF document', async () => {
    const purchase = {
        id: 'purchase-1', customerName: 'A Customer', processedBy: 'Workspace User', purchaseDate: '2026-10-01',
        totalAmount: 25, amountPaid: 10, balanceAmount: 15,
        items: [{ productName: 'Computer Repair', quantity: 1, price: 25, subtotal: 25 }]
    };
    const pdf = await purchaseReceiptPdf(purchase);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const pdfSource = pdf.toString('latin1');
    assert.match(pdfSource, /\/Count 1/);

    const longPdf = await purchaseReceiptPdf({ ...purchase, items: Array.from({ length: 10 }, (_, index) => ({ ...purchase.items[0], productName: `Item ${index + 1}` })) });
    const longPdfSource = longPdf.toString('latin1');
    assert.match(longPdfSource, /\/Count 1/);
    const shortHeight = Number(pdfSource.split('/MediaBox [0 0 ')[1].split(']')[0].split(' ')[1]);
    const longHeight = Number(longPdfSource.split('/MediaBox [0 0 ')[1].split(']')[0].split(' ')[1]);
    assert.ok(longHeight > shortHeight);
});

test('payments table shows the user and omits the processor column', () => {
    assert.deepEqual(payments.columns.map(([, label]) => label), [
        'Payment ID', 'Transaction ID', 'User', 'Amount Paid', 'Payment Method', 'Payment Date', 'Remarks'
    ]);
});

test('payment method selector offers image tiles for all four requested methods', () => {
    assert.deepEqual(paymentMethods.map(({ label }) => label), ['Cash', 'Bank Transfer', 'GCash', 'Others']);
    const markup = paymentMethodCardsMarkup();
    assert.equal((markup.match(/type="radio"/g) || []).length, 4);
    assert.match(markup, /value="cash" checked/);
    assert.doesNotMatch(markup, /<img/);
});

test('payment summary groups cash, GCash, bank transfer, and other methods', () => {
    assert.deepEqual(summarizePaymentMethods([
        { paymentMethod: 'cash', amount: 20 },
        { paymentMethod: 'gcash', amount: 30 },
        { paymentMethod: 'bank transfer', amount: 40 },
        { paymentMethod: 'credit card', amount: 10 },
        { paymentMethod: 'digital wallet', amount: 5 }
    ]).map(({ key, total, count }) => ({ key, total, count })), [
        { key: 'cash', total: 20, count: 1 },
        { key: 'gcash', total: 30, count: 1 },
        { key: 'bankTransfer', total: 40, count: 1 },
        { key: 'others', total: 15, count: 2 }
    ]);
});

test('customer expense categories include the requested dropdown options', () => {
    assert.deepEqual(expenseCategories, [
        'Supplies', 'Utilities', 'Rent', 'Transportation', 'Food & Meals', 'Salaries & Wages',
        'Equipment', 'Maintenance & Repairs', 'Marketing & Advertising', 'Communication', 'Taxes & Fees', 'Other'
    ]);
});

test('editing or deleting a payment recalculates its purchase balance safely', () => {
    const purchase = { amountPaid: 60, balanceAmount: 40 };
    assert.deepEqual(paymentTotalsAfterChange(purchase, 20, 30), { amountPaid: 70, balanceAmount: 30, paymentStatus: 'partial' });
    assert.deepEqual(paymentTotalsAfterChange(purchase, 20, 0), { amountPaid: 40, balanceAmount: 60, paymentStatus: 'partial' });
    assert.throws(() => paymentTotalsAfterChange(purchase, 20, 70), { status: 409 });
});

test('customer payment and expense mutations are limited to records created by that account', () => {
    assert.equal(customerOwnsPaymentRecord('user-1', { userId: 'user-1' }), true);
    assert.equal(customerOwnsPaymentRecord('user-1', { userId: 'user-2' }), false);
    assert.equal(customerOwnsExpenseRecord('user-1', { userId: 'user-1' }), true);
    assert.equal(customerOwnsExpenseRecord('user-1', { userId: 'user-2' }), false);
});