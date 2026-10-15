export type AccountValue = {
  name: string;
  email: string;
  pierCustomerId: string;
  termsDays: number;
  minimumCents: number;
  prices: { sku: string; unitCents: number; minQty: number }[];
};

export function importError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

export function boundedText(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value))
    importError('ACCOUNT_FIELD', `${field} must be nonempty, trimmed text of at most ${max} characters.`);
  return value;
}

export function stableId(value: unknown, field = 'accountId'): string {
  const result = boundedText(value, field, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result))
    importError('ACCOUNT_ID', `${field} must be a stable source identifier using letters, digits, dot, underscore, colon or dash.`);
  return result;
}

export function nonnegativeInteger(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    importError('ACCOUNT_NUMBER', `${field} must be a safe integer of at least ${minimum}.`);
  return value;
}

export function validateAccountValue(input: unknown): AccountValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) importError('ACCOUNT_VALUE', 'Supply an account object.');
  const value = input as Record<string, unknown>;
  const keys = ['name', 'email', 'pierCustomerId', 'termsDays', 'minimumCents', 'prices'];
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value)))
    importError('ACCOUNT_VALUE', 'Use exactly the documented account fields.');
  const name = boundedText(value.name, 'name');
  const email = boundedText(value.email, 'email', 254);
  if (email !== email.toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    importError('ACCOUNT_EMAIL', 'email must be a lowercase email address.');
  const pierCustomerId = stableId(value.pierCustomerId, 'pierCustomerId');
  const termsDays = nonnegativeInteger(value.termsDays, 'termsDays');
  if (termsDays > 365) importError('ACCOUNT_NUMBER', 'termsDays must be at most 365.');
  const minimumCents = nonnegativeInteger(value.minimumCents, 'minimumCents');
  if (!Array.isArray(value.prices) || value.prices.length > 200) importError('ACCOUNT_PRICES', 'Supply at most 200 prices per account.');
  const seen = new Set<string>();
  const prices = value.prices.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) importError('ACCOUNT_PRICE', 'Every price must be an object.');
    const price = entry as Record<string, unknown>;
    if (Object.keys(price).length !== 3 || !['sku', 'unitCents', 'minQty'].every(key => key in price))
      importError('ACCOUNT_PRICE', 'Each price requires exactly sku, unitCents and minQty.');
    const sku = boundedText(price.sku, 'sku', 100);
    if (seen.has(sku)) importError('ACCOUNT_PRICE_DUPLICATE', 'Each account may have only one price per SKU.');
    seen.add(sku);
    return { sku, unitCents: nonnegativeInteger(price.unitCents, 'unitCents'), minQty: nonnegativeInteger(price.minQty, 'minQty', 1) };
  });
  return { name, email, pierCustomerId, termsDays, minimumCents, prices };
}
