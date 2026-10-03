export const expenseCategories = [
    'Supplies',
    'Utilities',
    'Rent',
    'Transportation',
    'Food & Meals',
    'Salaries & Wages',
    'Equipment',
    'Maintenance & Repairs',
    'Marketing & Advertising',
    'Communication',
    'Taxes & Fees',
    'Other'
];

export const expenses = {
    title: 'Expenses',
    description: 'Record and review business expenses.',
    columns: [['title', 'Expense'], ['category', 'Category'], ['amount', 'Amount'], ['expenseDate', 'Date']],
    fields: [['title', 'Expense name', 'text', true], ['category', 'Category', 'text', true], ['amount', 'Amount', 'number', true], ['expenseDate', 'Expense date', 'date', true], ['paymentMethod', 'Payment method', 'select', false, ['cash', 'bank transfer', 'mobile wallet', 'other']], ['description', 'Description', 'textarea']],
    toPayload(formData) {
        const data = Object.fromEntries(formData.entries());
        data.amount = Number(data.amount || 0);
        return data;
    }
};