import { firestore, timestamp } from '../services/firestore.js';
import { purchaseReceiptPdf, purchaseWithProcessorName, removePurchaseRecord } from './purchases.js';
import { customerOwnsPurchase, paymentTotalsAfterChange, paymentWithProcessorName } from './payments.js';
import { ensureCustomerAccountProfile } from '../services/customer-account.js';
import { transactionDateRange } from '../services/reporting.js';
import { customerPlanSchema, customerPlanStateSchema, customerProductStatusSchema, customerProfileSchema, customerProvisionSchema, customerPurchaseUpdateSchema, customerSchema, expenseSchema, idSchema, parse, paymentSchema, productSchema, purchaseSchema } from '../services/validation.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const rows = (snapshot) => snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));

async function customerOwnedRows(collectionName, customerId, userId) {
    const [customerRecords, userRecords] = await Promise.all([
        firestore.collection(collectionName).where('customerId', '==', customerId).get(),
        firestore.collection(collectionName).where('userId', '==', userId).get()
    ]);
    return [...new Map([...customerRecords.docs, ...userRecords.docs].map((document) => [document.id, { id: document.id, ...document.data() }])).values()];
}

export function customerOwnsPurchaseRecord(userId, customerId, purchase, contact) {
    return Boolean(purchase && (purchase.customerId === customerId || purchase.userId === userId && contact?.userId === userId));
}

export function customerOwnsPaymentRecord(userId, payment) {
    return Boolean(userId && payment?.userId === userId);
}

export function customerOwnsExpenseRecord(userId, expense) {
    return Boolean(userId && expense?.userId === userId);
}

export async function provisionCustomerAccount(req, res, next) {
    try {
        const details = parse(customerProvisionSchema, req.body || {});
        const profile = await ensureCustomerAccountProfile(req.user, details);
        res.status(201).json(profile);
    } catch (error) { next(error); }
}

async function ownedCustomerId(req) {
    const customerId = req.profile.customerId;
    if (!customerId) fail('Customer profile is not ready.', 409);
    const customer = await firestore.collection('customers').doc(customerId).get();
    if (!customer.exists || customer.data().accountId !== req.user.uid) fail('Customer profile is not valid.', 403);
    return customerId;
}

async function requireCustomerOwnedPurchase(req, id) {
    const customerId = await ownedCustomerId(req);
    const reference = firestore.collection('purchases').doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Purchase transaction not found.', 404);
    const purchase = snapshot.data();
    let contact = null;
    if (purchase.customerId !== customerId) {
        const contactSnapshot = await firestore.collection('customerContacts').doc(purchase.customerId).get();
        if (contactSnapshot.exists) contact = contactSnapshot.data();
    }
    if (!customerOwnsPurchaseRecord(req.user.uid, customerId, purchase, contact)) fail('Purchase transaction not found.', 404);
    return { reference, purchase };
}

export async function ensureCustomerProfile(req, res, next) {
    try {
        const profileReference = firestore.collection('users').doc(req.user.uid);
        const profile = (await profileReference.get()).data();
        if (profile?.role !== 'customer') fail('Customer access required.', 403);

        let customer;
        if (profile.customerId) {
            const snapshot = await firestore.collection('customers').doc(profile.customerId).get();
            if (snapshot.exists && snapshot.data().accountId === req.user.uid) customer = { id: snapshot.id, ...snapshot.data() };
        }

        if (!customer) {
            const email = String(profile.email || req.user.email || '').trim().toLowerCase();
            const matching = email ? await firestore.collection('customers').where('email', '==', email).limit(10).get() : null;
            const available = matching?.docs.find((document) => !document.data().accountId || document.data().accountId === req.user.uid);
            if (available) {
                customer = { id: available.id, ...available.data(), accountId: req.user.uid };
                await available.ref.update({ accountId: req.user.uid, updatedAt: timestamp() });
            } else {
                const reference = await firestore.collection('customers').add({
                    customerName: String(profile.fullName || req.user.email || 'Customer'),
                    email,
                    contactNumber: '',
                    address: '',
                    accountId: req.user.uid,
                    createdAt: timestamp(),
                    updatedAt: timestamp()
                });
                customer = { id: reference.id, customerName: String(profile.fullName || req.user.email || 'Customer'), email, accountId: req.user.uid };
            }
            await profileReference.update({ customerId: customer.id });
        }

        res.json({ id: req.user.uid, fullName: profile.fullName, username: profile.username || '', email: profile.email, role: profile.role, customerId: customer.id, customerName: customer.customerName, contactNumber: customer.contactNumber || '', address: customer.address || '', avatarId: profile.avatarId || 'mint' });
    } catch (error) { next(error); }
}

