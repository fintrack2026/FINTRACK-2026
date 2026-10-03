import { firestore } from '../config/firebase.js';

export const collections = {
    customers: 'customers',
    products: 'products',
    expenses: 'expenses',
    purchases: 'purchases',
    payments: 'payments',
    users: 'users'
};

export const timestamp = () => new Date().toISOString();
export const documentData = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
export const collectionRows = async (name) => (await firestore.collection(name).get()).docs.map(documentData);
export const withAudit = (data, uid, created = false) => ({ ...data, userId: uid, updatedAt: timestamp(), ...(created ? { createdAt: timestamp() } : {}) });
export { firestore };
