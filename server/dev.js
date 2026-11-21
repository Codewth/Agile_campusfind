import { spawn } from 'node:child_process';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const children=[spawn(process.execPath,['server/index.js'],{stdio:'inherit'}),spawn(npm,['run','dev'],{stdio:'inherit',shell:process.platform==='win32'})];
function shutdown(){for(const child of children)if(!child.killed)child.kill('SIGTERM');}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
for(const child of children)child.on('exit',(code)=>{if(code&&code!==0){console.error('A CampusFind process exited with status',code);shutdown();process.exitCode=code;}});