export async function updateCustomerProfile(req, res, next) {
    try {
        const data = parse(customerProfileSchema, req.body);
        const customerId = await ownedCustomerId(req);
        const customerReference = firestore.collection('customers').doc(customerId);
        const profileReference = firestore.collection('users').doc(req.user.uid);
        await firestore.runTransaction(async (transaction) => {
            const customerSnapshot = await transaction.get(customerReference);
            if (!customerSnapshot.exists || customerSnapshot.data().accountId !== req.user.uid) fail('Customer profile is not valid.', 403);
            transaction.update(profileReference, { fullName: data.fullName, avatarId: data.avatarId, updatedAt: timestamp() });
            transaction.update(customerReference, { customerName: data.fullName, contactNumber: data.contactNumber, address: data.address, updatedAt: timestamp() });
        });
        res.json({ ...req.profile, ...data, customerName: data.fullName, customerId });
    } catch (error) { next(error); }
}

export async function listCustomerCatalog(req, res, next) {
    try {
        const snapshot = await firestore.collection('products').where('status', '==', 'active').get();
        res.json(rows(snapshot));
    } catch (error) { next(error); }
}

export async function listCustomerProducts(req, res, next) {
    try {
        const snapshot = await firestore.collection('customerProducts').where('userId', '==', req.user.uid).get();
        res.json(rows(snapshot));
    } catch (error) { next(error); }
}

export async function createCustomerProduct(req, res, next) {
    try {
        const data = parse(productSchema, req.body);
        const customerId = await ownedCustomerId(req);
        const value = { ...data, customerId, userId: req.user.uid, createdAt: timestamp(), updatedAt: timestamp() };
        const reference = await firestore.collection('customerProducts').add(value);
        res.status(201).json({ id: reference.id, ...value });
    } catch (error) { next(error); }
}

export async function updateCustomerProduct(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(productSchema, req.body);
        const reference = firestore.collection('customerProducts').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Product not found.', 404);
        const value = { ...data, updatedAt: timestamp() };
        await reference.update(value);
        res.json({ id, ...snapshot.data(), ...value });
    } catch (error) { next(error); }
}

export async function updateCustomerProductStatus(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const { status } = parse(customerProductStatusSchema, req.body);
        const reference = firestore.collection('customerProducts').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Product not found.', 404);
        await reference.update({ status, updatedAt: timestamp() });
        res.json({ id, ...snapshot.data(), status, updatedAt: timestamp() });
    } catch (error) { next(error); }
}

export async function deleteCustomerProduct(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const reference = firestore.collection('customerProducts').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Product not found.', 404);
        const purchases = await firestore.collection('purchases').where('userId', '==', req.user.uid).get();
        if (purchases.docs.some((purchase) => (purchase.data().items || []).some((item) => item.productId === id && item.itemType === 'customer-product'))) fail('This product is used in purchase transactions. Set it to inactive instead.', 409);
        await reference.delete();
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function listCustomerPlans(req, res, next) {
    try {
        const snapshot = await firestore.collection('customerPlans').where('userId', '==', req.user.uid).get();
        res.json(rows(snapshot));
    } catch (error) { next(error); }
}

export async function createCustomerPlan(req, res, next) {
    try {
        const data = parse(customerPlanSchema, req.body);
        const customerId = await ownedCustomerId(req);
        const items = data.items.map((item) => ({ ...item, subtotal: item.quantity * item.estimatedPrice }));
        const estimatedTotal = items.reduce((total, item) => total + item.subtotal, 0);
        const remaining = data.budget - estimatedTotal;
        const budgetStatus = remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET';
        const value = { ...data, items, estimatedTotal, remaining, budgetStatus, customerId, userId: req.user.uid, createdAt: timestamp(), updatedAt: timestamp() };
        const reference = await firestore.collection('customerPlans').add(value);
        res.status(201).json({ id: reference.id, ...value });
    } catch (error) { next(error); }
}

export async function updateCustomerPlanState(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const { state } = parse(customerPlanStateSchema, req.body);
        const reference = firestore.collection('customerPlans').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Plan not found.', 404);
        await reference.update({ state, updatedAt: timestamp() });
        res.json({ id, ...snapshot.data(), state, updatedAt: timestamp() });
    } catch (error) { next(error); }
}

