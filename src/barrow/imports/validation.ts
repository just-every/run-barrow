import { firstValid } from '../quantity-rules';
import { validatePricing, type Pricing } from '../pricing';
import { quantityMicro, formatMicro, type UnitDefinition } from '../units';

export type AccountValue = {
  name: string;
  email: string;
  pierCustomerId: string;
  termsDays: number;
  minimumCents: number;
  prices: { sku: string; unitCents: number; minQty: number; casePack?: number; increment?: number; units?: UnitDefinition[]; pricing?: Pricing }[];
  city?: string;
  state?: string;
  lifecycle?: 'active' | 'on-hold' | 'closed';
  channel?: string;
  territory?: string;
  assignedRep?: string;
  catalogs?: string[];
  warehouses?: string[];
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

export function validatePriceUnits(input: unknown): UnitDefinition[] {
  if (!Array.isArray(input) || !input.length) importError('ACCOUNT_UNITS', 'Supply a nonempty array of unit definitions.');
  const seen = new Set<string>();
  return input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) importError('ACCOUNT_UNIT', 'Every unit definition must be an object.');
    const unit = entry as Record<string, unknown>;
    const keys = ['code', 'baseQuantity', 'unitCents', 'packContents'];
    if (Object.keys(unit).some(key => ![...keys, 'quantityKind', 'pricing'].includes(key)) || !keys.every(key => key in unit))
      importError('ACCOUNT_UNIT', 'Each unit requires exactly code, baseQuantity, unitCents and packContents.');
    if (unit.quantityKind !== undefined && !['whole', 'measured'].includes(unit.quantityKind as string)) importError('ACCOUNT_UNIT', 'quantityKind must be whole or measured.');
    const code = boundedText(unit.code, 'unit code', 32);
    if (!/^[A-Za-z0-9_-]+$/.test(code)) importError('ACCOUNT_UNIT', 'Unit codes use only ASCII letters, digits, dash or underscore.');
    if (seen.has(code)) importError('ACCOUNT_UNIT_DUPLICATE', 'Unit codes must be unique within each SKU.');
    seen.add(code);
    if (typeof unit.baseQuantity !== 'string') importError('ACCOUNT_UNIT', 'baseQuantity must be an exact decimal string.');
    quantityMicro(unit.baseQuantity);
    const unitCents = nonnegativeInteger(unit.unitCents, 'unitCents');
    if (unitCents > 1_000_000_000) importError('ACCOUNT_UNIT', 'Unit price must be at most 1000000000 cents.');
    return { ...('pricing' in unit ? {pricing:validatePricing(unit.pricing)}:{}), code, baseQuantity: formatMicro(quantityMicro(unit.baseQuantity)), unitCents, packContents: boundedText(unit.packContents, 'packContents', 160), ...(unit.quantityKind ? {quantityKind:unit.quantityKind as 'whole'|'measured'} : {}) };
  });
}

export function validateAccountValue(input: unknown): AccountValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) importError('ACCOUNT_VALUE', 'Supply an account object.');
  const value = input as Record<string, unknown>;
  const keys = ['name', 'email', 'pierCustomerId', 'termsDays', 'minimumCents', 'prices'], optional = ['city', 'state', 'lifecycle', 'channel', 'territory', 'assignedRep', 'catalogs', 'providerReferences', 'warehouses'];
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
    if (Object.keys(price).some(key => !['sku', 'unitCents', 'minQty', 'casePack', 'increment', 'units', 'pricing'].includes(key)) || !['sku', 'unitCents', 'minQty'].every(key => key in price))
      importError('ACCOUNT_PRICE', 'Each price requires sku, unitCents and minQty, with optional casePack, increment and units.');
    const sku = boundedText(price.sku, 'sku', 100);
    if (seen.has(sku)) importError('ACCOUNT_PRICE_DUPLICATE', 'Each account may have only one price per SKU.');
    seen.add(sku);
    // PRI-003: case packs and increments count whole base units; a rule set must allow at least one quantity.
    const rules = Object.fromEntries((['casePack', 'increment'] as const).filter(key => price[key] !== undefined).map(key => [key, nonnegativeInteger(price[key], key, 1)]));
    if (Object.values(rules).some(value => value > 10000)) importError('ACCOUNT_PRICE_RULE', 'casePack and increment must be at most 10000 base units.');
    const minQty = nonnegativeInteger(price.minQty, 'minQty', 1);
    if (firstValid({ minQty, ...rules }) === undefined) importError('ACCOUNT_PRICE_RULE', `${sku}: no quantity satisfies this minimum, case pack and increment together.`);
    return { ...('pricing' in price ? {pricing:validatePricing(price.pricing)}:{}), sku, unitCents: nonnegativeInteger(price.unitCents, 'unitCents'), minQty, ...rules, ...('units' in price ? { units: validatePriceUnits(price.units) } : {}) };
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
  // STK-002: the Pier warehouses whose stock Barrow promises to this account; absent or empty means every warehouse.
  if (value.warehouses !== undefined) {
    if (!Array.isArray(value.warehouses) || value.warehouses.length > 50) importError('ACCOUNT_WAREHOUSES', 'Supply at most 50 warehouse names.');
    const warehouses = value.warehouses.map(item => boundedText(item, 'warehouse', 100));
    if (new Set(warehouses).size !== warehouses.length) importError('ACCOUNT_WAREHOUSES', 'Warehouse names must be unique.');
    if (warehouses.length) profile.warehouses = warehouses;
  }
  if (value.providerReferences !== undefined) {
    if (!value.providerReferences || typeof value.providerReferences !== 'object' || Array.isArray(value.providerReferences) || Object.keys(value.providerReferences).length > 30) importError('ACCOUNT_REFERENCES', 'Supply an object with at most 30 provider references.');
    profile.providerReferences = Object.fromEntries(Object.entries(value.providerReferences).map(([key, reference]) => [stableId(key, 'provider'), boundedText(reference, 'provider reference')]));
  }
  return { name, email, pierCustomerId, termsDays, minimumCents, prices, ...town, ...profile };
}
