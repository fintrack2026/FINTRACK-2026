import { Router } from 'express';
import { requireAdmin, requireAuth, verifyAuthToken } from '../middleware/auth.js';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from '../controllers/customers.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../controllers/expenses.js';
import { createPayment, deletePayment, listPayments, updatePayment } from '../controllers/payments.js';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../controllers/products.js';
import { createPurchase, deletePurchase, getPurchase, listPurchases, receipt, updatePurchase } from '../controllers/purchases.js';
import { dashboard, reports } from '../controllers/reports.js';
import { deleteRegisteredUser, getRegisteredUser, listRegisteredUsers, registeredUserOverview, setRegisteredUserStatus } from '../controllers/users.js';
import { createCustomerContact, createCustomerExpense, createCustomerPlan, createCustomerProduct, customerPurchaseReceipt, deleteCustomerContact, deleteCustomerExpense, deleteCustomerPayment, deleteCustomerPlan, deleteCustomerProduct, deleteCustomerPurchase, ensureCustomerProfile, listCustomerCatalog, listCustomerContacts, listCustomerExpenses, listCustomerPayments, listCustomerPlans, listCustomerProducts, listCustomerPurchases, listCustomerRecords, listCustomerTransactions, provisionCustomerAccount, updateCustomerContact, updateCustomerExpense, updateCustomerPayment, updateCustomerProfile, updateCustomerPurchase, updateCustomerPlan, updateCustomerPlanState, updateCustomerProduct, updateCustomerProductStatus } from '../controllers/customer-portal.js';
import { firebaseConfigured } from '../config/firebase.js';
import { firestore } from '../services/firestore.js';
import { requireCustomerAuth, requireWorkspaceMember } from '../middleware/auth.js';

const router = Router();

router.get('/health', (req, res) => res.status(firebaseConfigured ? 200 : 503).json({
	ok: firebaseConfigured,
	firebaseConfigured,
	message: firebaseConfigured ? 'Firebase Admin is configured.' : 'Add Firebase Admin credentials to .env and restart the server.'
}));
router.post('/customer/provision', verifyAuthToken, provisionCustomerAccount);
router.post('/customer/profile', requireCustomerAuth, ensureCustomerProfile);
router.patch('/customer/profile', requireCustomerAuth, updateCustomerProfile);
router.get('/customer/catalog', requireCustomerAuth, listCustomerCatalog);
router.get('/customer/products', requireCustomerAuth, listCustomerProducts);
router.post('/customer/products', requireCustomerAuth, createCustomerProduct);
router.patch('/customer/products/:id', requireCustomerAuth, updateCustomerProduct);
router.patch('/customer/products/:id/status', requireCustomerAuth, updateCustomerProductStatus);
router.delete('/customer/products/:id', requireCustomerAuth, deleteCustomerProduct);
router.get('/customer/plans', requireCustomerAuth, listCustomerPlans);
router.post('/customer/plans', requireCustomerAuth, createCustomerPlan);
router.patch('/customer/plans/:id', requireCustomerAuth, updateCustomerPlan);
router.patch('/customer/plans/:id/state', requireCustomerAuth, updateCustomerPlanState);
router.delete('/customer/plans/:id', requireCustomerAuth, deleteCustomerPlan);
router.get('/customer/contacts', requireCustomerAuth, listCustomerContacts);
router.post('/customer/contacts', requireCustomerAuth, createCustomerContact);
router.patch('/customer/contacts/:id', requireCustomerAuth, updateCustomerContact);
router.delete('/customer/contacts/:id', requireCustomerAuth, deleteCustomerContact);
router.get('/customer/purchases', requireCustomerAuth, listCustomerPurchases);
router.patch('/customer/purchases/:id', requireCustomerAuth, updateCustomerPurchase);
router.delete('/customer/purchases/:id', requireCustomerAuth, deleteCustomerPurchase);
router.get('/customer/purchases/:id/receipt', requireCustomerAuth, customerPurchaseReceipt);
router.post('/customer/purchases', requireCustomerAuth, createPurchase);
router.get('/customer/payments', requireCustomerAuth, listCustomerPayments);
router.post('/customer/payments', requireCustomerAuth, createPayment);
router.patch('/customer/payments/:id', requireCustomerAuth, updateCustomerPayment);
router.delete('/customer/payments/:id', requireCustomerAuth, deleteCustomerPayment);
router.get('/customer/expenses', requireCustomerAuth, listCustomerExpenses);
router.post('/customer/expenses', requireCustomerAuth, createCustomerExpense);
router.patch('/customer/expenses/:id', requireCustomerAuth, updateCustomerExpense);
router.delete('/customer/expenses/:id', requireCustomerAuth, deleteCustomerExpense);
router.get('/customer/records', requireCustomerAuth, listCustomerRecords);
router.get('/customer/transactions', requireCustomerAuth, listCustomerTransactions);
router.use(requireAuth);
router.get('/me', (req, res) => res.json({ ...req.profile, isMainAdmin: Boolean(req.isMainAdmin) }));
router.get('/admin/overview', requireAdmin, registeredUserOverview);
router.get('/admin/users', requireAdmin, listRegisteredUsers);
router.get('/admin/users/:id', requireAdmin, getRegisteredUser);
router.patch('/admin/users/:id/status', requireAdmin, setRegisteredUserStatus);
router.delete('/admin/users/:id', requireAdmin, deleteRegisteredUser);
router.use(requireWorkspaceMember);
router.get('/dashboard', dashboard);
router.get('/reports', reports);

router.get('/customers', listCustomers);
router.post('/customers', createCustomer);
router.patch('/customers/:id', updateCustomer);
router.delete('/customers/:id', deleteCustomer);
router.get('/products', listProducts);
router.post('/products', createProduct);
router.patch('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.get('/expenses', listExpenses);
router.post('/expenses', createExpense);
router.patch('/expenses/:id', updateExpense);
router.delete('/expenses/:id', deleteExpense);

router.get('/purchases', listPurchases);
router.post('/purchases', createPurchase);
router.patch('/purchases/:id', updatePurchase);
router.delete('/purchases/:id', deletePurchase);
router.get('/purchases/:id/receipt', receipt);
router.get('/purchases/:id', getPurchase);
router.get('/payments', listPayments);
router.post('/payments', createPayment);
router.patch('/payments/:id', updatePayment);
router.delete('/payments/:id', deletePayment);

export default router;
