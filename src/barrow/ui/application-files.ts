export async function applicationFile(file:File) {
 const bytes=new Uint8Array(await file.arrayBuffer());let binary=''
 for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000))
 return {name:file.name,contentBase64:btoa(binary)}
}
