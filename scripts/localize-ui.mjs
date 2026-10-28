import ts from 'typescript';import fs from 'node:fs';
for(const file of ['src/components/Workspace.tsx','src/components/AuthScreen.tsx','src/components/PublicSite.tsx']){
 const raw=fs.readFileSync(file,'utf8');if(raw.includes('useTranslation'))continue;const source=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function insert(at,value){edits.push({start:at,end:at,value});}
 function walk(n){
  if(ts.isFunctionDeclaration(n)&&n.name&&/^[A-Z]/.test(n.name.text)&&n.body)insert(n.body.getStart(source)+1,'\n const tr=useTranslation();\n');
  if(ts.isJsxText(n)){const text=n.text.replace(/\s+/g,' ').trim();if(text&&/[A-Za-z]/.test(text))edits.push({start:n.getStart(source),end:n.end,value:`{tr(${JSON.stringify(text)})}`});}
  if(ts.isJsxAttribute(n)&&n.initializer&&ts.isStringLiteral(n.initializer)&&['placeholder','aria-label','alt','title'].includes(n.name.getText(source))){edits.push({start:n.initializer.getStart(source),end:n.initializer.end,value:`{tr(${JSON.stringify(n.initializer.text)})}`});return;}
  if(ts.isJsxExpression(n)&&n.expression&&!ts.isJsxAttribute(n.parent)&&!ts.isJsxSpreadAttribute(n.parent)){const expr=n.expression.getText(source);if(!/name\(|\.name\b|\.alias\b|\.title\b|\.body\b|\.website\b|\.note\b|\.slug\b|\.tag\b|me\.user|notice\b|error\b|invite\b|recovery\b/.test(expr)&&![ts.SyntaxKind.ArrowFunction,ts.SyntaxKind.ObjectLiteralExpression].includes(n.expression.kind)){insert(n.expression.getStart(source),'tr(');insert(n.expression.end,')');}}
  ts.forEachChild(n,walk);
 }
 walk(source);edits.sort((a,b)=>b.start-a.start||b.end-a.end);let output=raw;for(const e of edits)output=output.slice(0,e.start)+e.value+output.slice(e.end);const firstImport=output.indexOf('import ');output=output.slice(0,firstImport)+"import {useTranslation,LanguageSwitch} from '@/lib/locale';\n"+output.slice(firstImport);fs.writeFileSync(file,output);
}
