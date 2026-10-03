export const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: '₱' },
    { value: 'bank transfer', label: 'Bank Transfer', icon: '⇄' },
    { value: 'gcash', label: 'GCash', icon: 'G' },
    { value: 'others', label: 'Others', icon: '•••' }
];

export function paymentMethodCardsMarkup(selected = 'cash') {
    return `<fieldset class="field payment-choice-field"><legend>Payment method</legend><div class="payment-method-cards payment-choice-cards">${paymentMethods.map((method) => `<label class="payment-method-card payment-choice-card"><input type="radio" name="paymentMethod" value="${method.value}" ${selected === method.value ? 'checked' : ''} required><span class="payment-method-art payment-method-art-${method.value.replace(' ', '-') }" aria-hidden="true">${method.icon}</span><span class="payment-method-name">${method.label}</span></label>`).join('')}</div></fieldset>`;
}

export function summarizePaymentMethods(payments) {
    const methods = [
        { key: 'cash', title: 'Cash', mark: '₱', total: 0, count: 0 },
        { key: 'gcash', title: 'GCash', mark: 'G', total: 0, count: 0 },
        { key: 'bankTransfer', title: 'Bank Transfer', mark: '⇄', total: 0, count: 0 },
        { key: 'others', title: 'Others', mark: '•••', total: 0, count: 0 }
    ];
    for (const payment of payments) {
        const method = String(payment.paymentMethod || '').trim().toLowerCase();
        const category = method === 'cash' ? methods[0]
            : method.includes('gcash') ? methods[1]
                : method.includes('bank transfer') ? methods[2] : methods[3];
        category.total += Number(payment.amount || 0);
        category.count += 1;
    }
    return methods;
}

export const payments = {
    title: 'Payments',
    description: 'Apply customer payments to outstanding purchase balances.',
    columns: [['id', 'Payment ID'], ['purchaseId', 'Transaction ID'], ['customerName', 'Customer'], ['amount', 'Amount Paid'], ['paymentMethod', 'Payment Method'], ['paymentDate', 'Payment Date'], ['processedBy', 'Processed By'], ['notes', 'Remarks']],
    async fields({ state, fieldMarkup, optionList }) {
        const duePurchases = state.records.purchases.filter((purchase) => Number(purchase.balanceAmount) > 0).map((purchase) => ({
            ...purchase,
            paymentLabel: `${purchase.customerName} · ${purchase.purchaseDate} · due ${Number(purchase.balanceAmount).toFixed(2)}`
        }));
        return `<div class="field"><label>Purchase</label><select name="purchaseId" required>${optionList(duePurchases, 'id', 'paymentLabel')}</select></div>
            ${fieldMarkup(['amount', 'Amount received', 'number', true])}
            ${fieldMarkup(['paymentDate', 'Payment date', 'date', true], new Date().toISOString().slice(0, 10))}
            ${paymentMethodCardsMarkup()}
            ${fieldMarkup(['notes', 'Notes', 'textarea'])}`;
    },
    async save({ apiFetch }, formData) {
        const purchaseId = formData.get('purchaseId');
        const amount = Number(formData.get('amount'));
        await apiFetch('/payments', { method: 'POST', body: JSON.stringify({ purchaseId, amount, paymentDate: formData.get('paymentDate'), paymentMethod: String(formData.get('paymentMethod') || ''), notes: String(formData.get('notes') || '').trim() }) });
    }
};
