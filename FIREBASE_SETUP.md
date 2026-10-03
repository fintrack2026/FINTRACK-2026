# Connect Fintrack to Firebase

The app uses a plain HTML, CSS, and JavaScript frontend served by an Express API. Firebase Authentication handles sign-in and Cloud Firestore stores business data and customer profiles. The server uses Firebase Admin credentials; never put those credentials in browser code.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and choose **Add project**.
2. Enter a project name, then finish the project setup. Analytics can be disabled for this app.
3. On the project overview page, choose the Web icon (`</>`) to register a web app. Give it a name such as `Fintrack Web`; Firebase Hosting is optional here.
4. Firebase will show a `firebaseConfig` object. Keep that page open; you will copy four values in the next step.

## 2. Add the web app config

Open `public/assets/js/firebase.js`. Replace the `firebaseConfig` object with the complete config shown for your Firebase Web app:

```js
const firebaseConfig = {
	apiKey: 'paste-api-key',
	authDomain: 'your-project-id.firebaseapp.com',
	projectId: 'your-project-id',
	appId: 'paste-app-id'
};
```

Use the values from your own Firebase project. The web config is designed to be included in browser code; Firestore security comes from the rules in this repository, not from hiding the config.

## 3. Turn on email sign-in

1. In Firebase Console, open **Build > Authentication** and choose **Get started** if prompted.
2. Open **Sign-in method** (sometimes shown as **Sign-in providers**).
3. Choose **Email/Password**, enable it, and save.

## 4. Create Firestore

1. Open **Build > Firestore Database** and choose **Create database**.
2. Choose **Production mode**, select a location, and create the database.
3. Open the Firestore **Rules** tab. Replace its contents with the contents of this project's `firestore.rules`, then choose **Publish**.
Customer profile avatars are selected from six presets and stored in Firestore. Firebase Storage is not required for profile photos.

## 5. Configure and run the server

Copy `.env.example` to `.env` and fill in `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` with credentials for the Firebase Admin SDK. Keep this file private and do not commit it. The Admin SDK credentials are required for the API routes that create and read customers, products, purchases, payments, expenses, and reports.

From the project folder, run:

```powershell
npm install
npm start
```

Open [http://localhost:3000/](http://localhost:3000/). Serving the static files alone is not sufficient because business records are accessed through the authenticated Express API.

## 6. Configure the main admin

1. Register the account through customer access, then find its UID under Firebase Console **Authentication > Users**.
2. Set `MAIN_ADMIN_UID` in `.env` to that UID and restart the server. Set the same environment variable in production.
3. In Firestore, confirm `users/{UID}` has `role: "admin"` and an active status.
4. Sign out, choose **Login as Admin**, and sign in. Only this UID can open the system dashboard and User Management. Other profiles with an `admin` role are rejected; Staff accounts use the business workspace.

Customers register and sign in from the default customer access screen. Their customer record is linked to their account by the authenticated API, and customer views are limited to their own purchases, payment transactions, products, and customer contacts. Products customers add are stored separately in `customerProducts`; contacts they manage are stored in `customerContacts`. Both collections are visible only to the customer who created the records and do not change the shared business catalog. The main admin can view and manage Firebase Authentication accounts from **User Management**. Passwords are managed by Firebase Authentication and are never listed or retrievable in Fintrack. The app creates the `customers`, `customerContacts`, `customerProducts`, `products`, `purchases`, `payments`, and `expenses` collections when you add the first record in each section.

Never download or place a Firebase service-account private key in this browser app. This app uses the Firebase Web SDK and Firestore security rules.