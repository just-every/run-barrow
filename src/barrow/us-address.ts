// ACC-003: US address format checking. This is not delivery verification: no USPS or carrier service is consulted.
import { fail } from './model'

// USPS 3-digit ZIP prefix ranges by state, DC and territory (inclusive).
const prefixes: Record<string, [number, number][]> = {
 AL: [[350, 369]], AK: [[995, 999]], AZ: [[850, 865]], AR: [[716, 729]], CA: [[900, 961]], CO: [[800, 816]], CT: [[60, 69]], DE: [[197, 199]],
 DC: [[200, 200], [202, 205], [569, 569]], FL: [[320, 349]], GA: [[300, 319], [398, 399]], HI: [[967, 968]], ID: [[832, 838]], IL: [[600, 629]],
 IN: [[460, 479]], IA: [[500, 528]], KS: [[660, 679]], KY: [[400, 427]], LA: [[700, 714]], ME: [[39, 49]], MD: [[206, 219]], MA: [[10, 27], [55, 55]],
 MI: [[480, 499]], MN: [[550, 567]], MS: [[386, 397]], MO: [[630, 658]], MT: [[590, 599]], NE: [[680, 693]], NV: [[889, 898]], NH: [[30, 38]],
 NJ: [[70, 89]], NM: [[870, 884]], NY: [[5, 5], [100, 149]], NC: [[270, 289]], ND: [[580, 588]], OH: [[430, 459]], OK: [[730, 749]], OR: [[970, 979]],
 PA: [[150, 196]], RI: [[28, 29]], SC: [[290, 299]], SD: [[570, 577]], TN: [[370, 385]], TX: [[733, 733], [750, 799], [885, 885]], UT: [[840, 847]],
 VT: [[50, 54], [56, 59]], VA: [[201, 201], [220, 246]], WA: [[980, 994]], WV: [[247, 268]], WI: [[530, 549]], WY: [[820, 831]],
 PR: [[6, 7], [9, 9]], VI: [[8, 8]], GU: [[969, 969]],
}
export const addressCheck = 'Format checked (state code, ZIP format and ZIP range for the state); not verified with USPS or a carrier.'

/** Normalises and checks a US state code and ZIP or ZIP+4, refusing a ZIP outside the state's USPS prefix range. */
export function usAddress(stateInput: unknown, zipInput: unknown) {
 const state = typeof stateInput === 'string' ? stateInput.trim().toUpperCase() : ''
 if (!prefixes[state]) fail('ADDRESS', 'Use a two-letter US state, DC or territory code.', 400)
 const zip = typeof zipInput === 'string' ? zipInput.trim() : ''
 if (!/^\d{5}(-\d{4})?$/.test(zip)) fail('ADDRESS', 'Use a 5-digit ZIP code or ZIP+4 (12345-6789).', 400)
 const prefix = Number(zip.slice(0, 3))
 if (!prefixes[state].some(([low, high]) => prefix >= low && prefix <= high)) fail('ADDRESS', `ZIP ${zip} is not a ${state} ZIP code.`, 400)
 return { state, zip }
}
