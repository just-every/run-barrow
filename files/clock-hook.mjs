import { registerHooks } from 'node:module';
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(url.endsWith('/tests/api/harness.mjs')&&process.env.PROBE_CLOCK) {
  return {...result,source:result.source.toString().replace('networkEdge,clock,socketEdge=false','networkEdge,clock='+JSON.stringify(process.env.PROBE_CLOCK)+',socketEdge=false')};
 }
 return result;
}});
