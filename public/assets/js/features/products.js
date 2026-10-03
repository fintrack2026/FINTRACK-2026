export const products = {
    title: 'Products & services',
    description: 'Manage your catalogue, prices, and stock levels.',
    columns: [['productName', 'Name'], ['category', 'Category'], ['type', 'Type'], ['price', 'Price'], ['stockQuantity', 'Stock'], ['status', 'Status']],
    fields: [['productName', 'Name', 'text', true], ['category', 'Category', 'text'], ['description', 'Description', 'textarea'], ['type', 'Type', 'select', true, ['product', 'service']], ['price', 'Price', 'number', true], ['stockQuantity', 'Stock quantity', 'number'], ['status', 'Status', 'select', true, ['active', 'inactive']]],
    toPayload(formData) {
        const data = Object.fromEntries(formData.entries());
        data.price = Number(data.price || 0);
        data.stockQuantity = Number(data.stockQuantity || 0);
        return data;
    }
};