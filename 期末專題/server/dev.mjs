import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
for(const child of children)child.on('exit',code=>{if(code)for(const c of children)c.kill();});
process.on('SIGINT',()=>{for(const c of children)c.kill();process.exit();});
