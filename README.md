# FinTrack

FinTrack is a web app for tracking customers, products and services, purchase transactions, payments, expenses, and financial summaries. It has separate customer and business-workspace experiences.

## Table of contents

- [Roles and access](#roles-and-access)
- [Get started](#get-started)
- [User account guide](#user-account-guide)
- [Staff workspace guide](#staff-workspace-guide)
- [Main admin guide](#main-admin-guide)
- [How records and balances work](#how-records-and-balances-work)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Developer notes](#developer-notes)

## Roles and access

| Role | Sign-in choice | What the role can do |
| --- | --- | --- |
| User (customer role) | User access | Manage the user's plans, purchase transactions, payments, expenses, and profile. User records are private to that account. |
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

## User account guide

Customer data is scoped to the signed-in account. A customer's products, plans, contacts, purchases, payments, and expenses do not become part of the shared staff workspace catalog or reports.

### Overview

**User Overview** lets the user set a separate allocated budget for each month and shows that month's paid expenses and remaining balance. Only payments made and expenses dated in that month reduce the balance. Unpaid purchases do not count as expenses. Selecting another month loads its budget without carrying over the previous month's balance.

### My plan purchase

This is the customer's personal purchase-plan planner; it is not the staff workspace catalog.

1. Open **My plan purchase**.
2. Select **Add Plan**, choose **Products**, **Services / Bills**, or **Groceries**, and enter a date, allocated budget, and plan items. Product and grocery items have quantities; service and bill items use a single estimated amount without a quantity.
3. Review the saved plans, including estimated items, allocated budgets, remaining amounts, and budget status.
4. Review the separate Products, Services / Bills, and Groceries sections. Edit or delete a plan using its row actions. Plans can be marked active/inactive. Inactive plans cannot be selected for new purchases.

When a plan is selected in a purchase, its item prices can be recorded as actual amounts and compared with the plan's estimate and budget.

### Help Center

The **Help Center** explains the User Overview's budget and expense summaries, how to create a plan and record purchases or payments, and how to review records. It also clarifies that each purchase appears once, how paid and unpaid amounts are shown, and how to use the **From** and **To** date filters.

### Purchase Transactions

1. Open **Purchase Transactions** and choose **Create transaction**.
2. The signed-in user's account name is selected automatically as the purchaser.
3. Set the purchase date.
4. Choose one or more active products, services, or plans; enter a quantity where applicable. Service and bill plans do not use a quantity. Use **Add another item** for more lines.
5. For a plan, review or change the actual prices for included items.
6. Review the calculated total, add optional remarks, and choose **Create transaction**.

The transaction appears in the purchase list with its total, amount paid, remaining balance, payment status, and date. Purchases and their payments are recorded automatically in **My expenses** and **All records**; there is no need to enter them again. Use the **From** and **To** fields to filter by a date range and search to find a transaction. Open a row's item view or receipt actions to inspect the transaction; the receipt can be opened or printed. Transactions created by the account can be edited or deleted. A purchase with linked payments must have those payments deleted first.

To create the first transaction, create at least one plan under **My plan purchase**. The signed-in user's account is automatically selected for the transaction.

### Payments

1. Open **Payments**, then select **Record payment**.
2. Choose a purchase with an outstanding balance.
3. Enter an amount no greater than the remaining balance, date, payment method, and optional notes.
4. Save the payment.

The payment updates the purchase balance and status. Available methods are **Cash**, **Bank Transfer**, **GCash**, and **Others**. FinTrack records the method; it does not process a bank, GCash, or card charge.

The payment list has **From** and **To** date filters and displays the related transaction and payment details. Payments are also automatically listed in **My expenses**. The account can edit or delete its own payments; the related purchase balance is recalculated. A payment cannot be recorded without an unpaid or partially paid purchase. If there is no purchase with a balance, create a purchase first.

### My expenses

Purchase transactions and payments appear here automatically. Each purchase is summarized only once: unpaid or partially paid purchases appear as **Purchase**, and fully paid purchases appear as **Payment** with the total amount paid. Partial payments are included in the Purchase row's paid amount and do not create duplicate rows. There is no need to re-enter a purchase or payment. Use **From** and **To** to filter by date range. Previously recorded separate expenses, if any, remain visible here.

### Payment summary

**Payment summary** groups the customer's recorded payments by payment method. Use **From** and **To** to select a date range.

### All records

**All records** combines the account's purchases, payments, and expenses into a date-filtered view. Its pie chart compares the selected monthly budget with paid expenses for that month. Every purchase remains listed with its full amount and **Paid**, **Partial**, or **Unpaid** status; recorded payments and manual expenses appear as separate rows. Summary cards distinguish total purchases, total paid expenses, and unpaid purchase balances. Tabs let the user show all records, purchases, payments, expenses, or outstanding balances. Search and the **From** and **To** date range help locate records; available row actions depend on record ownership and type.

### Personal information

Select the account chip at the top of the page to open personal information. The profile can update the full name, phone number, address, and one of the preset avatars. The email address is read-only. The account chip displays the username when available.

Phone number fields accept digits only. Mobile number and address are optional during sign-up.

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
- In **My expenses**, each purchase is summarized only once. **All records** shows every purchase with its **Paid**, **Partial**, or **Unpaid** status and lists its payments separately.
- Paid and Total Expenses exclude unpaid balances. Partial transactions contribute only the amount actually paid; the remaining balance is counted as Unpaid. Separately recorded expenses are included in the paid total.
- Deleting a payment restores its amount to the purchase balance. Delete payments before deleting their linked purchase.
- Customer-created catalog items and contacts belong to that customer account. They are distinct from workspace products and customers.
- User-facing record views use **From** and **To** date-range filters. Purchases, payments, and expenses are filtered using their applicable dates.

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
| Cannot create a purchase | Ensure there is an active product, service, or plan, enter a valid date and quantity, and check product stock. The signed-in user's account is selected automatically as the purchaser. |
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
