import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const host='127.0.0.1';let port=5179;
for(;port<5180;port++){
 const available=await new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,host,()=>server.close(()=>resolve(true)));});
 if(available)break;
 try{const response=await fetch(`http://${host}:${port}`);const body=await response.text();if(body.includes('content="neural-marionette-v2"')){spawn('open',['-a','Google Chrome',`http://${host}:${port}`]);console.log(`项目已运行：http://${host}:${port}`);process.exit(0);}}catch{}
}
if(port>=5180)throw new Error('5179 端口已被其他程序占用，请关闭占用程序后重试。');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host',host,'--port',String(port),'--strictPort'],{stdio:['inherit','pipe','inherit']});
let opened=false;child.stdout.on('data',data=>{process.stdout.write(data);if(!opened&&data.toString().includes('Local:')){opened=true;spawn('open',['-a','Google Chrome',`http://${host}:${port}`]);}});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));child.on('exit',code=>process.exit(code??0));
