import { createRecordHandlers } from '../services/record-controller.js';
import { expenseSchema } from '../services/validation.js';

const handlers = createRecordHandlers({ collection: 'expenses', schema: expenseSchema });

export const listExpenses = handlers.list;
export const createExpense = handlers.create;
export const updateExpense = handlers.update;
export const deleteExpense = handlers.remove;