import { createRecordHandlers, conflict, firestore } from '../services/record-controller.js';
import { productSchema } from '../services/validation.js';

const handlers = createRecordHandlers({
    collection: 'products',
    schema: productSchema,
    async beforeDelete(id) {
        const purchases = await firestore.collection('purchases').get();
        if (purchases.docs.some((purchase) => (purchase.data().items || []).some((item) => item.productId === id))) {
            conflict('This product is used by purchase records and cannot be deleted.');
        }
    }
});

export const listProducts = handlers.list;
export const createProduct = handlers.create;
export const updateProduct = handlers.update;
export const deleteProduct = handlers.remove;