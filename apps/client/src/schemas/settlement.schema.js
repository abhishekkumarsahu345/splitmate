import { z } from 'zod'

export const createSettlementSchema = z.object({
  payerId: z.string().min(1, 'Payer is required'),
  payeeId: z.string().min(1, 'Payee is required'),
  amountInPaisa: z.number().int().min(1, 'Amount must be positive'),
})

// Form-friendly version: payerId is locked to current user (not in the form),
// amount is a string (rupees) that gets validated and converted on submit.
export const settlementFormSchema = z.object({
  payeeId: z.string().min(1, 'Please select who you are paying'),
  amountInPaisa: z
    .string()
    .min(1, 'Amount is required')
    .refine(
      (v) => {
        const n = parseFloat(v)
        return !isNaN(n) && n > 0
      },
      { message: 'Amount must be greater than ₹0' },
    ),
})
