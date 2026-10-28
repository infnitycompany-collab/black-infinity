import fs from 'node:fs/promises';import {execFileSync}from'node:child_process';
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(process.argv.includes('--list')){console.log(JSON.stringify(paths));process.exit();}
const begin=Number(process.argv[2]||0),count=Number(process.argv[3]||10),files=[];for(const path of paths.slice(begin,begin+count)){if(path!=='.env.example'&&/(^|\/)(\.data|\.env(?:\.|$)|node_modules|\.next|test-results)/.test(path))throw new Error('Private path in export');const binary=/\.(png|jpg|webp|woff2?)$/.test(path);const data=await fs.readFile(path);files.push({path,mode:'100644',type:'blob',content:data.toString(binary?'base64':'utf8'),binary});}console.log(JSON.stringify(files));
