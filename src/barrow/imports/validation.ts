export type AccountValue = {
  name: string;
  email: string;
  pierCustomerId: string;
  termsDays: number;
  minimumCents: number;
  prices: { sku: string; unitCents: number; minQty: number }[];
  city?: string;
  state?: string;
  lifecycle?: 'active' | 'on-hold' | 'closed';
  channel?: string;
  territory?: string;
  assignedRep?: string;
  catalogs?: string[];
  providerReferences?: Record<string, string>;
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
  const keys = ['name', 'email', 'pierCustomerId', 'termsDays', 'minimumCents', 'prices'], optional = ['city', 'state', 'lifecycle', 'channel', 'territory', 'assignedRep', 'catalogs', 'providerReferences'];
  if (Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key)) || keys.some(key => !(key in value)))
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
  // The stockist's town, shown beside its name ("Columbia, SC"); both parts are optional.
  const town = Object.fromEntries(['city', 'state', 'channel', 'territory', 'assignedRep'].filter(key => value[key] !== undefined).map(key => [key, boundedText(value[key], key, key === 'state' ? 40 : key === 'assignedRep' ? 160 : 80)]));
  const profile: Partial<AccountValue> = {};
  if (value.lifecycle !== undefined) {
    if (!['active', 'on-hold', 'closed'].includes(value.lifecycle as string)) importError('ACCOUNT_LIFECYCLE', 'lifecycle must be active, on-hold or closed.');
    profile.lifecycle = value.lifecycle as AccountValue['lifecycle'];
  }
  if (value.catalogs !== undefined) {
    if (!Array.isArray(value.catalogs) || value.catalogs.length > 100) importError('ACCOUNT_CATALOGS', 'Supply at most 100 catalog identifiers.');
    profile.catalogs = value.catalogs.map(item => boundedText(item, 'catalog', 100));
    if (new Set(profile.catalogs).size !== profile.catalogs.length) importError('ACCOUNT_CATALOGS', 'Catalog identifiers must be unique.');
  }
  if (value.providerReferences !== undefined) {
    if (!value.providerReferences || typeof value.providerReferences !== 'object' || Array.isArray(value.providerReferences) || Object.keys(value.providerReferences).length > 30) importError('ACCOUNT_REFERENCES', 'Supply an object with at most 30 provider references.');
    profile.providerReferences = Object.fromEntries(Object.entries(value.providerReferences).map(([key, reference]) => [stableId(key, 'provider'), boundedText(reference, 'provider reference')]));
  }
  return { name, email, pierCustomerId, termsDays, minimumCents, prices, ...town, ...profile };
}
