import { Schema, model } from 'mongoose';
import { IExpenseDocument } from './types';

const expenseSchema = new Schema<IExpenseDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'TRY' },
  baseCurrency: { type: String, index: true },
  amountBase: { type: Number, index: true },
  fxRate: { type: Number },
  fxAsOf: { type: Date },
  paymentMethod: String,
  description: String,
  date: { type: Date, required: true },
  receiptPhoto: String,
  vendor: String,
  notes: String,
}, {
  timestamps: true
});

// Compound indexes
expenseSchema.index({ userId: 1, petId: 1 });
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, category: 1 });
expenseSchema.index({ userId: 1, baseCurrency: 1 });

export const ExpenseModel = model<IExpenseDocument>('Expense', expenseSchema);