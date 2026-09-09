import { z } from 'zod'

const shareEntrySchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().nonnegative(),
})

export const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amountInPaisa: z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be greater than ₹0'),
  paidByUserId: z.string().min(1, 'Paid by is required'),
  date: z.string().min(1, 'Date is required'),
  splitType: z.enum(['EQUAL', 'EXACT']),
  memberIds: z.array(z.string()).optional(),
  shares: z.array(shareEntrySchema).optional(),
})

export const updateExpenseSchema = createExpenseSchema.partial()
