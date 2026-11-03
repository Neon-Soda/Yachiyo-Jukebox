import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleUrl=pathToFileURL(resolve(import.meta.dirname,'../bot/src/desktop-status.mjs')).href;
for(const mode of ['shutdown','disconnect'])test(`desktop pipe ${mode} retires only its own Bot`,{timeout:12000,skip:process.platform!=='win32'},async()=>{
 const pipe=String.raw`\\.\pipe\yachiyo-control-${randomUUID()}`,nonce=randomUUID();
 const server=net.createServer();server.listen(pipe);await once(server,'listening');
 const connected=once(server,'connection');
 const child=spawn(process.execPath,['--input-type=module','-e',`import {EventEmitter} from 'node:events'; import {attachDesktopStatus} from ${JSON.stringify(moduleUrl)}; const client=new EventEmitter();client.isReady=()=>true;client.ws={ping:42};process.on('SIGTERM',()=>process.exit(0));attachDesktopStatus(client,()=>({rooms:2,localReady:true}));setInterval(()=>{},1000);`],{env:{...process.env,YACHIYO_CONTROL_PIPE:pipe,YACHIYO_CONTROL_NONCE:nonce},windowsHide:true,stdio:'ignore'});
 let socket;try{
  const exited=once(child,'exit');[socket]=await connected;socket.setEncoding('utf8');let pending='';let resolveStatus;const status=new Promise(r=>resolveStatus=r);
  socket.on('data',chunk=>{pending+=chunk;let index;while((index=pending.indexOf('\n'))>=0){const message=JSON.parse(pending.slice(0,index));pending=pending.slice(index+1);if(message.type==='hello'){assert.equal(message.nonce,nonce);socket.write('{"type":"ready"}\n');}else if(message.type==='status')resolveStatus(message);}});
  const value=await status;assert.deepEqual(value,{type:'status',ready:true,ping:42,rooms:2,localReady:true});
  if(mode==='shutdown')socket.write('{"type":"shutdown"}\n');else socket.destroy();
  assert.equal((await exited)[0],0);
 }finally{socket?.destroy();child.kill();server.close();}
});
