import {csv,wizWorkbook} from './wizcommerce-fixture.mjs';
import {activateStaff,accountValue} from './harness.mjs';
import {sparkFixture} from './sparklayer-fixture.mjs';
export const address=name=>[name,'example.test'].join('@');
export const companyRows=()=>[['Customer Code','Customer Name','Company Email','Currency','Payment Terms','Sales Rep','Price List','Catalogs','Credit Status'],['store-a','Alder Pantry',address('alder'),'USD','Net 30','Taylor','Domestic','Pantry','Review externally'],['store-b','Birch Pantry',address('birch'),'CAD','Net 45','Taylor','Canada','Pantry','Review externally']];
export const buyerRows=()=>[['Customer Code','Buyer Email','Buyer Name'],['store-a',address('alder'),'Alder buyer'],['store-b',address('birch'),'Birch buyer']];
export const locationRows=()=>[['Customer Code','Location Code','Type','Location Name','Address 1','Address 2','City','State','Postal Code','Delivery Instructions'],...['store-a','store-b'].flatMap(code=>[['bill','bill-to','Billing','100 Court Street'],['north','ship-to','North store','200 Court Street'],['south','ship-to','South store','300 Court Street']].map(([id,kind,name,line1])=>[code,id,kind,name,line1,'','Brooklyn','NY','11201','Receiving desk']))];
// A values-only BIFF8 export in a standard compound document, generated in
// memory so source email identities remain synthetic runtime values.
export function companyXls(sheet,rows) {
 const record=(id,data=Buffer.alloc(0))=>{const head=Buffer.alloc(4);head.writeUInt16LE(id);head.writeUInt16LE(data.length,2);return Buffer.concat([head,data])};
 const bof=type=>{const b=Buffer.alloc(16);b.writeUInt16LE(0x600);b.writeUInt16LE(type,2);return record(0x809,b)};
 const bound=Buffer.alloc(8+sheet.length);bound[6]=sheet.length;bound.write(sheet,8,'latin1');const globalLength=bof(5).length+4+bound.length+4;bound.writeUInt32LE(globalLength);
 const parts=[bof(5),record(0x85,bound),record(0xa),bof(0x10)];
 rows.forEach((row,r)=>row.forEach((value,c)=>{const bytes=Buffer.from(String(value),'utf16le'),b=Buffer.alloc(9+bytes.length);b.writeUInt16LE(r);b.writeUInt16LE(c,2);b.writeUInt16LE(String(value).length,6);b[8]=1;bytes.copy(b,9);parts.push(record(0x204,b))}));parts.push(record(0xa));
 const data=Buffer.concat(parts),size=Math.max(4096,Math.ceil(data.length/512)*512),count=size/512;
 const header=Buffer.alloc(512);Buffer.from('d0cf11e0a1b11ae1','hex').copy(header);header.writeUInt16LE(0x3e,24);header.writeUInt16LE(3,26);header.writeUInt16LE(0xfffe,28);header.writeUInt16LE(9,30);header.writeUInt16LE(6,32);header.writeUInt32LE(1,44);header.writeUInt32LE(0,48);header.writeUInt32LE(4096,56);header.writeUInt32LE(0xfffffffe,60);header.writeUInt32LE(0xfffffffe,68);for(let at=76;at<512;at+=4)header.writeUInt32LE(0xffffffff,at);header.writeUInt32LE(1,76);
 const directory=Buffer.alloc(512);const entry=(at,name,type,start,size)=>{const bytes=Buffer.from(name+'\0','utf16le');bytes.copy(directory,at);directory.writeUInt16LE(bytes.length,at+64);directory[at+66]=type;directory[at+67]=1;for(const offset of [68,72,76])directory.writeUInt32LE(0xffffffff,at+offset);directory.writeUInt32LE(start,at+116);directory.writeUInt32LE(size,at+120)};entry(0,'Root Entry',5,0xfffffffe,0);directory.writeUInt32LE(1,76);entry(128,'Workbook',2,2,size);
 const fat=Buffer.alloc(512,255);fat.writeUInt32LE(0xfffffffe,0);fat.writeUInt32LE(0xfffffffd,4);for(let i=0;i<count;i++)fat.writeUInt32LE(i===count-1?0xfffffffe:i+3,(i+2)*4);
 const stream=Buffer.alloc(size);data.copy(stream);return {name:sheet.toLowerCase()+'.xls',base64:Buffer.concat([header,directory,fat,stream]).toString('base64'),sheet};
}
export function companyInput(customerId,repId,format='csv') {
 const file=(name,rows)=>format==='xls'?companyXls(name,rows):format==='xlsx'?{...wizWorkbook('split',{entityOnly:true,entities:{[name]:rows}}),name:name.toLowerCase()+'.xlsx',sheet:name}:{name:name.toLowerCase()+'.csv',csv:csv(rows)};
 return {tenant:'synthetic-barrow-91',companies:file('Companies',companyRows()),buyers:file('Buyers',buyerRows()),locations:file('Locations',locationRows()),accounts:{'store-a':{id:'alder',pierCustomerId:customerId},'store-b':{id:'birch',pierCustomerId:customerId}},reps:{Taylor:repId},priceLists:{Domestic:'cedar',Canada:'canada-book'},catalogs:{Pantry:'pantry'},effectiveOn:'2026-10-28'};
}
export async function companyFixture(t,options={}) {
 const {h,pier,products}=await sparkFixture(t,{clock:'2026-10-28T12:00:00Z',...options});
 await h.command('account.save',{id:'canada-book',value:{...accountValue(products.customer.id),pierCustomerId:'synthetic-barrow-cad-book',name:'Canadian book',email:address('canada-book'),currency:'CAD',minimumCents:1000,prices:[{sku:'OAT-1',unitCents:7200,minQty:2}]}});
 const rep=await activateStaff(h,address('rep-taylor'),{role:'rep',accounts:[],warehouses:'all',reports:[],discountLimitCents:0,stockExceptionLimitCents:0});
 return {h,pier,products,rep,input:companyInput(products.customer.id,rep.id)};
}
