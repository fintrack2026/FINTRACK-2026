import { collectionRows, firestore, timestamp } from '../services/firestore.js';
import { idSchema, parse, paymentSchema } from '../services/validation.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export function customerOwnsPurchase(req, purchase, customer) {
    return req.profile.role !== 'customer' || Boolean(req.profile.customerId
        && purchase.customerId === req.profile.customerId
        && customer?.accountId === req.user.uid
        || purchase.userId === req.user.uid
        && customer?.userId === req.user.uid);
}

export async function paymentWithProcessorName(payment) {
    if (payment.processedBy) return payment;
    if (!payment.userId) return { ...payment, processedBy: '—' };
    const profile = await firestore.collection('users').doc(payment.userId).get();
    return { ...payment, processedBy: profile.data()?.fullName || profile.data()?.email || '—' };
}

export async function listPayments(req, res, next) {
    try {
        const payments = await collectionRows('payments');
        res.json(await Promise.all(payments.map(paymentWithProcessorName)));
    } catch (error) { next(error); }
}

export async function createPayment(req, res, next) {
    try {
        const data = parse(paymentSchema, req.body);
        const paymentReference = firestore.collection('payments').doc();
        const payment = await firestore.runTransaction(async (transaction) => {
            const purchaseReference = firestore.collection('purchases').doc(data.purchaseId);
            const purchaseSnapshot = await transaction.get(purchaseReference);
            if (!purchaseSnapshot.exists) fail('Purchase record not found.', 404);
            const purchase = purchaseSnapshot.data();
            if (req.profile.role === 'customer') {
                const customerReference = purchase.customerId === req.profile.customerId
                    ? firestore.collection('customers').doc(purchase.customerId)
                    : firestore.collection('customerContacts').doc(purchase.customerId);
                const customerSnapshot = await transaction.get(customerReference);
                if (!customerOwnsPurchase(req, purchase, customerSnapshot?.exists ? customerSnapshot.data() : null)) fail('You can only pay for your own purchases.', 403);
            }
            const balance = Number(purchase.balanceAmount || 0);
            if (data.amount > balance) fail('Payment cannot exceed the outstanding balance.', 409);
            const remainingBalance = balance - data.amount;
            const paymentStatus = remainingBalance === 0 ? 'paid' : 'partial';
            const value = { purchaseId: data.purchaseId, purchaseLabel: purchase.purchaseDate, customerId: purchase.customerId, customerName: purchase.customerName, processedBy: req.profile.fullName || req.user.email || 'User', userId: req.user.uid, amount: data.amount, remainingBalance, paymentStatus, paymentDate: data.paymentDate, paymentMethod: data.paymentMethod, notes: data.notes, createdAt: timestamp() };
            transaction.set(paymentReference, value);
            transaction.update(purchaseReference, { amountPaid: Number(purchase.amountPaid || 0) + data.amount, balanceAmount: remainingBalance, paymentStatus, updatedAt: timestamp() });
            return { id: paymentReference.id, ...value };
        });
        res.status(201).json(payment);
    } catch (error) { next(error); }
}

export function paymentTotalsAfterChange(purchase, previousAmount, nextAmount) {
    const amountPaid = Number(purchase.amountPaid || 0) - Number(previousAmount || 0) + Number(nextAmount || 0);
    const balanceAmount = Number(purchase.balanceAmount || 0) + Number(previousAmount || 0) - Number(nextAmount || 0);
    if (balanceAmount < -0.000001) fail('Payment cannot exceed the outstanding balance.', 409);
    const normalizedBalance = Math.max(0, balanceAmount);
    return {
        amountPaid: Math.max(0, amountPaid),
        balanceAmount: normalizedBalance,
        paymentStatus: normalizedBalance === 0 ? 'paid' : amountPaid === 0 ? 'unpaid' : 'partial'
    };
}

export async function updatePayment(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(paymentSchema.pick({ amount: true, paymentDate: true, paymentMethod: true, notes: true }).partial().strict(), req.body);
        const paymentReference = firestore.collection('payments').doc(id);
        await firestore.runTransaction(async (transaction) => {
            const paymentSnapshot = await transaction.get(paymentReference);
            if (!paymentSnapshot.exists) fail('Payment record not found.', 404);
            const payment = paymentSnapshot.data();
            const purchaseReference = firestore.collection('purchases').doc(payment.purchaseId);
            const purchaseSnapshot = await transaction.get(purchaseReference);
            if (!purchaseSnapshot.exists) fail('The related purchase was not found.', 404);
            const purchase = purchaseSnapshot.data();
            const totals = paymentTotalsAfterChange(purchase, payment.amount, data.amount ?? payment.amount);
            transaction.update(purchaseReference, { ...totals, updatedAt: timestamp() });
            transaction.update(paymentReference, {
                ...data,
                remainingBalance: totals.balanceAmount,
                paymentStatus: totals.paymentStatus,
                processedBy: req.profile.fullName || req.user.email || 'User',
                updatedAt: timestamp()
            });
        });
        res.json({ id, ...(await paymentReference.get()).data() });
    } catch (error) { next(error); }
}

export async function deletePayment(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const paymentReference = firestore.collection('payments').doc(id);
        await firestore.runTransaction(async (transaction) => {
            const paymentSnapshot = await transaction.get(paymentReference);
            if (!paymentSnapshot.exists) fail('Payment record not found.', 404);
            const payment = paymentSnapshot.data();
            const purchaseReference = firestore.collection('purchases').doc(payment.purchaseId);
            const purchaseSnapshot = await transaction.get(purchaseReference);
            if (!purchaseSnapshot.exists) fail('The related purchase was not found.', 404);
            const totals = paymentTotalsAfterChange(purchaseSnapshot.data(), payment.amount, 0);
            transaction.update(purchaseReference, { ...totals, updatedAt: timestamp() });
            transaction.delete(paymentReference);
        });
        res.status(204).end();
    } catch (error) { next(error); }
}