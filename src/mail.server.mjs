import { createMailSender } from './modules/mail/index.mjs'
import { demoEffect } from './modules/demo/index.mjs'

export function operatorMail(env) {
 if (!env.MAIL_PROVIDER) return undefined
 return { send: message => demoEffect(() => {
  const sender = env.MAIL_PROVIDER === 'development'
   ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }) : undefined
   : createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) })
  return sender?.send(message)
 }, () => ({ provider: env.MAIL_PROVIDER, status: 'accepted', providerMessageId: 'demo-suppressed' })) }
}
