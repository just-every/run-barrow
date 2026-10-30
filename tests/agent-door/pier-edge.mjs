/** Session-authenticated provider edge only; no seed service or native state is
 * replaced. Command support prepares the owner's real accepted-order fixture. */
const commands=new Map(),orders=[]
export default {async fetch(request,{fixture}) {
 const url=new URL(request.url)
 if(request.headers.get('cookie')!==fixture?.cookie||request.headers.get('origin')!==url.origin)return Response.json({code:'unauthorized'},{status:401})
 if(request.method==='POST'&&url.pathname==='/api/pier/commands') {
  const body=await request.json()
  if(body.type!=='order.create'||typeof body.commandId!=='string'||!['juniper','custody-review'].includes(body.payload?.customerId)||!Array.isArray(body.payload.lines)||body.payload.lines.some(line=>!['linen','hemp'].includes(line.itemId)||!/^\d+(\.\d{1,6})?$/.test(line.quantity)))return Response.json({ok:false},{status:400})
  const digest=JSON.stringify(body),previous=commands.get(body.commandId)
  if(previous)return previous.digest===digest?Response.json({ok:true,result:previous.order}):Response.json({code:'conflict'},{status:409})
  const order={id:'pier-'+body.commandId,reference:body.commandId,customerId:body.payload.customerId,status:'open',lines:body.payload.lines.map((line,i)=>({...line,id:body.commandId+'-'+i,reserved:line.quantity,dispatched:'0',cancelled:'0',backorder:'0'}))}
  orders.push(order);commands.set(body.commandId,{digest,order});return Response.json({ok:true,result:order})
 }
 if(request.method!=='GET'||url.pathname!=='/api/pier/state')return Response.json({code:'not_found'},{status:404})
 return Response.json({items:[{id:'linen',sku:'LINEN',name:'Linen table runner',unit:'each',archived:false},{id:'hemp',sku:'HEMP',name:'Hemp table runner',unit:'each',archived:false}],
  positions:['linen','hemp'].map(itemId=>({itemId,locationId:'shelf',status:'sellable',available:String(100-orders.flatMap(order=>order.lines).filter(line=>line.itemId===itemId).reduce((n,line)=>n+Number(line.reserved),0))})),locations:[{id:'shelf',kind:'bin',warehouse:'Main'}],parties:[{id:'juniper',kind:'customer'},{id:'custody-review',kind:'customer'}],orders,purchaseOrders:[]})
}}
