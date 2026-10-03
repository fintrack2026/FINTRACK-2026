import { collectionRows, documentData, firestore, timestamp } from '../services/firestore.js';
import { idSchema, parse, purchaseSchema } from '../services/validation.js';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { readFileSync } from 'node:fs';

const fintrackLogoSvg = readFileSync(new URL('../../public/images/fintrack-mark.svg', import.meta.url), 'utf8');

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export function customerOwnsContact(userId, contact) {
    return Boolean(userId && contact?.userId === userId);
}

export async function purchaseWithProcessorName(purchase, fallbackName = '') {
    if (purchase.processedBy) return purchase;
    if (!purchase.userId) return { ...purchase, processedBy: fallbackName || '—' };
    const profile = await firestore.collection('users').doc(purchase.userId).get();
    return { ...purchase, processedBy: profile.data()?.fullName || profile.data()?.email || fallbackName || '—' };
}

export function purchaseReceiptPdf(purchase) {
    return new Promise((resolve, reject) => {
        const items = purchase.items || [];
        const itemHeight = items.reduce((height, item) => {
            const nameHeight = Math.max(31, Math.ceil(String(item.productName || 'Item').length / 32) * 14 + 16);
            const includedHeight = (item.includedItems || []).reduce((total, included) => total + Math.max(25, Math.ceil(String(included.itemName || 'Item').length / 34) * 12 + 13), 12);
            return height + nameHeight + ((item.includedItems || []).length ? includedHeight : 0);
        }, 0);
        const remarksHeight = purchase.remarks ? Math.ceil(String(purchase.remarks).length / 34) * 11 + 22 : 0;
        const pageHeight = Math.max(460, 430 + itemHeight + remarksHeight);
        const document = new PDFDocument({ size: [226.77, pageHeight], margin: 18 });
        const chunks = [];
        document.on('data', (chunk) => chunks.push(chunk));
        document.on('end', () => resolve(Buffer.concat(chunks)));
        document.on('error', reject);

        const left = document.page.margins.left;
        const contentWidth = document.page.width - left - document.page.margins.right;
        const formatAmount = (value) => `PHP ${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
        const centerX = document.page.width / 2;
        document.roundedRect(centerX - 24, 18, 48, 40, 7).fill('#142238');
        SVGtoPDF(document, fintrackLogoSvg, centerX - 19, 22, { width: 38, height: 32, preserveAspectRatio: 'xMidYMid meet' });
        document.font('Helvetica-Bold').fontSize(16).fillColor('#142238').text('FINTRACK', left, 66, { width: contentWidth, align: 'center' });
        document.font('Helvetica').fontSize(8).fillColor('#667586').text('PURCHASE RECEIPT', left, 85, { width: contentWidth, align: 'center', characterSpacing: 1.2 });
        document.moveTo(left, 103).lineTo(left + contentWidth, 103).dash(2, { space: 3 }).strokeColor('#8492a3').stroke().undash();

        let y = 116;
        document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('RECEIPT NO.', left, y);
        document.font('Helvetica').fontSize(8).fillColor('#263445').text(String(purchase.id || '—').slice(0, 22), left + 62, y, { width: contentWidth - 62, align: 'right' });
        y += 15;
        document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('DATE', left, y);
        document.font('Helvetica').fontSize(8).fillColor('#263445').text(purchase.purchaseDate || '—', left + 62, y, { width: contentWidth - 62, align: 'right' });
        y += 23;
        document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('CUSTOMER', left, y);
        y += 12;
        document.font('Helvetica').fontSize(9).fillColor('#263445').text(purchase.customerName || '—', left, y, { width: contentWidth });
        y += Math.max(15, document.heightOfString(purchase.customerName || '—', { width: contentWidth, font: 'Helvetica', fontSize: 9 })) + 6;
        document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('PROCESSED BY', left, y);
        y += 12;
        const processor = purchase.processedBy || '—';
        document.font('Helvetica-Bold').fontSize(10).fillColor('#142238').text(processor, left, y, { width: contentWidth });
        y += Math.max(16, document.heightOfString(processor, { width: contentWidth, font: 'Helvetica-Bold', fontSize: 10 })) + 10;
        document.moveTo(left, y).lineTo(left + contentWidth, y).dash(2, { space: 3 }).strokeColor('#8492a3').stroke().undash();
        y += 12;

        document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('ITEM', left, y);
        document.text('AMOUNT', left, y, { width: contentWidth, align: 'right' });
        y += 15;
        for (const item of items) {
            const name = String(item.productName || 'Item');
            const itemHeight = document.heightOfString(name, { width: contentWidth, font: 'Helvetica', fontSize: 9 });
            document.font('Helvetica').fontSize(9).fillColor('#263445').text(name, left, y, { width: contentWidth });
            document.font('Helvetica-Bold').fontSize(9).fillColor('#263445').text(formatAmount(item.subtotal), left, y, { width: contentWidth, align: 'right' });
            y += Math.max(14, itemHeight) + 2;
            document.font('Helvetica').fontSize(8).fillColor('#667586').text(`${Number(item.quantity)} x ${formatAmount(item.price)}`, left, y);
            y += 15;
            if (item.includedItems?.length) {
                document.font('Helvetica-Bold').fontSize(7).fillColor('#667586').text('INCLUDED ITEMS', left + 5, y);
                y += 11;
                for (const included of item.includedItems) {
                    const includedName = String(included.itemName || 'Item');
                    const quantity = (Number(included.quantity) || 0) * (Number(item.quantity) || 1);
                    const unitPrice = Number(included.estimatedPrice ?? included.price ?? 0);
                    const subtotal = Number(included.actualSubtotal ?? included.subtotal ?? unitPrice * Number(included.quantity || 0)) * (Number(item.quantity) || 1);
                    const estimatedSubtotal = Number(included.estimatedSubtotal ?? included.subtotal ?? unitPrice * Number(included.quantity || 0)) * (Number(item.quantity) || 1);
                    const nameWidth = contentWidth - 66;
                    const includedNameHeight = document.heightOfString(includedName, { width: nameWidth, font: 'Helvetica', fontSize: 8 });
                    document.font('Helvetica').fontSize(8).fillColor('#263445').text(includedName, left + 5, y, { width: nameWidth });
                    document.font('Helvetica-Bold').fontSize(8).fillColor('#263445').text(formatAmount(subtotal), left + contentWidth - 60, y, { width: 60, align: 'right' });
                    document.font('Helvetica').fontSize(7).fillColor('#667586').text(`Estimated ${formatAmount(estimatedSubtotal)}  ·  Actual ${formatAmount(subtotal)}  ·  ${quantity} x ${formatAmount(unitPrice)}`, left + 5, y + Math.max(10, includedNameHeight));
                    y += Math.max(25, includedNameHeight + 13);
                }
                y += 3;
            }
        }

        document.moveTo(left, y).lineTo(left + contentWidth, y).dash(2, { space: 3 }).strokeColor('#8492a3').stroke().undash();
        y += 14;
        document.font('Helvetica').fontSize(9).fillColor('#526274').text('TOTAL', left, y);
        document.font('Helvetica-Bold').fontSize(12).fillColor('#142238').text(formatAmount(purchase.totalAmount), left, y - 2, { width: contentWidth, align: 'right' });
        y += 19;
        document.font('Helvetica').fontSize(8).fillColor('#526274').text('Amount paid', left, y);
        document.text(formatAmount(purchase.amountPaid), left, y, { width: contentWidth, align: 'right' });
        y += 14;
        document.font('Helvetica').fontSize(8).fillColor('#526274').text('Balance due', left, y);
        document.text(formatAmount(purchase.balanceAmount), left, y, { width: contentWidth, align: 'right' });
        y += 22;
        document.font('Helvetica-Bold').fontSize(8).fillColor('#142238').text(String(purchase.paymentStatus || 'unpaid').toUpperCase(), left, y, { width: contentWidth, align: 'center' });
        if (purchase.remarks) {
            y += 18;
            document.moveTo(left, y).lineTo(left + contentWidth, y).dash(2, { space: 3 }).strokeColor('#8492a3').stroke().undash();
            y += 10;
            document.font('Helvetica-Bold').fontSize(8).fillColor('#667586').text('NOTE', left, y);
            y += 12;
            document.font('Helvetica').fontSize(8).fillColor('#263445').text(String(purchase.remarks), left, y, { width: contentWidth });
            y += document.heightOfString(String(purchase.remarks), { width: contentWidth, font: 'Helvetica', fontSize: 8 }) + 8;
        }
        y += 8;
        document.moveTo(left, y).lineTo(left + contentWidth, y).dash(2, { space: 3 }).strokeColor('#8492a3').stroke().undash();
        y += 15;
        document.font('Helvetica').fontSize(8).fillColor('#526274').text('Thank you for your purchase!', left, y, { width: contentWidth, align: 'center' });
        y += 13;
        document.fontSize(7).fillColor('#8592a0').text('Please keep this receipt for your records.', left, y, { width: contentWidth, align: 'center' });
        document.end();
    });
}

export async function createPurchase(req, res, next) {
    try {
        const data = parse(purchaseSchema, req.body);
        const customerId = data.customerId;
        if (!customerId) fail('Customer profile is not ready.', 409);
        const purchaseReference = firestore.collection('purchases').doc();
        let customerName;
        if (req.profile.role === 'customer' && customerId !== req.profile.customerId) {
            const contactSnapshot = await firestore.collection('customerContacts').doc(customerId).get();
            if (!contactSnapshot.exists || !customerOwnsContact(req.user.uid, contactSnapshot.data())) fail('Customer contact not found.', 404);
            customerName = contactSnapshot.data().customerName;
        } else {
            if (req.profile.role === 'customer' && !req.profile.customerId) fail('Customer profile is not ready.', 409);
            const customerSnapshot = await firestore.collection('customers').doc(customerId).get();
            if (!customerSnapshot.exists) fail('Customer record not found.', 404);
            if (req.profile.role === 'customer' && customerSnapshot.data().accountId !== req.user.uid) fail('Customer profile is not valid.', 403);
            customerName = customerSnapshot.data().customerName;
        }
        const purchase = await firestore.runTransaction(async (transaction) => {
            const quantitiesByProduct = new Map();
            for (const requested of data.items) {
                quantitiesByProduct.set(requested.productId, (quantitiesByProduct.get(requested.productId) || 0) + requested.quantity);
            }
            const products = [];
            for (const [productId, quantity] of quantitiesByProduct) {
                if (productId.startsWith('customer-product:')) {
                    if (req.profile.role !== 'customer') fail('Only customers can purchase their saved products.', 403);
                    const customerProductId = productId.slice('customer-product:'.length);
                    if (!customerProductId) fail('A selected product is invalid.');
                    const reference = firestore.collection('customerProducts').doc(customerProductId);
                    const snapshot = await transaction.get(reference);
                    if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('A selected product could not be found.', 404);
                    const product = snapshot.data();
                    if (product.status !== 'active') fail(`${product.productName} is inactive.`);
                    const stock = Number(product.stockQuantity || 0);
                    if (product.type === 'product' && stock < quantity) fail(`Not enough stock for ${product.productName}.`, 409);
                    products.push({ reference, product, quantity, stock, itemType: 'customer-product' });
                    continue;
                }
                if (productId.startsWith('plan:')) {
                    if (req.profile.role !== 'customer') fail('Only customers can select their purchase plans.', 403);
                    const planId = productId.slice('plan:'.length);
                    if (!planId) fail('A selected plan is invalid.');
                    const reference = firestore.collection('customerPlans').doc(planId);
                    const snapshot = await transaction.get(reference);
                    if (!snapshot.exists || snapshot.data().userId !== req.user.uid) fail('A selected plan could not be found.', 404);
                    const plan = snapshot.data();
                    if (plan.state === 'inactive') fail(`${plan.planName} is inactive.`);
                    const planItems = plan.items || [];
                    const legacyPlanMeta = /^FINTRACK_PLAN_V1\|([^|]+)\|([\d.]+)$/.exec(plan.description || '');
                    const descriptionBudget = /(?:budget|limit)\s*[:=\-]\s*(?:₱|PHP\s*)?([\d,]+(?:\.\d+)?)/i.exec(String(plan.description || ''));
                    const price = Number(plan.estimatedTotal ?? plan.totalPrice ?? planItems.reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0)), 0));
                    const storedBudget = Number(plan.budget);
                    const alternatePlanBudget = Number(plan.planBudget ?? plan.budgetAmount ?? plan.plannedBudget ?? plan.estimatedBudget ?? plan.spendingLimit ?? plan.totalBudget ?? plan.Budget);
                    const descriptionPlanBudget = descriptionBudget ? Number(descriptionBudget[1].replaceAll(',', '')) : undefined;
                    const planBudget = Number.isFinite(storedBudget) && storedBudget > 0 ? storedBudget : Number.isFinite(alternatePlanBudget) && alternatePlanBudget > 0 ? alternatePlanBudget : Number(legacyPlanMeta?.[2] ?? descriptionPlanBudget ?? storedBudget ?? 0);
                    products.push({ reference: null, planId, planBudget, product: { productName: plan.planName, price, type: 'plan' }, quantity, stock: 0, itemType: 'plan', planItems });
                    continue;
                }
                const reference = firestore.collection('products').doc(productId);
                const snapshot = await transaction.get(reference);
                if (!snapshot.exists) fail('A selected product no longer exists.', 404);
                const product = snapshot.data();
                if (product.status !== 'active') fail(`${product.productName} is inactive.`);
                const stock = Number(product.stockQuantity || 0);
                if (product.type === 'product' && stock < quantity) fail(`Not enough stock for ${product.productName}.`, 409);
                products.push({ reference, product, quantity, stock, itemType: product.type });
            }
            const items = [];
            let total = 0;
            for (const { reference, product, quantity, stock, planItems, itemType, planId, planBudget } of products) {
                const price = Number(product.price || 0);
                const requested = data.items.find((item) => item.productId === (planId ? `plan:${planId}` : reference?.id ? `customer-product:${reference.id}` : reference?.id));
                const estimatedTotal = planItems ? planItems.reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0)), 0) : price;
                const includedItems = planItems?.map((item, index) => {
                    const estimatedSubtotal = Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.estimatedPrice ?? item.price ?? 0));
                    return { ...item, estimatedSubtotal, actualSubtotal: Number(requested?.actualSubtotals?.[index] ?? estimatedSubtotal) };
                });
                const actualPlanTotal = includedItems?.reduce((sum, item) => sum + item.actualSubtotal, 0);
                const subtotal = (actualPlanTotal ?? price) * quantity;
                total += subtotal;
                items.push({ productId: reference?.id || planId || null, itemType: itemType || product.type, productName: product.productName, quantity, price: actualPlanTotal ?? price, subtotal, ...(planItems ? { estimatedTotal, planBudget, includedItems } : {}) });
                if (reference && product.type === 'product') transaction.update(reference, { stockQuantity: stock - quantity, updatedAt: timestamp() });
            }
            const value = { customerId, customerName, processedBy: req.profile.fullName || req.user.email || 'User', userId: req.user.uid, totalAmount: total, amountPaid: 0, balanceAmount: total, paymentStatus: total ? 'unpaid' : 'paid', purchaseDate: data.purchaseDate, remarks: data.remarks, items, createdAt: timestamp() };
            transaction.set(purchaseReference, value);
            return { id: purchaseReference.id, ...value };
        });
        res.status(201).json(purchase);
    } catch (error) { next(error); }
}

export async function listPurchases(req, res, next) {
    try { res.json(await collectionRows('purchases')); } catch (error) { next(error); }
}

export async function updatePurchase(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        const data = parse(purchaseSchema.pick({ purchaseDate: true, remarks: true }).partial().strict(), req.body);
        const reference = firestore.collection('purchases').doc(id);
        const snapshot = await reference.get();
        if (!snapshot.exists) fail('Purchase record not found.', 404);
        await reference.update({ ...data, updatedAt: timestamp() });
        res.json({ id, ...snapshot.data(), ...data });
    } catch (error) { next(error); }
}

export async function removePurchaseRecord(id) {
    const purchaseReference = firestore.collection('purchases').doc(id);
    await firestore.runTransaction(async (transaction) => {
        const purchaseSnapshot = await transaction.get(purchaseReference);
        if (!purchaseSnapshot.exists) fail('Purchase record not found.', 404);
        const payments = await transaction.get(firestore.collection('payments').where('purchaseId', '==', id));
        if (!payments.empty) fail('Delete linked payments before deleting this purchase.', 409);

        const quantities = new Map();
        for (const item of purchaseSnapshot.data().items || []) {
            quantities.set(item.productId, (quantities.get(item.productId) || 0) + Number(item.quantity || 0));
        }
        const stockChanges = [];
        for (const [productId, quantity] of quantities) {
            const productReference = firestore.collection('products').doc(productId);
            const productSnapshot = await transaction.get(productReference);
            if (!productSnapshot.exists) fail('A product in this purchase no longer exists.', 409);
            if (productSnapshot.data().type === 'product') {
                stockChanges.push({ reference: productReference, stockQuantity: Number(productSnapshot.data().stockQuantity || 0) + quantity });
            }
        }
        for (const change of stockChanges) transaction.update(change.reference, { stockQuantity: change.stockQuantity, updatedAt: timestamp() });
        transaction.delete(purchaseReference);
    });
}

export async function deletePurchase(req, res, next) {
    try {
        const { id } = parse(idSchema, req.params);
        await removePurchaseRecord(id);
        res.status(204).end();
    } catch (error) { next(error); }
}

export async function getPurchase(req, res, next) {
    try {
        const snapshot = await firestore.collection('purchases').doc(parse(idSchema, req.params).id).get();
        if (!snapshot.exists) fail('Purchase record not found.', 404);
        res.json(documentData(snapshot));
    } catch (error) { next(error); }
}

export async function receipt(req, res, next) {
    try {
        const snapshot = await firestore.collection('purchases').doc(parse(idSchema, req.params).id).get();
        if (!snapshot.exists) fail('Purchase record not found.', 404);
        const purchase = await purchaseWithProcessorName({ id: snapshot.id, ...snapshot.data() }, req.profile.fullName || req.user.email || '—');
        const pdf = await purchaseReceiptPdf(purchase);
        res.type('application/pdf').set('Content-Disposition', `inline; filename="purchase-${snapshot.id}.pdf"`).send(pdf);
    } catch (error) { next(error); }
}
