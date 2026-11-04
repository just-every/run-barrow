import {randomUUID,webcrypto} from 'node:crypto'
let fixture
/** Add a disposable Business signer to the real installation's claim ring. */
export default async function(values) {
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const kid=randomUUID(),key=await webcrypto.subtle.exportKey('jwk',pair.publicKey)
 fixture={...values,signer:{issuer:values.issuer,installationId:values.installationId,kid,privateKey:pair.privateKey}}
 return JSON.stringify({...JSON.parse(values.publicKeys),[kid]:{...key,kid,alg:'ES256',use:'sig'}})
}
export const staffTrust=()=>fixture
