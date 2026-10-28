import { Buffer } from 'node:buffer'
import { fail, text } from '../model'
import { decodedImage } from '../product-images'
import { retrieveNuorderImage } from './nuorder-https'
import type { NuorderInput, NuorderProduct } from './nuorder'

export type NuorderMediaInput = {name:string;base64?:string;url?:string;style?:string}
export type HeldNuorderImage = {name:string;image:{sha256:string;width:number;height:number;size:number;components:1|3;base64:string}}
function publicHost(host:string) {
 return host.length<=253&&host.includes('.')&&/^[a-z0-9.-]+$/.test(host)&&!host.endsWith('.')&&!host.endsWith('.localhost')&&!host.endsWith('.local')&&!host.endsWith('.internal')&&!/^[\d.]+$/.test(host)&&host.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))
}
function remoteUrl(value:string,hosts:string[]) {
 let url:URL
 try {url=new URL(value)} catch {return fail('IMPORT_IMAGES','Use a public HTTPS image URL.',400)}
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||!publicHost(url.hostname)||!hosts.includes(url.hostname))fail('IMPORT_IMAGES','Image URLs need an explicitly allowed public HTTPS host, no credentials, query, fragment or custom port.',400)
 return url
}
export async function nuorderMedia(input:NuorderInput,products:NuorderProduct[],held:HeldNuorderImage[]) {
 const imageRule=input.imageRule??'{style}_{color}_{slot}.jpg'
 if(typeof imageRule!=='string'||imageRule.length>200||/[\\/]/.test(imageRule)||!imageRule.endsWith('.jpg')||!imageRule.includes('{slot}')||!['{style}','{upc}'].some(token=>imageRule.includes(token))||/\{[^}]*\}/g.test(imageRule.replace(/\{(style|color|size|upc|slot)\}/g,'')))fail('IMPORT_IMAGES','Use a JPEG filename rule containing style or UPC and a slot, with optional color and size tokens.',400)
 if(input.images!==undefined&&(!Array.isArray(input.images)||input.images.length>50))fail('IMPORT_IMAGES','Supply at most fifty JPEG files or URLs per batch.',400)
 const hosts=input.imageHosts??[]
 if(!Array.isArray(hosts)||hosts.length>10||hosts.some(host=>typeof host!=='string'||!publicHost(host)))fail('IMPORT_IMAGES','Declare up to ten exact public image hostnames.',400)
 const files=new Map(held.map(file=>[file.name,file])),names=new Set<string>(),missingImages:Array<{style:string;name:string;reason:string}>=[]
 for(const file of input.images??[]) {
  const name=text(file?.name,'Image filename',200)
  if(/[\\/]/.test(name)||names.has(name))fail('IMPORT_IMAGES','Image filenames must be distinct plain filenames.',400)
  names.add(name)
  if((typeof file.base64==='string')===(typeof file.url==='string'))fail('IMPORT_IMAGES','Supply exactly one JPEG byte value or image URL.',400)
  let content=file.base64
  if(file.url!==undefined) {
   if(input.retrieveImages!==true)fail('IMPORT_IMAGES','Explicitly consent to retrieving images from the declared hosts.',400)
   const url=remoteUrl(file.url,hosts),style=text(file.style,'Source image style',100)
   if(!products.some(product=>product.style===style))fail('IMPORT_IMAGES','Remote images must name a supplied source style.',400)
   try {content=await retrieveNuorderImage(url);await decodedImage(content)} catch(error) {
    // A failed replacement must never silently attach an older held file.
    files.delete(name);missingImages.push({style,name,reason:error instanceof Error&&error.message.startsWith('Image retrieval')?error.message:'Image could not be retrieved as a supported JPEG'});continue
   }
  }
  const decoded=await decodedImage(content)
  files.set(name,{name,image:{sha256:decoded.sha256,width:decoded.width,height:decoded.height,size:decoded.bytes.length,components:decoded.components,base64:Buffer.from(decoded.bytes).toString('base64')}})
 }
 if(files.size>500)fail('IMPORT_IMAGES','Resolve held media before retaining more than five hundred filenames.',400)
 const images:Array<HeldNuorderImage&{sku:string;slot:number}>=[],heldImages:HeldNuorderImage[]=[],slots=new Set<string>()
 for(const file of [...files.values()].sort((a,b)=>a.name.localeCompare(b.name))) {
  let matched=false
  for(const product of products)for(let slot=1;slot<=9;slot++) {
   const expected=imageRule.replace(/\{(style|color|size|upc|slot)\}/g,(_,key:keyof NuorderProduct|'slot')=>String(key==='slot'?slot:product[key]))
   if(file.name!==expected)continue
   if(imageRule.includes('{upc}')&&!product.upc)continue
   const key=product.sku+':'+slot
   if(slots.has(key))fail('IMPORT_IMAGES',`More than one image targets ${product.sku} slot ${slot}.`,400)
   slots.add(key);matched=true;images.push({...file,sku:product.sku,slot})
  }
  if(!matched)heldImages.push(file)
 }
 return {images,heldImages,missingImages,imageRule}
}
