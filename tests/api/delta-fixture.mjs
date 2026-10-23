import {writeFile,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cutoverFixture,cutoverWorkbook} from './cutover-fixture.mjs';
import {sftpFixture} from './sftp-fixture.mjs';

export async function deltaFixture(t,{compatiblePacks=true,...options}={}) {
 const f=await cutoverFixture(t,options),sftp=await sftpFixture(t),{h}=f;
 await h.configure({BARROW_SFTP_SECRETS:sftp.secrets});
 if(compatiblePacks){const native=await h.api('/api/barrow/accounts/by-id/birch');await h.command('account.save',{id:native.id,revision:native.revision,value:{...native.value,prices:native.value.prices.map(price=>({...price,minQty:2}))}})}
 const mapping={products:{sku:'sku',name:'name',unit:'unit',casePack:'casePack',increment:'increment'},customers:{accountId:'accountId',name:'name'},ats:{sku:'sku',warehouse:'warehouse',available:'available',observedAt:'observedAt'}};
 const write=(name,value)=>writeFile(join(sftp.directory,'imports',name),value);
 await write('products.csv','sku,name,unit,casePack,increment\nOAT-1,Toasted oat granola,case,6,2\n');
 await write('customers.csv','accountId,name\ncedar,Cedar Street Pantry\nbirch,Cedar Street Pantry East\n');
 await write('ats.csv',`sku,warehouse,available,observedAt\nOAT-1,New-York,118,${new Date().toISOString()}\n`);
 const layouts=await h.api('/api/barrow/confirmation-layouts');
 const saved=await h.command('confirmation-layout.save',{revision:layouts.revision,name:'ERP cutover lines',columns:['order','order_revision','account','currency','sku','quantity','unit_cents','line_cents','terms_days'],shape:'per-line',makeDefault:false});
 const layoutId=saved.layouts.find(row=>row.name==='ERP cutover lines').id;
 const config={connection:sftp.config,accountIds:f.input.scope,mapping,layoutId};
 const baseline={...f.input,mappings:f.mappings,sourceSystem:'Merchant incumbent and accounting ledger',freezeOrderEntry:true,reason:'Owner pauses scoped entry while reconciling the source and rehearsing the merchant ERP destination.'};
 const delta={...baseline,workbook:cutoverWorkbook({quantity:'3'}),reason:'Owner reviewed the edited incumbent order quantity in the complete delta export.'};
 const authorities={'orders:order-a':baseline.sourceSystem,'orders:order-b':baseline.sourceSystem,'receivables:invoice-a':baseline.sourceSystem,'receivables:invoice-b':baseline.sourceSystem};
 const files=()=>readdir(join(sftp.directory,'exports'));
 return {...f,sftp,config,baseline,delta,authorities,write,files,readFile:name=>readFile(join(sftp.directory,'exports',name),'utf8'),ack:(name,value)=>writeFile(join(sftp.directory,'acknowledgments',name),JSON.stringify(value))};
}
