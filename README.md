# FinTrack

FinTrack is a web app for tracking customers, products and services, purchase transactions, payments, expenses, and financial summaries. It has separate customer and business-workspace experiences.

## Table of contents

- [Roles and access](#roles-and-access)
- [Get started](#get-started)
- [Customer guide](#customer-guide)
- [Staff workspace guide](#staff-workspace-guide)
- [Main admin guide](#main-admin-guide)
- [How records and balances work](#how-records-and-balances-work)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Developer notes](#developer-notes)

## Roles and access

| Role | Sign-in choice | What the role can do |
| --- | --- | --- |
| Customer | Customer access | Manage the customer's own products, plans, contacts, purchase transactions, payments, expenses, and profile. Customer records are private to that account. |
| Staff | Login as Admin | Use the business workspace to manage shared customers, products, purchase transactions, payments, expenses, dashboard, and reports. Staff cannot manage registered accounts. |
| Main admin | Login as Admin | Use the system administration dashboard and User Management to review registered accounts, inspect account details, deactivate/reactivate accounts, or delete accounts. The main admin is not a business-workspace account. |

New self-registered accounts are customer accounts. A customer account does not automatically get staff or main-admin access.

The main admin is the single account whose Firebase Authentication UID matches `MAIN_ADMIN_UID`. See [Firebase setup](./FIREBASE_SETUP.md) for initial configuration.

## Get started

### Use the app

1. Open the deployed FinTrack URL.
2. For a new customer account, use **Create an account** on the customer access screen. Enter a full name, username, email, and password; mobile number and address are optional. Accept the Terms and Conditions.
3. For an existing customer, sign in on the customer access screen.
4. Staff and the main admin choose **Login as Admin** and sign in with their provisioned workspace account.
5. Use **Sign out** in the sidebar to leave the account.

The customer sign-up screen creates customer access only. Staff and the main admin accounts must be provisioned by the project administrator; do not assign the main-admin role to an untrusted account.

### Run locally

Requirements: Node.js 20 or newer and a Firebase project.

1. Follow [Firebase setup](./FIREBASE_SETUP.md) to configure Firebase Authentication, Firestore, the browser Firebase config, and server credentials.
2. In a terminal opened at the project root, install packages and start the app:

   ```powershell
   npm install
   npm start
   ```

3. Open [http://localhost:3000](http://localhost:3000).

For automatic server restarts while developing, use `npm run dev`. Serving only the static frontend is not enough: the app also needs the authenticated Express API and Firebase Admin credentials.

## Customer guide

Customer data is scoped to the signed-in account. A customer's products, plans, contacts, purchases, payments, and expenses do not become part of the shared staff workspace catalog or reports.

### Overview

**Overview** summarizes the customer's purchase totals, recorded payments, expenses, and remaining balances. Charts show recent activity and the paid-versus-outstanding balance. The payment reminder lists purchases with a remaining balance, and recent purchases are shown below.

### My plan purchase

This is the customer's personal product/service list and purchase-plan planner; it is not the staff workspace catalog.

1. Open **My plan purchase**.
2. Use **Add Product** to save a product or service with its name, category, type, price, stock (for products), and active/inactive status.
3. Use **Add Plan** to create a named plan with a date, budget, and one or more items with quantities and estimated prices.
4. Use the **All**, **Products & services**, and **Plans** filters to switch the list shown.
5. Edit or delete a saved item using its row actions. Products and plans can be marked active/inactive. Inactive items cannot be selected for new purchases. A product already used in a purchase cannot be deleted; mark it inactive instead.

When a plan is selected in a purchase, its item prices can be recorded as actual amounts and compared with the plan's estimate and budget.

### My customers

Use **My customers** to save contacts that the customer manages, separate from the customer's own account. Add a contact with a name and optional phone, email, and address; use the search field to find contacts later. Edit or delete a contact from its row. A contact cannot be deleted while it is used by one of the account's purchase transactions.

Contacts are optional when creating a purchase: the customer can select **My account** as the purchaser instead.

### Purchase Transactions

1. Open **Purchase Transactions** and choose **Create transaction**.
2. Choose **My account** or one of the customer's saved contacts.
3. Set the purchase date.
4. Choose one or more active products, services, or plans; enter a quantity for each. Use **Add another item** for more lines.
5. For a plan, review or change the actual prices for included items.
6. Review the calculated total, add optional remarks, and choose **Create transaction**.

The transaction appears in the purchase list with its total, amount paid, remaining balance, payment status, and date. The list can be narrowed by calendar period and searched. Open a row's item view or receipt actions to inspect the transaction; the receipt can be opened or printed. Transactions created by the account can be edited or deleted. A purchase with linked payments must have those payments deleted first.

To create the first transaction, add at least one active product/service or plan under **My plan purchase**. No saved contact is required if **My account** is selected.

### Payments

1. Open **Payments**, then select **Record payment**.
2. Choose a purchase with an outstanding balance.
3. Enter an amount no greater than the remaining balance, date, payment method, and optional notes.
4. Save the payment.

The payment updates the purchase balance and status. Available methods are **Cash**, **Bank Transfer**, **GCash**, and **Others**. FinTrack records the method; it does not process a bank, GCash, or card charge.

The payment list has a calendar filter and displays the related transaction and payment details. The account can edit or delete its own payments; the related purchase balance is recalculated. A payment cannot be recorded without an unpaid or partially paid purchase. If there is no purchase with a balance, create a purchase first.

### My expenses

Choose **Add expense** to enter an expense name, category, amount, date, optional payment method, and notes. Expenses can be filtered by day, week, month, or year. The account can edit or delete its own expenses.

### Payment summary

**Payment summary** groups the customer's recorded payments by payment method. Use the date filter to view a day, week, month, or year.

### All records

**All records** combines the account's purchases, payments, and expenses into a date-filtered view. Tabs let the customer show all records, only purchases, only payments, only expenses, or outstanding balances. Search and the calendar filter help locate records; available row actions depend on record ownership and type.

### Personal information

Select the account chip at the top of the page to open personal information. The profile can update the full name, phone number, address, and one of the preset avatars. The email address is read-only. The account chip displays the username when available.

Phone number fields accept digits only. Mobile number and address are optional during sign-up.

## Staff workspace guide

Staff use the business workspace to manage shared business records. Use the sidebar to move between sections. Lists provide row actions for supported edits/deletes; confirmation prompts appear before destructive actions. A record that is linked to another record may not be deletable until the dependent record is removed.

### Dashboard

The dashboard summarizes sales, outstanding receivables, customer/account linkage counts, and expenses. It also shows six-month sales, payment, and expense charts, payment-method totals, recent purchases, and payments collected this month.

### Customers

Add a customer with a name and optional contact number, email, and address. Search, edit, or delete customer records. A customer used by a purchase cannot be deleted.

### Products & services

Add a product or service with a name, category, description, type, price, stock quantity, and active/inactive status. Purchases can only use active items. Product stock is checked and reduced when a purchase is created; insufficient stock prevents the purchase. A product used in a purchase cannot be deleted.

### Purchase Transactions

Create a purchase by selecting a customer, purchase date, one or more products/services, and quantities; remarks are optional. FinTrack calculates the total, starts the purchase as unpaid with the full amount outstanding, and updates product stock. The table shows the customer, processor, total, amount paid, balance, status, and date.

Staff can update supported purchase details, view purchase information, and open or print a receipt. A purchase with linked payments cannot be deleted until those payments have been removed.

### Payments

Record a payment against a purchase with an outstanding balance. Enter the payment amount, date, method, and optional notes. The amount cannot exceed the current balance. FinTrack updates the purchase's amount paid, balance, and payment status. Editing or deleting a payment recalculates the related purchase totals.

Available payment methods are Cash, Bank Transfer, GCash, and Others. These are bookkeeping entries only; no payment processor is connected.

### Expenses

Record a business expense with a name, category, amount, date, optional payment method, and description. Expenses can be edited or deleted.

### Reports

Open **Reports** to choose optional start and end dates, then select **Apply**. The **Summary** tab shows sales, expenses, net, collected payments, outstanding balance, and purchase count. The **Payment methods** tab displays collected totals grouped by method with a chart.

Report totals are calculated from records in the selected date range. Net is calculated as sales minus expenses; it is not a tax or accounting statement.

## Main admin guide

The main admin signs in using **Login as Admin** and can access the system overview and **User Management**.

### System overview

The overview counts registered Firebase Authentication users and shows active/inactive totals and the five most recently registered users. These are account-registration metrics, not sales metrics.

### User Management

Search accounts by name, email, role, status, or UID. Filter the list by active/inactive status and registration date. Open **Details** to inspect account metadata. Use **Deactivate** to block sign-in temporarily; **Activate** restores it. **Delete** permanently removes an account from Firebase Authentication and its user profile. The signed-in main admin cannot deactivate or delete itself.

Passwords are handled by Firebase Authentication and are never displayed by FinTrack. The current User Management screen is for reviewing and managing registered accounts; it does not provide an in-app account-creation form.

## How records and balances work

- A purchase stores its line items, total, paid amount, remaining balance, status, date, customer, and processor.
- A new purchase starts with zero paid and its full total outstanding (unless its total is zero).
- Payments belong to a purchase. Each saved payment reduces that purchase's outstanding balance.
- A purchase is **unpaid** before any amount is paid, **partial** while a balance remains after payment, and **paid** when the balance reaches zero.
- Deleting a payment restores its amount to the purchase balance. Delete payments before deleting their linked purchase.
- Customer-created catalog items and contacts belong to that customer account. They are distinct from workspace products and customers.
- Dates in transaction and report views filter records by their respective purchase, payment, or expense date.

## Privacy and security

- Sign-in is handled by Firebase Authentication. The Express API verifies Firebase ID tokens and applies role checks and input validation.
- Firestore is accessed on the server through the Firebase Admin SDK. Do not put service-account credentials or private keys in browser code, `public/`, source control, or this README.
- Keep `.env` private. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and (for the main admin) `MAIN_ADMIN_UID` in the server environment.
- `public/assets/js/firebase.js` contains the Firebase **web app configuration**, which is different from a service-account private key. Keep the Firestore security rules published and follow [Firebase setup](./FIREBASE_SETUP.md).
- If a service-account key was accidentally shared, revoke it in Google Cloud/Firebase IAM and create a replacement before continuing to use the project.
- Deactivating a user blocks sign-in; deleting one is permanent. Confirm the target account before deleting.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| “Server setup required” or Firebase unavailable | Confirm Firebase Admin environment variables are configured in the server/deployment environment and restart/redeploy. |
| Customer cannot open customer sections | Sign in using Customer access, not Login as Admin. Confirm the account is active and its profile exists. |
| Staff cannot open workspace sections | Sign in using Login as Admin and confirm Firebase has a `users/{uid}` profile with role `staff` and active status. |
| Main admin cannot see system administration | Confirm the signed-in account's UID matches `MAIN_ADMIN_UID` and its profile role is `admin`. |
| Cannot create a purchase | Ensure there is an active product, service, or plan, enter a valid date and quantity, and check product stock. Customers must choose their own account or a contact they own. |
| Cannot record a payment | Select a purchase that still has a balance and enter a positive amount no greater than that balance. |
| Changes are not visible after deployment | Confirm the latest version is deployed and reload the app. The static page and main script are served with cache revalidation/no-store headers. |

## Developer notes

- **Frontend:** vanilla HTML/CSS/JavaScript in `public/`.
- **API:** Express routes and controllers in `src/`.
- **Authentication and data:** Firebase Authentication, Cloud Firestore, and Firebase Admin SDK.
- **Local server:** `server.js`; `functions/index.js` exposes the API for Firebase Functions.
- **Tests:** Node's built-in test runner.

Run the test suite with:

```powershell
npm test
```

The Node server serves static assets from `public/`; root-level `assets/` is not the active frontend directory for this Express setup. Firebase Hosting is configured to serve `public/` and route `/api/**` to the Firebase Function.
