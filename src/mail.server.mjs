import { createMailSender } from './modules/mail/index.mjs'

const mailOff = { async send() { return { status: 'rejected', provider: 'none', providerMessageId: null, code: 'mail_off' } } }

export function operatorMail(env) {
 if (env.MAIL_PROVIDER === 'none') return mailOff
 if (env.RER_DEMO === '1') return createMailSender({ provider: 'development', mode: 'development' })
 if (!env.MAIL_PROVIDER) return undefined
 return { send: message => {
  const sender = env.MAIL_PROVIDER === 'development'
   ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }) : undefined
   : createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'rer' ? { relayUrl: env.MAIL_RELAY_URL } : {}), ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) })
  return sender?.send(message)
 } }
}
