import fs from 'node:fs/promises';
const all=JSON.parse(await fs.readFile('design/pages.json','utf8'));const keys=process.argv.slice(2);const selected=all.filter(p=>keys.includes(p.key));const source=await fs.readFile('design/figma-builder.js','utf8');process.stdout.write(JSON.stringify({code:source.replace('__PAGES__',JSON.stringify(selected)).replace('__ALL_PAGES__',JSON.stringify(all))}));