export async function updateCustomerPlan(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(customerPlanSchema, req.body);
        const reference = firestore.collection('customerPlans').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Plan not found.', 404);
        const items = data.items.map((item) => ({ ...item, subtotal: item.quantity * item.estimatedPrice }));
        const estimatedTotal = items.reduce((total, item) => total + item.subtotal, 0);
        const remaining = data.budget - estimatedTotal;
        const budgetStatus = remaining > 0.009 ? 'UNDER BUDGET' : remaining < -0.009 ? 'OVER BUDGET' : 'ON BUDGET';
        const value = { ...data, items, estimatedTotal, remaining, budgetStatus, updatedAt: timestamp() };
        await reference.update(value);
        res.json({ id, ...snapshot.data(), ...value });
    } catch (error) { next(error); }
}

export async function deleteCustomerPlan(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const reference = firestore.collection('customerPlans').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Plan not found.', 404);
        await reference.delete();
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function listCustomerContacts(req, res, next) {
    try {
        const snapshot = await firestore.collection('customerContacts').where('userId', '==', req.user.uid).get();
        res.json(rows(snapshot));
    } catch (error) { next(error); }
}

export async function createCustomerContact(req, res, next) {
    try {
        const data = parse(customerSchema, req.body);
        const value = { ...data, userId: req.user.uid, createdAt: timestamp(), updatedAt: timestamp() };
        const reference = await firestore.collection('customerContacts').add(value);
        res.status(201).json({ id: reference.id, ...value });
    } catch (error) { next(error); }
}

export async function updateCustomerContact(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(customerSchema, req.body);
        const reference = firestore.collection('customerContacts').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Customer contact not found.', 404);
        await reference.update({ ...data, updatedAt: timestamp() });
        res.json({ id, ...data, userId: req.user.uid });
    } catch (error) { next(error); }
}

