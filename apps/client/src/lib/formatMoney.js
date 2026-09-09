/**
 * Converts an integer paisa amount to a display string.
 * e.g. 150025 → "₹1,500.25"
 * Handles negative balances for display.
 */
export function formatMoney(paisa) {
  if (typeof paisa !== 'number' || isNaN(paisa)) return '₹0.00'
  const absValue = Math.abs(paisa) / 100
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue)
  return paisa < 0 ? `-${formatted}` : formatted
}
