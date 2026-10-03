export const customers = {
    title: 'Customers',
    description: 'Keep customer details and contact information together.',
    columns: [['customerName', 'Name'], ['contactNumber', 'Contact'], ['email', 'Email'], ['createdAt', 'Added']],
    fields: [['customerName', 'Customer name', 'text', true], ['contactNumber', 'Contact number', 'tel'], ['email', 'Email', 'email'], ['address', 'Address', 'textarea']],
    toPayload(formData) {
        return Object.fromEntries(formData.entries());
    }
};