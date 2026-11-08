// Slow this run's own browser only; preserve all app limits and assertions.
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.cwd()+'/package.json')('@playwright/test');
const launch=chromium.launch.bind(chromium);
chromium.launch=async (...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async (...options)=>{
  const context=await newContext(...options),newPage=context.newPage.bind(context);
  context.newPage=async (...parameters)=>{
   const page=await newPage(...parameters),session=await context.newCDPSession(page);
   await session.send('Emulation.setCPUThrottlingRate',{rate:4});return page;
  };
  return context;
 };
 console.log('PROBE local browser timing: CDP CPU throttling rate 4; app limits and assertions unchanged.');
 return browser;
};
