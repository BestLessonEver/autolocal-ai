import {createCipheriv,createDecipheriv,randomBytes,createHash,timingSafeEqual} from 'node:crypto'
export function digest(value:string){return createHash('sha256').update(value).digest('hex')}
function key() {
 const value=Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY||'','base64')
 if(value.length!==32)throw new Error('Google token encryption is not configured')
 return value
}
export function sealGoogleSecret(value:unknown,binding:string) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv)
 cipher.setAAD(Buffer.from(binding))
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.')
}
export function openGoogleSecret<T>(value:string,binding:string):T {
 const [version,iv,tag,data]=value.split('.')
 if(version!=='v1'||!iv||!tag||!data)throw new Error('Invalid encrypted connection')
 const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'))
 decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(tag,'base64url'))
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8')) as T
}
export function newOAuthChallenge() {
 const state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url')
 return {state,browser,verifier,challenge:createHash('sha256').update(verifier).digest('base64url')}
}
export function equalSecret(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}
