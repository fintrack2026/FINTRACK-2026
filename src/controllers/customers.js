import { createRecordHandlers, conflict, firestore } from '../services/record-controller.js';
import { customerSchema } from '../services/validation.js';

const handlers = createRecordHandlers({
    collection: 'customers',
    schema: customerSchema,
    async beforeDelete(id) {
        const purchases = await firestore.collection('purchases').where('customerId', '==', id).limit(1).get();
        if (!purchases.empty) conflict('This customer is used by purchase records and cannot be deleted.');
    }
});

export const listCustomers = handlers.list;
export const createCustomer = handlers.create;
export const updateCustomer = handlers.update;
export const deleteCustomer = handlers.remove;