export async function deleteCustomerContact(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const reference = firestore.collection('customerContacts').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('Customer contact not found.', 404);
        const purchases = await firestore.collection('purchases').where('customerId', '==', id).get();
        if (purchases.docs.some((purchase) => purchase.data().userId === req.user.uid)) fail('This customer is used by purchase transactions and cannot be deleted.', 409);
        await reference.delete();
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function listCustomerPurchases(req, res, next) {
    try {
        const customerId = await ownedCustomerId(req);
        res.json(await customerOwnedRows('purchases', customerId, req.user.uid));
    } catch (error) { next(error); }
}

export async function updateCustomerPurchase(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(customerPurchaseUpdateSchema, req.body);
        const { reference, purchase } = await requireCustomerOwnedPurchase(req, id);
        if (data.items) {
            if (!data.customerId || !data.purchaseDate) fail('Customer and purchase date are required to update purchase items.');
            await ownedCustomerId(req);
            const selectedCustomerReference = data.customerId === req.profile.customerId
                ? firestore.collection('customers').doc(data.customerId)
                : firestore.collection('customerContacts').doc(data.customerId);
            if (data.items.some((item) => ['customer-product:', 'plan:'].includes(item.productId))) fail('A selected product or plan is invalid.');
            const productIds = new Set([
                ...(purchase.items || []).filter((item) => item.itemType === 'customer-product' && item.productId).map((item) => item.productId),
                ...data.items.filter((item) => item.productId.startsWith('customer-product:')).map((item) => item.productId.slice('customer-product:'.length))
            ]);
            const planIds = new Set(data.items.filter((item) => item.productId.startsWith('plan:')).map((item) => item.productId.slice('plan:'.length)));
            const productReferences = new Map([...productIds].map((productId) => [productId, firestore.collection('customerProducts').doc(productId)]));
            const planReferences = new Map([...planIds].map((planId) => [planId, firestore.collection('customerPlans').doc(planId)]));
            const paymentQuery = firestore.collection('payments').where('purchaseId', '==', id);

            const updatedPurchase = await firestore.runTransaction(async (transaction) => {
                const purchaseSnapshot = await transaction.get(reference);
                const customerSnapshot = await transaction.get(selectedCustomerReference);
                const productSnapshots = new Map();
                const planSnapshots = new Map();
                for (const [productId, productReference] of productReferences) productSnapshots.set(productId, await transaction.get(productReference));
                for (const [planId, planReference] of planReferences) planSnapshots.set(planId, await transaction.get(planReference));
                const paymentSnapshot = await transaction.get(paymentQuery);
                if (!purchaseSnapshot.exists || purchaseSnapshot.data().userId !== req.user.uid) fail('Purchase transaction not found.', 404);
                if (!customerSnapshot.exists) fail('Customer record not found.', 404);
                const selectedCustomer = customerSnapshot.data();
                const customerOwned = data.customerId === req.profile.customerId
                    ? selectedCustomer.accountId === req.user.uid
                    : selectedCustomer.userId === req.user.uid;
                if (!customerOwned) fail('Customer contact not found.', 404);

                const currentPurchase = purchaseSnapshot.data();
                const previousItems = currentPurchase.items || [];
                const previousProductQuantities = new Map();
                for (const item of previousItems) {
                    if (item.itemType !== 'customer-product' || !item.productId) continue;
                    previousProductQuantities.set(item.productId, (previousProductQuantities.get(item.productId) || 0) + Number(item.quantity || 0));
                }
                const nextProductQuantities = new Map();
                const items = [];

                for (const requested of data.items) {
                    if (requested.productId.startsWith('customer-product:')) {
                        const productId = requested.productId.slice('customer-product:'.length);
                        const snapshot = productSnapshots.get(productId);
                        if (!snapshot?.exists || snapshot.data().userId !== req.user.uid) fail('A selected product could not be found.', 404);
                        const product = snapshot.data();
                        const existingQuantity = previousProductQuantities.get(productId) || 0;
                        if (product.status !== 'active' && !existingQuantity) fail(`${product.productName} is inactive.`);
                        nextProductQuantities.set(productId, (nextProductQuantities.get(productId) || 0) + requested.quantity);
                        items.push({ productId, itemType: 'customer-product', productName: product.productName, quantity: requested.quantity, price: Number(product.price || 0), subtotal: Number(product.price || 0) * requested.quantity });
                        continue;
                    }
                    if (requested.productId.startsWith('plan:')) {
                        const planId = requested.productId.slice('plan:'.length);
                        const snapshot = planSnapshots.get(planId);
                        if (!snapshot?.exists || snapshot.data().userId !== req.user.uid) fail('A selected plan could not be found.', 404);
                        const plan = snapshot.data();
                        const previousPlan = previousItems.some((item) => item.itemType === 'plan' && item.productId === planId);
                        if (plan.state === 'inactive' && !previousPlan) fail(`${plan.planName} is inactive.`);
                        const planItems = plan.items || [];
                        const includedItems = planItems.map((item, index) => {
                            const quantity = Number(item.quantity || 0);
                            const estimatedSubtotal = Number(item.subtotal ?? quantity * Number(item.estimatedPrice ?? item.price ?? 0));
                            if (requested.actualSubtotals && requested.actualSubtotals.length !== planItems.length) fail('Actual prices do not match the selected plan items.');
                            return { ...item, estimatedSubtotal, actualSubtotal: Number(requested.actualSubtotals?.[index] ?? item.actualSubtotal ?? estimatedSubtotal) };
                        });
                        const estimatedTotal = includedItems.reduce((sum, item) => sum + item.estimatedSubtotal, 0);
                        const actualPlanTotal = includedItems.reduce((sum, item) => sum + item.actualSubtotal, 0);
                        const storedBudget = Number(plan.budget);
                        const alternateBudget = Number(plan.planBudget ?? plan.budgetAmount ?? plan.plannedBudget ?? plan.estimatedBudget ?? plan.spendingLimit ?? plan.totalBudget ?? plan.Budget);
                        const legacyMeta = /^FINTRACK_PLAN_V1\|([^|]+)\|([\d.]+)$/.exec(String(plan.description || ''));
                        const descriptionBudget = /(?:budget|limit)\s*[:=\-]\s*(?:₱|PHP\s*)?([\d,]+(?:\.\d+)?)/i.exec(String(plan.description || ''));
                        const planBudget = Number.isFinite(storedBudget) && storedBudget > 0 ? storedBudget : Number.isFinite(alternateBudget) && alternateBudget > 0 ? alternateBudget : Number(legacyMeta?.[2] ?? descriptionBudget?.[1]?.replaceAll(',', '') ?? storedBudget ?? 0);
                        items.push({ productId: planId, itemType: 'plan', productName: plan.planName, quantity: requested.quantity, price: actualPlanTotal, subtotal: actualPlanTotal * requested.quantity, estimatedTotal, planBudget, includedItems });
                        continue;
                    }
                    fail('A selected product or plan is invalid.');
                }

                const totalAmount = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
                const amountPaid = Number(currentPurchase.amountPaid || 0);
                if (totalAmount + 0.000001 < amountPaid) fail('The updated total cannot be less than the amount already paid.', 409);
                const balanceAmount = Math.max(0, totalAmount - amountPaid);
                const paymentStatus = balanceAmount === 0 ? 'paid' : amountPaid > 0 ? 'partial' : totalAmount ? 'unpaid' : 'paid';
                const updates = {
                    customerId: data.customerId,
                    customerName: selectedCustomer.customerName,
                    purchaseDate: data.purchaseDate,
                    remarks: data.remarks || '',
                    items,
                    totalAmount,
                    amountPaid,
                    balanceAmount,
                    paymentStatus,
                    updatedAt: timestamp()
                };

                for (const productId of productIds) {
                    const snapshot = productSnapshots.get(productId);
                    if (!snapshot?.exists) fail('A product in this purchase no longer exists.', 409);
                    const product = snapshot.data();
                    if (product.type !== 'product') continue;
                    const restoredStock = Number(product.stockQuantity || 0) + (previousProductQuantities.get(productId) || 0);
                    const nextQuantity = nextProductQuantities.get(productId) || 0;
                    if (restoredStock < nextQuantity) fail(`Not enough stock for ${product.productName}.`, 409);
                    transaction.update(productReferences.get(productId), { stockQuantity: restoredStock - nextQuantity, updatedAt: timestamp() });
                }
                transaction.update(reference, updates);
                const orderedPayments = [...paymentSnapshot.docs].sort((left, right) => {
                    const leftData = left.data();
                    const rightData = right.data();
                    return String(leftData.paymentDate || '').localeCompare(String(rightData.paymentDate || ''))
                        || Number(leftData.createdAt?.toMillis?.() || 0) - Number(rightData.createdAt?.toMillis?.() || 0);
                });
                let paidThrough = 0;
                for (const payment of orderedPayments) {
                    const paymentData = payment.data();
                    paidThrough += Number(paymentData.amount || 0);
                    const paymentBalance = Math.max(0, totalAmount - paidThrough);
                    transaction.update(payment.ref, {
                        customerId: data.customerId,
                        customerName: selectedCustomer.customerName,
                        purchaseLabel: data.purchaseDate,
                        remainingBalance: paymentBalance,
                        paymentStatus: paymentBalance === 0 ? 'paid' : 'partial',
                        updatedAt: timestamp()
                    });
                }
                return { id, ...currentPurchase, ...updates };
            });
            return res.json(updatedPurchase);
        }

        const updates = { purchaseDate: data.purchaseDate, remarks: data.remarks };
        if (data.actualItems) {
            const items = [...(purchase.items || [])];
            for (const actualItem of data.actualItems) {
                const item = items[actualItem.itemIndex];
                if (!item?.includedItems?.length || item.includedItems.length !== actualItem.actualSubtotals.length) fail('Actual prices do not match the saved plan items.');
                const includedItems = item.includedItems.map((included, index) => ({ ...included, actualSubtotal: actualItem.actualSubtotals[index] }));
                const actualPlanTotal = includedItems.reduce((sum, included) => sum + included.actualSubtotal, 0);
                items[actualItem.itemIndex] = { ...item, price: actualPlanTotal, subtotal: actualPlanTotal * Number(item.quantity || 1), includedItems };
            }
            const totalAmount = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
            const amountPaid = Number(purchase.amountPaid || 0);
            const balanceAmount = Math.max(0, totalAmount - amountPaid);
            Object.assign(updates, { items, totalAmount, balanceAmount, paymentStatus: balanceAmount === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid' });
        }
        for (const key of ['purchaseDate', 'remarks']) if (updates[key] === undefined) delete updates[key];
        await reference.update({ ...updates, updatedAt: timestamp() });
        res.json({ id, ...purchase, ...updates });
    } catch (error) { next(error); }
}

export async function deleteCustomerPurchase(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        await requireCustomerOwnedPurchase(req, id);
        await removePurchaseRecord(id);
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function customerPurchaseReceipt(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const customerId = await ownedCustomerId(req);
        const snapshot = await firestore.collection('purchases').doc(id).get();
        if (!snapshot.exists) fail('Purchase transaction not found.', 404);
        let purchase = snapshot.data();
        let contact = null;
        if (purchase.customerId !== customerId && purchase.userId === req.user.uid) {
            const contactSnapshot = await firestore.collection('customerContacts').doc(purchase.customerId).get();
            if (contactSnapshot.exists) contact = contactSnapshot.data();
        }
        if (!customerOwnsPurchaseRecord(req.user.uid, customerId, purchase, contact)) fail('Purchase transaction not found.', 404);
        purchase = await purchaseWithProcessorName({ id: snapshot.id, ...purchase }, req.profile.fullName || req.user.email || '—');
        const pdf = await purchaseReceiptPdf(purchase);
        res.type('application/pdf').set('Content-Disposition', `inline; filename="purchase-${snapshot.id}.pdf"`).send(pdf);
    } catch (error) { next(error); }
}

export async function listCustomerTransactions(req, res, next) {
    try {
        const customerId = await ownedCustomerId(req);
        const period = String(req.query.period || 'month');
        const anchorDate = String(req.query.date || new Date().toISOString().slice(0, 10));
        const { from, to } = transactionDateRange(period, anchorDate);

        const [purchases, payments, expenses] = await Promise.all([
            customerOwnedRows('purchases', customerId, req.user.uid),
            customerOwnedRows('payments', customerId, req.user.uid),
            firestore.collection('customerExpenses').where('userId', '==', req.user.uid).get()
        ]);
        const transactions = [
            ...purchases.map((purchase) => ({ id: purchase.id, date: purchase.purchaseDate, type: 'Purchase', description: (purchase.items || []).map((item) => item.productName).join(', '), amount: Number(purchase.totalAmount || 0), method: 'Purchase', status: purchase.paymentStatus })),
            ...payments.map((payment) => ({ id: payment.id, date: payment.paymentDate, type: 'Payment', description: payment.notes || 'Payment received', amount: Number(payment.amount || 0), method: payment.paymentMethod || 'Other', status: 'Paid' })),
            ...rows(expenses).map((expense) => ({ id: expense.id, date: expense.expenseDate, type: 'Expense', description: expense.title, amount: Number(expense.amount || 0), method: expense.paymentMethod || expense.category, status: 'Recorded' }))
        ].filter((transaction) => transaction.date >= from && transaction.date <= to)
            .sort((left, right) => right.date.localeCompare(left.date));

        res.json({ period, anchorDate, from, to, transactions });
    } catch (error) { next(error); }
}

export async function listCustomerPayments(req, res, next) {
    try {
        const customerId = await ownedCustomerId(req);
        const payments = await customerOwnedRows('payments', customerId, req.user.uid);
        res.json(await Promise.all(payments.map(paymentWithProcessorName)));
    } catch (error) { next(error); }
}

async function mutateCustomerPayment(req, id, data, remove = false) {
    const customerId = await ownedCustomerId(req);
    const paymentReference = firestore.collection('payments').doc(id);
    return firestore.runTransaction(async (transaction) => {
        const paymentSnapshot = await transaction.get(paymentReference);
        if (!paymentSnapshot.exists || !customerOwnsPaymentRecord(req.user.uid, paymentSnapshot.data())) fail('Payment record not found.', 404);
        const payment = paymentSnapshot.data();
        const purchaseReference = firestore.collection('purchases').doc(payment.purchaseId);
        const purchaseSnapshot = await transaction.get(purchaseReference);
        if (!purchaseSnapshot.exists) fail('The related purchase was not found.', 404);
        const purchase = purchaseSnapshot.data();
        const customerReference = purchase.customerId === customerId
            ? firestore.collection('customers').doc(customerId)
            : firestore.collection('customerContacts').doc(purchase.customerId);
        const customerSnapshot = await transaction.get(customerReference);
        if (!customerOwnsPurchase(req, purchase, customerSnapshot.data())) fail('Payment record not found.', 404);
        const totals = paymentTotalsAfterChange(purchase, payment.amount, remove ? 0 : data.amount ?? payment.amount);
        transaction.update(purchaseReference, { ...totals, updatedAt: timestamp() });
        if (remove) transaction.delete(paymentReference);
        else transaction.update(paymentReference, {
            ...data,
            ...totals,
            processedBy: req.profile.fullName || req.user.email || 'User',
            updatedAt: timestamp()
        });
        return { id, ...payment, ...data, ...totals };
    });
}

export async function updateCustomerPayment(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(paymentSchema.pick({ amount: true, paymentDate: true, paymentMethod: true, notes: true }).partial().strict(), req.body);
        res.json(await mutateCustomerPayment(req, id, data));
    } catch (error) { next(error); }
}

export async function deleteCustomerPayment(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        await mutateCustomerPayment(req, id, {}, true);
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function listCustomerExpenses(req, res, next) {
    try {
        const snapshot = await firestore.collection('customerExpenses').where('userId', '==', req.user.uid).get();
        res.json(rows(snapshot));
    } catch (error) { next(error); }
}

export async function createCustomerExpense(req, res, next) {
    try {
        const data = parse(expenseSchema, req.body);
        const customerId = await ownedCustomerId(req);
        const value = { ...data, customerId, userId: req.user.uid, createdAt: timestamp(), updatedAt: timestamp() };
        const reference = await firestore.collection('customerExpenses').add(value);
        res.status(201).json({ id: reference.id, ...value });
    } catch (error) { next(error); }
}

export async function updateCustomerExpense(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(expenseSchema, req.body);
        const reference = firestore.collection('customerExpenses').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || !customerOwnsExpenseRecord(req.user.uid, snapshot.data())) fail('Expense not found.', 404);
        await reference.update({ ...data, updatedAt: timestamp() });
        res.json({ id, ...data, userId: req.user.uid });
    } catch (error) { next(error); }
}

export async function deleteCustomerExpense(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const reference = firestore.collection('customerExpenses').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists || !customerOwnsExpenseRecord(req.user.uid, snapshot.data())) fail('Expense not found.', 404);
        await reference.delete();
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function listCustomerRecords(req, res, next) {
    try {
        const customerId = await ownedCustomerId(req);
        const [purchases, payments, expenses] = await Promise.all([
            customerOwnedRows('purchases', customerId, req.user.uid),
            customerOwnedRows('payments', customerId, req.user.uid),
            firestore.collection('customerExpenses').where('userId', '==', req.user.uid).get()
        ]);
        res.json({ purchases, payments: await Promise.all(payments.map(paymentWithProcessorName)), expenses: rows(expenses) });
    } catch (error) { next(error); }
}
