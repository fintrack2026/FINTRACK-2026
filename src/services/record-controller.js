import { collectionRows, firestore, timestamp, withAudit } from './firestore.js';
import { idSchema, parse } from './validation.js';

export function createRecordHandlers({ collection, schema, beforeDelete = async () => {} }) {
    return {
        async list(req, res, next) {
            try { res.json(await collectionRows(collection)); } catch (error) { next(error); }
        },
        async create(req, res, next) {
            try {
                const data = parse(schema, req.body);
                const reference = await firestore.collection(collection).add(withAudit(data, req.user.uid, true));
                res.status(201).json({ id: reference.id, ...data });
            } catch (error) { next(error); }
        },
        async update(req, res, next) {
            try {
                const { id } = parse(idSchema, req.params);
                const data = parse(schema.partial(), req.body);
                await firestore.collection(collection).doc(id).update(withAudit(data, req.user.uid));
                res.json({ id, ...data });
            } catch (error) { next(error); }
        },
        async remove(req, res, next) {
            try {
                const { id } = parse(idSchema, req.params);
                await beforeDelete(id);
                await firestore.collection(collection).doc(id).delete();
                res.status(204).end();
            } catch (error) { next(error); }
        }
    };
}

export function conflict(message) {
    throw Object.assign(new Error(message), { status: 409 });
}

export { firestore, timestamp };