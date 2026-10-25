import {zipSync,strToU8} from 'fflate';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const letters=index=>String.fromCharCode(65+index);
export const headers=[['Document System ID','Document ID','Customer ID','Type','Currency','Total Order Value','Shipping','Status','Payment Status','Paid Amount'],['synthetic-barrow-51','WC_001','store-1','Order','USD','130.00','0.00','Accepted','Paid','130.00'],['synthetic-barrow-52','WC_002','store-1','Quote','CAD','70.00','0.00','Open','Unpaid','0.00']];
export const items=[['Document System ID','Document ID','Product ID','Quantity','Unit Price','Unit','Case Pack','Increment'],['synthetic-barrow-51','WC_001','product-1','2','65.00','case','2','2'],['synthetic-barrow-52','WC_002','product-1','1','70.00','case','','']];
export const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
export const wizInput=()=>({tenant:'synthetic-barrow-51',ftp:{headers:{name:'order_data_synthetic-barrow-51.csv',csv:csv(headers)},items:{name:'order_items_synthetic-barrow-51.csv',csv:csv(items)},customers:{name:'customer_data_synthetic-barrow-51.csv',csv:'Customer ID,Name,Contact,Ship To\nstore-1,Cedar Street Pantry,Buyer,180 Court Street\n'}},websiteUsers:{name:'website-users.csv',csv:'Email,Customer ID,Name\nnew-buyer@example.test,store-1,New buyer\n'},authority:{system:'supplied',customers:{'store-1':'cedar'},products:{'product-1':'OAT-1'}},scope:{from:null,to:null,filters:[],fullTenant:true}});
export function wizWorkbook(layout='split',{formula=false,entities,entityOnly=false,omitEntities=false}={}) {
 const sheets=layout==='split'?{['Order'+'/'+'Quote']:headers,['Order'+'/'+'Quotes Items']:items}:{['Order'+'/'+'Quote Master Sheet']:[[...headers[0],...items[0].slice(2)],...headers.slice(1).map((header,i)=>[...header,...items[i+1].slice(2)])]};
 sheets.Customers=[['Customer ID','Name'],['store-1','Cedar Street Pantry']];sheets.Addresses=[['Customer ID','Address ID','Kind','Name','Line 1','City','State','ZIP'],['store-1','ship-1','ship-to','Cedar receiving','180 Court Street','Brooklyn','NY','11201']];
 if(omitEntities){delete sheets.Customers;delete sheets.Addresses}
 if(entityOnly)for(const name of Object.keys(sheets))delete sheets[name];
 if(entities)Object.assign(sheets,entities);
 const files={};
 const xml=text=>strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+text);
 const names=Object.keys(sheets);
 files['[Content_Types].xml']=xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
 files['_rels/.rels']=xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 files['xl/workbook.xml']=xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
 files['xl/_rels/workbook.xml.rels']=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`);
 names.forEach((name,i)=>files[`xl/worksheets/sheet${i+1}.xml`]=xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheets[name].map((row,r)=>`<row r="${r+1}">${row.map((cell,c)=>`<c r="${letters(c)}${r+1}" t="inlineStr"><is><t>${escape(cell)}</t></is>${formula&&i===0&&r===1&&c===1?'<f>1+1</f>':''}</c>`).join('')}</row>`).join('')}</sheetData></worksheet>`));
 return {name:'wizcommerce-orders.xlsx',base64:Buffer.from(zipSync(files)).toString('base64'),layout};
}

export function wizNativeInput(account,layout='ftp') {
 const input=wizInput();input.authority.customers={'store-1':'wren'};
 const entities={Customers:[['Customer ID','Name','Email'],['store-1','Wren Pantry','wren@example.test']],Contacts:[['Contact ID','Customer ID','Name','Email','Phone','Role'],['contact-1','store-1','Wren receiving','receiving@example.test','212 555 0100','Receiving']],Addresses:[['Address ID','Customer ID','Kind','Name','Line 1','City','State','ZIP'],['ship-1','store-1','ship-to','Wren receiving','180 Court Street','Brooklyn','NY','11201'],['bill-1','store-1','bill-to','Wren billing','180 Court Street','Brooklyn','NY','11201']]};
 input.nativeAccounts={wren:{...account,name:'Wren Pantry',email:'wren@example.test'}};
 if(layout==='ftp'){input.ftp.customers.csv=csv(entities.Customers);input.ftp.contacts={name:'contacts.csv',csv:csv(entities.Contacts)};input.ftp.addresses={name:'addresses.csv',csv:csv(entities.Addresses)}}
 else {delete input.ftp;input.workbook=wizWorkbook(layout,{omitEntities:true});input.entityWorkbooks=Object.entries(entities).map(([sheet,rows])=>({...wizWorkbook(layout,{entityOnly:true,entities:{[sheet]:rows}}),name:sheet.toLowerCase()+'.xlsx'}))}
 return input;
}
