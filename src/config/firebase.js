import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const managedRuntime = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTIONS_EMULATOR);
const configured = !managedRuntime && Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

const app = getApps().length
    ? getApps()[0]
    : configured
        ? initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        })
        : initializeApp();

export const firebaseConfigured = configured || managedRuntime;
export const adminAuth = getAuth(app);
export const firestore = getFirestore(app);
