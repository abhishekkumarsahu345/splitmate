export interface Payment {
  from: string;
  to: string;
  amountInPaisa: number;
}

/**
 * Greedy creditor-debtor matching algorithm.
 * Produces minimum set of directed payments to zero all balances.
 * Input: balances object where positive = owed money, negative = owes money.
 * Sum of all values must be 0 (guaranteed if computed correctly).
 */
export function simplifyDebts(balances: Record<string, number>): Payment[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, balance] of Object.entries(balances)) {
    if (balance > 0) creditors.push({ id, amount: balance });
    if (balance < 0) debtors.push({ id, amount: -balance }); // store positive
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const payments: Payment[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const settle = Math.min(creditors[ci].amount, debtors[di].amount);
    payments.push({ from: debtors[di].id, to: creditors[ci].id, amountInPaisa: settle });
    creditors[ci].amount -= settle;
    debtors[di].amount -= settle;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }

  return payments;
}
