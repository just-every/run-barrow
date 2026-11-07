import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sparkFixture} from './sparklayer-fixture.mjs';
import {nuorderInput} from './nuorder-fixture.mjs';
import {activateStaff} from './harness.mjs';
import {jpeg,imageSha} from '../fixtures/confirmation-image.mjs';
export const mediaPath='/api/barrow/catalog-media';
export const mediaReason='Owner reviewed exact imported membership and installation-stored JPEG references.';
export const mediaPolicy=(catalogMedia=['spring'],extra={})=>({role:'sales-manager',accounts:[],warehouses:[],reports:[],discountLimitCents:0,stockExceptionLimitCents:0,entitlements:['catalog-media'],catalogMedia,...extra});
export const mediaEmail=number=>['synthetic-barrow-'+number,'example.test'].join('@');
export async function mediaFixture(t,options={}) {
 const {h,pier,products}=await sparkFixture(t,options);
 await pier.command('item.save',{sku:'RYE-1',name:'Rye crisps',unit:'case',packSize:'1'});
 await pier.command('item.save',{sku:'SHARED-1',name:'Shared pantry case',unit:'case',packSize:'1'});
 const replacement=Buffer.from(jpeg);replacement[replacement.indexOf(Buffer.from([0xff,0xdb]))+5]+=1;
 const replacementSha=createHash('sha256').update(replacement).digest('hex');
 const input=nuorderInput('csv',{retired:true});input.products.csv=input.products.csv.replace('"true"','"false"')+'\n"product-3","SHARED","Natural","Case","","Spring 2027","false","1","1"';
 input.authority.products['product-3']='SHARED-1';input.images.push({name:'RYE_Natural_1.jpg',base64:replacement.toString('base64')});
 const report=await h.api('/api/barrow/imports/nuorder/preview',input);assert.equal(report.matches,true);
 await h.api('/api/barrow/imports/nuorder/apply',{...input,fingerprint:report.fingerprint,reason:mediaReason});
 const catalogs=[{id:'spring',name:'Spring pantry',skus:['OAT-1','SHARED-1'],images:[imageSha,replacementSha]},{id:'winter',name:'Winter pantry',skus:['RYE-1','SHARED-1'],images:[replacementSha]}];
 const membership=async (rows,opts={})=>{const state=await h.api(mediaPath);return h.api(mediaPath+'/membership',{revision:state.revision,catalogRevision:state.catalogRevision,variantRevision:state.variantRevision,catalogs:rows,reason:mediaReason},opts)};
 await membership(catalogs);
 const manager=await activateStaff(h,mediaEmail(901),mediaPolicy());
 return {h,pier,products,replacementSha,catalogs,membership,manager,input};
}
