import { adminAuth, firebaseConfigured, firestore } from '../config/firebase.js';
import { ensureCustomerAccountProfile } from '../services/customer-account.js';

async function verifyToken(req) {
    if (!firebaseConfigured) {
        throw Object.assign(new Error('Firebase Admin is not configured.'), { status: 503 });
    }
    const authorization = String(req.headers.authorization || '');
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
    try { return await adminAuth.verifyIdToken(token); }
    catch (error) { throw Object.assign(new Error('Invalid or expired authentication token.'), { status: 401, cause: error }); }
}

async function isMainAdmin(userId) {
    const configuredUid = String(process.env.MAIN_ADMIN_UID || '').trim();
    if (configuredUid) return configuredUid === userId;
    const admins = await firestore.collection('users').where('role', '==', 'admin').limit(2).get();
    return admins.size === 1 && admins.docs[0].id === userId;
}

export async function verifyAuthToken(req, res, next) {
    try {
        req.user = await verifyToken(req);
        return next();
    } catch (error) { return next(error); }
}

export async function requireAuth(req, res, next) {
    try {
        req.user = await verifyToken(req);
        const profile = await firestore.collection('users').doc(req.user.uid).get();
        if (!profile.exists) return res.status(403).json({ error: 'User profile not found.' });
        req.profile = { id: profile.id, ...profile.data() };
        if (req.profile.status === 'inactive') return res.status(403).json({ error: 'This account is inactive.' });
        if (req.profile.role === 'admin') {
            req.isMainAdmin = await isMainAdmin(req.user.uid);
            if (!req.isMainAdmin) return res.status(403).json({ error: 'This administrator account is not the Fintrack main admin.' });
        }
        return next();
    } catch (error) { return next(error); }
}

export async function requireAdmin(req, res, next) {
    try {
        if (req.profile?.role !== 'admin' || !await isMainAdmin(req.user.uid)) return next(Object.assign(new Error('Fintrack main administrator permission required.'), { status: 403 }));
        req.isMainAdmin = true;
        return next();
    } catch (error) { return next(error); }
}

export function requireWorkspaceMember(req, res, next) {
    if (req.profile?.role !== 'staff') return next(Object.assign(new Error('Workspace access required.'), { status: 403 }));
    return next();
}

export function requireCustomer(req, res, next) {
    if (req.profile?.role !== 'customer') return next(Object.assign(new Error('Customer access required.'), { status: 403 }));
    return next();
}

export async function requireCustomerAuth(req, res, next) {
    try {
        req.user = await verifyToken(req);
        req.profile = await ensureCustomerAccountProfile(req.user, req.body || {});
        if (req.profile.status === 'inactive') return next(Object.assign(new Error('This account is inactive.'), { status: 403 }));
        if (req.profile.role !== 'customer') return next(Object.assign(new Error('Customer access required.'), { status: 403 }));
        return next();
    } catch (error) { return next(error); }
}
