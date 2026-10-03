export const purchases = {
    title: 'Purchase Transactions',
    description: 'Track customer purchases, balances, and stock changes.',
    columns: [['id', 'ID'], ['customerName', 'Customer'], ['processedBy', 'Processed By'], ['totalAmount', 'Total Amount'], ['amountPaid', 'Amount Paid'], ['balanceAmount', 'Balance'], ['paymentStatus', 'Status'], ['purchaseDate', 'Purchase Date']],
    async fields({ state, fieldMarkup, optionList, purchaseLineMarkup }) {
        return `<div class="field"><label for="purchase-customer">Customer</label><select id="purchase-customer" name="customerId" required>${optionList(state.records.customers, 'id', 'customerName', '', 'Select customer')}</select></div>
            ${fieldMarkup(['purchaseDate', 'Purchase date', 'date', true], new Date().toISOString().slice(0, 10))}
            <div class="field"><span class="field-label">Purchase items</span><div class="purchase-line-header"><span>Product / service</span><span>Quantity</span><span></span></div><div data-line-items>${purchaseLineMarkup()}</div><button class="small-button" type="button" data-action="add-line">Add another item</button></div>
            ${fieldMarkup(['remarks', 'Remarks', 'textarea'])}`;
    },
    async save({ apiFetch, state }, formData) {
        const customerId = formData.get('customerId');
        const productIds = formData.getAll('productId');
        const quantities = formData.getAll('quantity');
        const customer = state.records.customers.find((item) => item.id === customerId);
        const items = productIds.map((productId, index) => ({ productId, quantity: Number(quantities[index]) }));
        if (!customer || !items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error('Choose a customer and valid item quantities.');
        await apiFetch('/purchases', { method: 'POST', body: JSON.stringify({ customerId, purchaseDate: formData.get('purchaseDate'), remarks: String(formData.get('remarks') || '').trim(), items }) });
    }
};