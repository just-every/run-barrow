// Start with the supplier's date, then add calendar days without crossing a time-zone offset.
export function easternDay(offset) {
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
 const date = new Date(today + 'T00:00:00Z');
 date.setUTCDate(date.getUTCDate() + offset);
 return date.toISOString().slice(0, 10);
}
