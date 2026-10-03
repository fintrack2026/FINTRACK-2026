import { collectionRows } from '../services/firestore.js';
import { summarizePayments } from '../services/reporting.js';
import { summarizeCustomerMonitoring } from '../services/customer-account.js';

export async function dashboard(req, res, next) {
    try {
        const [customers, purchases, expenses, users] = await Promise.all(['customers', 'purchases', 'expenses', 'users'].map((name) => collectionRows(name)));
        const customerMonitoring = summarizeCustomerMonitoring(users, customers);
        res.json({ ...customerMonitoring, purchases: purchases.length, sales: purchases.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0), receivables: purchases.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0), expenses: expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0) });
    } catch (error) { next(error); }
}

export async function reports(req, res, next) {
    try {
        const from = String(req.query.from || '');
        const to = String(req.query.to || '');
        const [purchases, expenses, payments] = await Promise.all([collectionRows('purchases'), collectionRows('expenses'), collectionRows('payments')]);
        const inRange = (value) => (!from || String(value || '') >= from) && (!to || String(value || '') <= to);
        const filteredPurchases = purchases.filter((row) => inRange(row.purchaseDate));
        const filteredExpenses = expenses.filter((row) => inRange(row.expenseDate));
        const filteredPayments = payments.filter((row) => inRange(row.paymentDate));
        const sales = filteredPurchases.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
        const expenseTotal = filteredExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        res.json({ purchases: filteredPurchases, expenses: filteredExpenses, sales, expenseTotal, paid: filteredPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0), paymentMethods: summarizePayments(filteredPayments), outstanding: filteredPurchases.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0), net: sales - expenseTotal });
    } catch (error) { next(error); }
}