import {readFile,glob} from 'node:fs/promises';
import {parse} from '@vue/compiler-sfc';
const root=new URL('../',import.meta.url),dictionary=JSON.parse(await readFile(new URL('src/locale-en.json',root),'utf8'));
const missing=new Set();
for await(const path of glob('src/**/*.vue',{cwd:root})){
 const source=await readFile(new URL(path.replaceAll('\\','/'),root),'utf8');
 const {descriptor}=parse(source);
 for(const match of(descriptor.template?.content||'').matchAll(/\bt\((['"])(.*?)\1/g)){
  if(/[\u3400-\u9fff]/.test(match[2])&&!dictionary[match[2]])missing.add(match[2]);
 }
}
for(const [source,target]of Object.entries(dictionary)){
 const tokens=value=>[...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort().join(',');
 if(tokens(source)!==tokens(target))throw new Error('Translation placeholders differ');
}
console.log(JSON.stringify({englishEntries:Object.keys(dictionary).length,missing:[...missing]}));if(missing.size)process.exitCode=1;
