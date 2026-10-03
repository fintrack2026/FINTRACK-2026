import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAP0cSiDrpR-QitYQbjGcMw4tbxiW2kS94",
  authDomain: "fintrack-5c2a9.firebaseapp.com",
  projectId: "fintrack-5c2a9",
  storageBucket: "fintrack-5c2a9.firebasestorage.app",
  messagingSenderId: "173760738687",
  appId: "1:173760738687:web:33726cd5fd1b538bff964a",
  measurementId: "G-5J5CJBR9C6"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;