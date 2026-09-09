/**
 * Splits amountInPaisa equally among memberIds using integer division.
 * Remainder (r = amount % n) is distributed 1 unit at a time to the first r members
 * sorted ascending by userId string — guaranteeing deterministic, lossless splitting.
 *
 * @throws Error if amountInPaisa is negative or non-integer
 * @throws Error if memberIds is empty
 */
export function splitEqually(
  amountInPaisa: number,
  memberIds: string[],
): Record<string, number> {
  if (!Number.isInteger(amountInPaisa) || amountInPaisa < 0) {
    throw new Error(
      `amountInPaisa must be a non-negative integer; received ${amountInPaisa}`,
    );
  }
  if (!memberIds || memberIds.length === 0) {
    throw new Error('memberIds must be a non-empty array');
  }

  const sorted = [...memberIds].sort();
  const base = Math.floor(amountInPaisa / sorted.length);
  const remainder = amountInPaisa % sorted.length;

  const result: Record<string, number> = {};
  sorted.forEach((id, index) => {
    result[id] = base + (index < remainder ? 1 : 0);
  });
  return result;
}
