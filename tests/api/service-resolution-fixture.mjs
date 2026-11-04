export async function replacementCatalogue(h,pier) {
 await pier.command('item.save',{sku:'OAT-2',name:'Replacement oat granola',unit:'case',packSize:'1'});
 const account=await h.api('/api/barrow/accounts/by-id/cedar');
 await h.command('account.save',{id:account.id,revision:account.revision,value:{...account.value,prices:[...account.value.prices,{sku:'OAT-2',unitCents:7900,minQty:1}]}});
}
export async function replacementShipping(h) {
 const current=await h.api('/api/barrow/shipping/settings');
 const common={accountIds:['cedar'],states:[],warehouses:[],minCents:0,maxCents:null,handlingCents:175,freeOverCents:null,transitMinDays:1,transitMaxDays:3,quoteRequired:false};
 return h.command('shipping.settings',{revision:current.revision,methods:[{...common,id:'replacement-parcel',name:'Replacement parcel',kind:'parcel',baseCents:825},{...common,id:'replacement-freight',name:'Replacement freight',kind:'freight',baseCents:0,quoteRequired:true}]});
}
