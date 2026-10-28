import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,mkdir,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {unzipSync} from 'fflate';

const execute=promisify(execFile);
const wordpress='wordpress@sha256:8901759bfbb7ebc567dbc44a244c0d96d720d0a67c17bc4f42ec355ddba2e863';
const database='mariadb@sha256:d1891ede5a559f1086f55053bb8cc1569b0298338c4d72d71725a7f74f6ba620';
const docker=async(...args)=>{try{return (await execute('docker',args,{timeout:300000,maxBuffer:2e6})).stdout.trim()}catch(error){throw Error('Controlled WooCommerce Docker operation failed: '+args[0]+': '+String(error.stderr||error.stdout||error.message).replace(/(?:ck_|cs_)[a-zA-Z0-9]+/g,'<redacted>'))}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}
async function distribution(){
 const root=resolve('.cache/woocommerce-10.3.3');
 try{await stat(join(root,'woocommerce/woocommerce.php'));return root}catch{}
 const response=await fetch('https://downloads.wordpress.org/plugin/woocommerce.10.3.3.zip',{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('Controlled WooCommerce distribution download failed');
 const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
 for(const [name,bytes]of Object.entries(files)){if(name.endsWith('/'))continue;const path=join(root,name);await mkdir(resolve(path,'..'),{recursive:true,mode:0o755});await writeFile(path,bytes,{mode:0o644})}
 await execute('chmod',['-R','a+rX',join(root,'woocommerce')]);
 return root;
}
export async function controlledWoo(){
 const directory=await mkdtemp(join(tmpdir(),'barrow-woo-')),tag='barrow-'+randomUUID().slice(0,12),port=await freePort(),origin=`http://127.0.0.1:${port}`;
 const containers=[],network=tag,volume=tag+'-wordpress';let closed=false;
 const close=async()=>{if(closed)return;closed=true;for(const name of containers.reverse())await docker('rm','-f',name);await docker('volume','rm',volume);await docker('network','rm',network);await rm(directory,{recursive:true,force:true})};
 try{
  const source=await distribution();
  // Only public dependency files are mounted for Apache. Private proof keys stay root-only.
  await chmod(directory,0o755);await chmod(resolve('integrations/woocommerce'),0o755);
  await docker('network','create',network);await docker('volume','create',volume);
  const db=tag+'-db',wp=tag+'-wp';
  await docker('run','-d','--name',db,'--network',network,'-e','MARIADB_ROOT_PASSWORD=synthetic-barrow-local','-e','MARIADB_DATABASE=wordpress',database);containers.push(db);
  await docker('run','-d','--name',wp,'--network',network,'-p',`127.0.0.1:${port}:80`,'-e',`WORDPRESS_DB_HOST=${db}`,'-e','WORDPRESS_DB_USER=root','-e','WORDPRESS_DB_PASSWORD=synthetic-barrow-local','-e','WORDPRESS_DB_NAME=wordpress','-v',`${volume}:/var/www/html`,'-v',`${join(source,'woocommerce')}:/var/www/html/wp-content/plugins/woocommerce`,'-v',`${resolve('integrations/woocommerce')}:/var/www/html/wp-content/plugins/barrow-bridge`,'-v',`${directory}:/proof`,wordpress);containers.push(wp);
  // Never write Apache's authorization usernames to a proof log.
  await docker('exec',wp,'sh','-c','printf "CustomLog /dev/null common\n" > /etc/apache2/conf-enabled/zz-barrow-proof.conf');
  const php=`<?php
define('WP_INSTALLING',true); $_SERVER['HTTP_HOST']='127.0.0.1:${port}'; $_SERVER['REQUEST_METHOD']='GET';
require '/var/www/html/wp-load.php'; require_once ABSPATH.'wp-admin/includes/upgrade.php'; require_once ABSPATH.'wp-admin/includes/plugin.php';
if(!is_blog_installed())wp_install('Controlled Barrow store','barrow_owner','owner'.'@'.'example.test',true,'',bin2hex(random_bytes(24)));
update_option('siteurl','${origin}'); update_option('home','${origin}'); update_option('permalink_structure','/%postname%/');
activate_plugin('woocommerce/woocommerce.php'); require_once WP_PLUGIN_DIR.'/woocommerce/woocommerce.php'; WC_Install::install(); activate_plugin('barrow-bridge/barrow-bridge.php');
update_option('woocommerce_currency','USD');update_option('woocommerce_price_num_decimals',2);update_option('woocommerce_calc_taxes','no');update_option('woocommerce_manage_stock','yes');
$owner=get_user_by('login','barrow_owner');$key='ck_'.bin2hex(random_bytes(20));$secret='cs_'.bin2hex(random_bytes(20));global $wpdb;
$wpdb->insert($wpdb->prefix.'woocommerce_api_keys',array('user_id'=>$owner->ID,'description'=>'Controlled Barrow proof','permissions'=>'read_write','consumer_key'=>wc_api_hash($key),'consumer_secret'=>$secret,'truncated_key'=>substr($key,-7)));
file_put_contents('/proof/keys.json',json_encode(array('key'=>$key,'secret'=>$secret,'keyId'=>$wpdb->insert_id)));chmod('/proof/keys.json',0600);chown('/proof/keys.json',${process.getuid()});
echo 'Controlled WooCommerce '.WC_VERSION;
`;
  await writeFile(join(directory,'bootstrap.php'),php,{mode:0o644});
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
   try{await docker('exec',wp,'php','-r',`$m=@new mysqli('${db}','root','synthetic-barrow-local','wordpress');exit($m->connect_errno?1:0);`);await docker('exec',wp,'test','-f','/var/run/apache2/apache2.pid');ready=true;break}catch{await pause(500)}
  }
  if(!ready)throw Error('Controlled WooCommerce database did not become ready');
  const version=await docker('exec',wp,'php','/proof/bootstrap.php');
  const keys=JSON.parse(await readFile(join(directory,'keys.json'),'utf8'));
  const auth='Basic '+Buffer.from(keys.key+':'+keys.secret).toString('base64');
  const request=async(path,body,method=body===undefined?'GET':'POST')=>{
   let authorization=auth;
   if(path.startsWith('/wp-json/wc/')){
    const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    const oauth={oauth_consumer_key:keys.key,oauth_nonce:randomBytes(16).toString('hex'),oauth_signature_method:'HMAC-SHA256',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_version:'1.0'};
    const url=new URL(origin+path),params=[...url.searchParams,...Object.entries(oauth)].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>encode(k)+'='+encode(v)).join('&');
    oauth.oauth_signature=createHmac('sha256',keys.secret+'&').update(method+'&'+encode(url.origin+url.pathname)+'&'+encode(params)).digest('base64');
    authorization='OAuth '+Object.entries(oauth).map(([k,v])=>k+'="'+encode(v)+'"').join(', ');
   }
   const response=await fetch(origin+path,{method,headers:{authorization,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
   const value=await response.json();if(!response.ok)throw Error(`Controlled WooCommerce ${method} refused (${response.status}): ${value.code??'unknown'}: ${String(value.message??'').replace(/(?:ck_|cs_)[a-zA-Z0-9]+/g,'<redacted>')}`);return value;
  };
  await request('/wp-json/barrow/v1/identity');
  return {origin,version,request,bindings:{INVENTORY_PROVIDER:'woocommerce',WOO_ORIGIN:origin,WOO_KEY:keys.key,WOO_SECRET:keys.secret,WOO_WEBHOOK_SECRET:randomBytes(32).toString('hex')},
   async revoke(){await docker('exec',wp,'php','-r',`require '/var/www/html/wp-load.php';global $wpdb;$wpdb->delete($wpdb->prefix.'woocommerce_api_keys',array('key_id'=>${Number(keys.keyId)}));`)},close};
 }catch(error){await close().catch(()=>{});throw error}
}

export async function wooStock(store){
 const suffix=randomUUID().slice(0,8),customer=await store.request('/wp-json/wc/v3/customers',{email:`synthetic-barrow-${suffix}`+'@'+'example.test',username:'synthetic-barrow-'+suffix,password:randomBytes(24).toString('hex')});
 const product=await store.request('/wp-json/wc/v3/products',{name:'Controlled wholesale shirt',type:'variable',attributes:[{name:'Size',visible:true,variation:true,options:['Medium']} ]});
 const variation=await store.request(`/wp-json/wc/v3/products/${product.id}/variations`,{sku:'WOO-'+suffix,regular_price:'120.00',manage_stock:true,stock_quantity:30,attributes:[{name:'Size',option:'Medium'}]});
 return {customer,product,variation};
}
