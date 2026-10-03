import { adminAuth } from '../config/firebase.js';
import { customerAccountLinkage } from '../services/customer-account.js';
import { collectionRows, firestore, timestamp } from '../services/firestore.js';
import { idSchema, managedUserSchema, parse, roleSchema } from '../services/validation.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export async function listUsers(req, res, next) {
    try {
        const users = await collectionRows('users');
        res.json(users.filter((user) => ['staff', 'admin'].includes(user.role)).map(({ password, ...user }) => ({ ...user, status: user.status || 'active' })));
    } catch (error) { next(error); }
}

export async function listCustomerAccounts(req, res, next) {
    try {
        const [snapshot, customerSnapshot] = await Promise.all([
            firestore.collection('users').where('role', '==', 'customer').get(),
            firestore.collection('customers').get()
        ]);
        const accounts = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        const customerRecords = customerSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        const { linkedAccountIds } = customerAccountLinkage(accounts, customerRecords);
        res.json(accounts.map((profile) => {
            return {
                id: profile.id,
                fullName: profile.fullName || '',
                email: profile.email || '',
                status: profile.status || 'active',
                createdAt: profile.createdAt || '',
                customerLinked: linkedAccountIds.has(profile.id)
            };
        }));
    } catch (error) { next(error); }
}

export async function createUser(req, res, next) {
    try {
        const data = parse(managedUserSchema, req.body);
        const user = await adminAuth.createUser({ email: data.email, password: data.password, displayName: data.fullName });
        await firestore.collection('users').doc(user.uid).set({ fullName: data.fullName, email: user.email, role: data.role, status: 'active', createdAt: timestamp() });
        res.status(201).json({ id: user.uid, fullName: data.fullName, email: user.email, role: data.role });
    } catch (error) { next(error); }
}

export async function updateUser(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        if (id === req.user.uid) fail('You cannot change your own role here.');
        const data = parse(roleSchema, req.body);
        await firestore.collection('users').doc(id).update(data);
        res.json({ id, ...data });
    } catch (error) { next(error); }
}

export async function deleteUser(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        if (id === req.user.uid) fail('You cannot delete your signed-in account here.');
        await adminAuth.deleteUser(id);
        await firestore.collection('users').doc(id).delete();
        res.status(204).end();
    } catch (error) { next(error); }
}

async function registeredUsers(mainAdminUid) {
    const authUsers = [];
    let pageToken;
    do {
        const page = await adminAuth.listUsers(1000, pageToken);
        authUsers.push(...page.users);
        pageToken = page.pageToken;
    } while (pageToken);

    const profiles = await collectionRows('users');
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    return authUsers.map((user) => {
        const profile = profilesById.get(user.uid) || {};
        return {
            id: user.uid,
            fullName: profile.fullName || user.displayName || '',
            email: user.email || '',
            role: profile.role || 'customer',
            status: user.disabled || profile.status === 'inactive' ? 'inactive' : 'active',
            createdAt: user.metadata.creationTime || '',
            lastSignInAt: user.metadata.lastSignInTime || '',
            emailVerified: user.emailVerified,
            isMainAdmin: user.uid === mainAdminUid
        };
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listRegisteredUsers(req, res, next) {
    try {
        const users = await registeredUsers(req.user.uid);
        const activeUsers = users.filter((user) => user.status === 'active').length;
        res.json({
            users,
            summary: { totalUsers: users.length, activeUsers, inactiveUsers: users.length - activeUsers },
            recentUsers: users.slice(0, 5)
        });
    } catch (error) { next(error); }
}

export async function registeredUserOverview(req, res, next) {
    try {
        const users = await registeredUsers(req.user.uid);
        const activeUsers = users.filter((user) => user.status === 'active').length;
        res.json({
            summary: { totalUsers: users.length, activeUsers, inactiveUsers: users.length - activeUsers },
            recentUsers: users.slice(0, 5)
        });
    } catch (error) { next(error); }
}

export async function getRegisteredUser(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const user = await adminAuth.getUser(id);
        const profileSnapshot = await firestore.collection('users').doc(id).get();
        const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
        res.json({
            id: user.uid,
            fullName: profile.fullName || user.displayName || '',
            email: user.email || '',
            role: profile.role || 'customer',
            status: user.disabled || profile.status === 'inactive' ? 'inactive' : 'active',
            createdAt: user.metadata.creationTime || '',
            lastSignInAt: user.metadata.lastSignInTime || '',
            emailVerified: user.emailVerified,
            isMainAdmin: user.uid === req.user.uid
        });
    } catch (error) { next(error); }
}

export async function setRegisteredUserStatus(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        if (id === req.user.uid) fail('You cannot deactivate the main admin account.');
        const status = req.body?.status;
        if (!['active', 'inactive'].includes(status)) fail('Status must be active or inactive.');
        const disabled = status === 'inactive';
        const user = await adminAuth.updateUser(id, { disabled });
        await firestore.collection('users').doc(id).set({ status, updatedAt: timestamp() }, { merge: true });
        res.json({ id: user.uid, status });
    } catch (error) { next(error); }
}

export async function deleteRegisteredUser(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        if (id === req.user.uid) fail('You cannot delete the main admin account.');
        await adminAuth.deleteUser(id);
        await firestore.collection('users').doc(id).delete();
        res.status(204).end();
    } catch (error) { next(error); }
}