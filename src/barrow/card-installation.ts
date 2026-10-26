/** Idempotency identities belong to one installation, including across archive restore. */
export async function cardInstallation(db:D1Database) {
 await db.prepare("INSERT OR IGNORE INTO bw_settings(key,value_json,revision) VALUES('stripe-installation',?,?)").bind(JSON.stringify(crypto.randomUUID()),crypto.randomUUID()).run()
 return JSON.parse((await db.prepare("SELECT value_json FROM bw_settings WHERE key='stripe-installation'").first<{value_json:string}>())!.value_json) as string
}
