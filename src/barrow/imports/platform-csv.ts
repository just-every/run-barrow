import { fail, text } from '../model'

/** Bounded strict CSV shared by platform-specific adapters. Unknown columns stay in original fields. */
export function platformCsv(file: {name:string;csv:string}) {
 const name=text(file?.name,'CSV filename',200)
 if(!/\.csv$/i.test(name)||/[\\/]/.test(name)||typeof file.csv!=='string'||new TextEncoder().encode(file.csv).length>262144)fail('IMPORT_CSV','Supply a plain CSV filename and at most 256 KiB of UTF-8 text.',400)
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false
 const endCell=()=>{row.push(cell);cell='';closed=false}
 const endRow=()=>{endCell();if(row.some(Boolean))rows.push(row);row=[];if(rows.length>501)fail('IMPORT_CSV','Supply at most 500 data rows per file.',400)}
 for(let i=file.csv.startsWith('\uFEFF')?1:0;i<file.csv.length;i++) {
  const ch=file.csv[i]
  if(quoted){if(ch==='"'&&file.csv[i+1]==='"'){cell+='"';i++}else if(ch==='"'){quoted=false;closed=true}else cell+=ch}
  else if(ch===',')endCell()
  else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&file.csv[i+1]==='\n')i++;endRow()}
  else if(ch==='"'&&!cell&&!closed)quoted=true
  else if(ch==='"'||closed)fail('IMPORT_CSV','Malformed CSV quoting.',400)
  else cell+=ch
 }
 if(quoted)fail('IMPORT_CSV','Unclosed CSV field.',400)
 if(cell||row.length||closed)endRow()
 const headers=rows.shift()
 if(!headers?.length||headers.length>100||new Set(headers).size!==headers.length||headers.some(h=>!h||h.length>100||/[\u0000-\u001f]/.test(h)))fail('IMPORT_CSV','CSV headers must be distinct nonempty names.',400)
 return rows.map((cells,index)=>{
  if(cells.length!==headers.length||cells.some(c=>c.length>8000||/[\u0000\u007f]/.test(c)))fail('IMPORT_CSV',`${name} row ${index+2} has invalid columns or cells.`,400)
  return {row:index+2,fields:Object.fromEntries(headers.map((h,i)=>[h,cells[i]])) as Record<string,string>}
 })
}
export function sourceMoney(value:string,label:string) {
 if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))fail('IMPORT_MONEY',`${label} requires nonnegative plain money with at most two decimal places.`,400)
 const [whole,fraction='']=value.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))
 if(cents>1000000000000n)fail('IMPORT_MONEY',`${label} exceeds the supported exact cents range.`,400)
 return Number(cents)
}
export function sourceQuantity(value:string,label:string) {
 if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>1000000)fail('IMPORT_QUANTITY',`${label} requires a whole selling-unit quantity from 1 to 1000000.`,400)
 return Number(value)
}
