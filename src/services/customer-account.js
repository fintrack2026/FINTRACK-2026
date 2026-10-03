import { firestore, timestamp } from './firestore.js';

export function customerAccountLinkage(accounts, customerRecords) {
    const customersById = new Map(customerRecords.map((customer) => [customer.id, customer]));
    const linkedAccountIds = new Set();
    const linkedCustomerIds = new Set();
    for (const account of accounts) {
        const customer = customersById.get(account.customerId);
        if (account.role === 'customer' && customer?.accountId === account.id) {
            linkedAccountIds.add(account.id);
            linkedCustomerIds.add(customer.id);
        }
    }
    return { linkedAccountIds, linkedCustomerIds };
}

export function summarizeCustomerMonitoring(users, customerRecords) {
    const accounts = users.filter((user) => user.role === 'customer');
    const { linkedAccountIds, linkedCustomerIds } = customerAccountLinkage(accounts, customerRecords);
    const linkedCustomerRecords = linkedCustomerIds.size;
    return {
        registeredCustomers: accounts.length,
        customers: customerRecords.length,
        linkedRegisteredCustomers: linkedAccountIds.size,
        unlinkedRegisteredCustomers: accounts.length - linkedAccountIds.size,
        linkedCustomerRecords,
        unlinkedCustomerRecords: customerRecords.length - linkedCustomerRecords
    };
}

export async function ensureCustomerAccountProfile(user, details = {}) {
    const reference = firestore.collection('users').doc(user.uid);
    return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (snapshot.exists) return { id: snapshot.id, ...snapshot.data() };
        const profile = {
            fullName: String(details.fullName || user.name || user.email || 'Customer').trim().slice(0, 150),
            username: String(details.username || '').trim().slice(0, 50),
            mobileNumber: String(details.mobileNumber || '').trim().slice(0, 40),
            address: String(details.address || '').trim().slice(0, 300),
            acceptedTermsAt: details.acceptedTerms ? timestamp() : null,
            email: user.email || '',
            role: 'customer',
            createdAt: timestamp()
        };
        transaction.create(reference, profile);
        return { id: user.uid, ...profile };
    });
}
