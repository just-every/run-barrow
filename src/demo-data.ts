// One compact supplier story, shared by the seed and the private Pier demo response.
export const demoPierOrigin = 'https://stock.demo.invalid'
export const demoProducts = [
  { sku: 'OAT-1', name: 'Toasted oat granola', unit: 'case', cents: 6500 },
  { sku: 'HNY-6', name: 'Wildflower honey · six jars', unit: 'case', cents: 4800 },
  { sku: 'CHAI-1', name: 'Spiced chai concentrate', unit: 'case', cents: 7200 },
  { sku: 'CIT-12', name: 'Blood orange soda · twelve bottles', unit: 'case', cents: 3600 },
  { sku: 'OLV-6', name: 'Cold pressed olive oil · six bottles', unit: 'case', cents: 9600 },
  { sku: 'JAM-6', name: 'Strawberry preserve · six jars', unit: 'case', cents: 4200 },
]
export const demoCustomers = [
  ['cedar', 'Cedar Street Pantry', 'Amelia Brooks'],
  ['banksia', 'Banksia General Store', 'Noah Williams'],
  ['riverbend', 'Riverbend Kitchen', 'Sophie Nguyen'],
  ['fern', 'Fern & Fig Grocer', 'Oliver Chen'],
  ['salt', 'Salt House Provisions', 'Isla Martin'],
  ['marlow', 'Marlow Corner Store', 'Ethan Patel'],
  ['sunroom', 'The Sunroom Café', 'Grace Wilson'],
  ['wattle', 'Wattle Creek Deli', 'Jack Thompson'],
  ['north', 'North End Market', 'Mia Robinson'],
  ['paperbark', 'Paperbark Pantry', 'Henry Clarke'],
  ['bloom', 'Bloom Wholefoods', 'Zoe Campbell'],
  ['sunday', 'Sunday Table', 'Leo Anderson'],
]
export const demoItemId = (sku: string) => `demo-item-${sku}`
export const demoCustomerId = (id: string) => `demo-customer-${id}`
