import { z } from 'zod';

export const idSchema = z.object({ id: z.string().min(1) });
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');
export const phoneNumberSchema = z.string().trim().max(50).regex(/^\d*$/, 'Phone number must contain digits only.').optional().default('');
export const customerSchema = z.object({ customerName: z.string().trim().min(1).max(150), contactNumber: phoneNumberSchema, email: z.string().trim().email().or(z.literal('')).optional().default(''), address: z.string().trim().max(500).optional().default('') });
export const customerProfileSchema = z.object({ fullName: z.string().trim().min(1).max(150), contactNumber: phoneNumberSchema, address: z.string().trim().max(500).optional().default(''), avatarId: z.enum(['mint', 'ocean', 'coral', 'sunshine', 'forest', 'berry']).optional().default('mint') }).strict();
export const customerProvisionSchema = z.object({ mobileNumber: phoneNumberSchema }).passthrough();
export const productSchema = z.object({ productName: z.string().trim().min(1).max(150), category: z.string().trim().max(100).optional().default(''), description: z.string().trim().max(1000).optional().default(''), type: z.enum(['product', 'service']), price: z.coerce.number().finite().min(0), stockQuantity: z.coerce.number().int().min(0), status: z.enum(['active', 'inactive']) });
export const customerPlanSchema = z.object({ planName: z.string().trim().min(1).max(150), planDate: dateSchema, budget: z.coerce.number().finite().min(0), state: z.enum(['active', 'inactive']).optional().default('active'), items: z.array(z.object({ itemName: z.string().trim().min(1).max(150), quantity: z.coerce.number().int().positive(), estimatedPrice: z.coerce.number().finite().min(0) }).strict()).min(1).max(50) }).strict();
export const customerPlanStateSchema = z.object({ state: z.enum(['active', 'inactive']) }).strict();
export const customerProductStatusSchema = z.object({ status: z.enum(['active', 'inactive']) }).strict();
export const expenseSchema = z.object({ title: z.string().trim().min(1).max(150), category: z.string().trim().min(1).max(100), amount: z.coerce.number().finite().positive(), expenseDate: dateSchema, paymentMethod: z.string().trim().max(50).optional().default(''), description: z.string().trim().max(1000).optional().default('') });
export const purchaseSchema = z.object({ customerId: z.string().min(1), purchaseDate: dateSchema, remarks: z.string().trim().max(1000).optional().default(''), items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive(), actualSubtotals: z.array(z.coerce.number().finite().min(0)).optional() })).min(1) });
export const customerPurchaseUpdateSchema = purchaseSchema.partial().extend({ actualItems: z.array(z.object({ itemIndex: z.coerce.number().int().nonnegative(), actualSubtotals: z.array(z.coerce.number().finite().min(0)) }).strict()).optional() }).strict();
export const paymentSchema = z.object({ purchaseId: z.string().min(1), amount: z.coerce.number().finite().positive(), paymentDate: dateSchema, paymentMethod: z.string().trim().max(50).optional().default(''), notes: z.string().trim().max(1000).optional().default('') });
export const managedUserSchema = z.object({ fullName: z.string().trim().min(1).max(150), email: z.string().email(), password: z.string().min(6), role: z.enum(['staff', 'admin']) });
export const roleSchema = z.object({ role: z.enum(['staff', 'admin']), status: z.enum(['active', 'inactive']).optional() });

export function parse(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success) {
        const error = new Error(result.error.issues.map((issue) => issue.message).join('; '));
        error.status = 400;
        throw error;
    }
    return result.data;
}
