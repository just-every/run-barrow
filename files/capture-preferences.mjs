// Keep the settings proof in page context when the shared region crop cuts off a tall card.
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.cwd()+'/package.json')('@playwright/test');
const launch=chromium.launch.bind(chromium);
chromium.launch=async (...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async (...options)=>{
  const context=await newContext(...options),newPage=context.newPage.bind(context);
  context.newPage=async (...parameters)=>{
   const page=await newPage(...parameters),screenshot=page.screenshot.bind(page);
   page.screenshot=async options=>{
    if(/order-notices-settings-(1440|390)\.png$/.test(options?.path??'')){
     const {clip,...full}=options;return screenshot({...full,fullPage:true});
    }
    return screenshot(options);
   };
   return page;
  };
  return context;
 };
 return browser;
};
