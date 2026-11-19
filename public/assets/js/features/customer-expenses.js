export function filterRecordsByDateRange(records, dateField, from = '', to = '') {
    return records.filter((record) => {
        const date = String(record[dateField] || '').slice(0, 10);
        return (!from || date >= from) && (!to || date <= to);
    });
}

export function customerExpenseSummary(purchases, payments, expenses) {
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
        + expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const unpaid = purchases.reduce((sum, purchase) => sum + purchaseUnpaidAmount(purchase), 0);
    return { paid, unpaid, totalExpenses: paid };
}

export function purchaseUnpaidAmount(purchase) {
    const total = Number(purchase.totalAmount || 0);
    const paid = Number(purchase.amountPaid || 0);
    return Math.max(0, total - paid);
}

function latestPayment(payments) {
    return [...payments].sort((left, right) => String(left.paymentDate || '').localeCompare(String(right.paymentDate || ''))).pop();
}

export function customerExpenseEntries(purchases, payments, expenses) {
    const purchasesById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
    const paymentsByPurchase = new Map();
    for (const payment of payments) {
        const key = payment.purchaseId || `unlinked:${payment.id}`;
        const group = paymentsByPurchase.get(key) || [];
        group.push(payment);
        paymentsByPurchase.set(key, group);
    }

    const transactionEntries = purchases.map((purchase) => {
        const amountPaid = Number(purchase.amountPaid || 0);
        const unpaid = purchaseUnpaidAmount(purchase);
        const linkedPayments = paymentsByPurchase.get(purchase.id) || [];
        const finalPayment = latestPayment(linkedPayments);
        const fullyPaid = unpaid === 0 && amountPaid > 0;
        const paymentMethods = [...new Set(linkedPayments.map((payment) => payment.paymentMethod).filter(Boolean))];
        return {
            id: `purchase:${purchase.id}`,
            sourceId: purchase.id,
            sourceType: fullyPaid ? 'payment' : 'purchase',
            date: finalPayment?.paymentDate || purchase.purchaseDate,
            title: (purchase.items || []).map((item) => `${item.productName} × ${item.quantity}`).join(', ') || (fullyPaid ? 'Paid purchase' : 'Purchase'),
            detail: fullyPaid ? paymentMethods.join(', ') || 'Fully paid transaction' : 'Purchase transaction',
            paid: amountPaid,
            unpaid,
            status: fullyPaid ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid'
        };
    });

    const unlinkedPaymentEntries = [...paymentsByPurchase.entries()]
        .filter(([purchaseId]) => !purchasesById.has(purchaseId) && !String(purchaseId).startsWith('unlinked:'))
        .map(([purchaseId, group]) => {
            const finalPayment = latestPayment(group);
            return {
                id: `payment:${purchaseId}`,
                sourceId: purchaseId,
                sourceType: 'payment',
                date: finalPayment?.paymentDate,
                title: group.map((payment) => payment.notes).filter(Boolean).pop() || 'Payment',
                detail: [...new Set(group.map((payment) => payment.paymentMethod).filter(Boolean))].join(', ') || 'Payment',
                paid: group.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
                unpaid: 0,
                status: 'paid'
            };
        });
    const standalonePaymentEntries = payments
        .filter((payment) => !payment.purchaseId && !purchasesById.has(payment.purchaseId))
        .map((payment) => ({
            id: `payment:${payment.id}`,
            sourceId: payment.id,
            sourceType: 'payment',
            date: payment.paymentDate,
            title: payment.notes || 'Payment',
            detail: payment.paymentMethod || 'Payment',
            paid: Number(payment.amount || 0),
            unpaid: 0,
            status: 'paid'
        }));
    const manualExpenseEntries = expenses.map((expense) => ({
        ...expense,
        id: `expense:${expense.id}`,
        sourceId: expense.id,
        sourceType: 'expense',
        date: expense.expenseDate,
        title: expense.title,
        detail: [expense.category, expense.description].filter(Boolean).join(' · '),
        paid: Number(expense.amount || 0),
        unpaid: 0,
        status: 'paid'
    }));
    return [...transactionEntries, ...unlinkedPaymentEntries, ...standalonePaymentEntries, ...manualExpenseEntries]
        .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

export function monthlyPaidExpenseTotals(payments, expenses, range) {
    const totals = new Map(range.map((month) => [month.key, 0]));
    for (const record of [...payments, ...expenses]) {
        const date = record.paymentDate || record.expenseDate;
        const key = String(date || '').slice(0, 7);
        if (totals.has(key)) totals.set(key, totals.get(key) + Number(record.amount || 0));
    }
    return range.map((month) => totals.get(month.key));
}
