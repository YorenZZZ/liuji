import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const skip = new Set(['.git','node_modules','dist','data','coverage']);
const walk = dir => readdirSync(dir).flatMap(name => {
  if (skip.has(name)) return [];
  const full = path.join(dir,name); const stat = lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error('Public source must not contain symlinks');
  return stat.isDirectory() ? walk(full) : [path.relative(root,full)];
});
let files;
try {
  if (execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() === root) files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
} catch {}
files ||= walk(root);
const forbidden = /(?:^|\/)(?:\.env(?!\.example$)|data\/|secrets\/|node_modules\/|dist\/)|\.sqlite(?:-|$)|\.pem$|\.key$|\/\._/;
const privateText = [/\/Users\/[A-Za-z][^\s/]*\//, /\/vol[0-9]+\/1000\//, /192\.168\.2\.22/, /happyzone\./, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:ghp|gho)_[A-Za-z0-9]{20,}/, /\bdckr_pat_[A-Za-z0-9_-]{20,}/, /\blj_[A-Za-z0-9_-]{40,}/];
const issues=[];
for(const file of files) {
  if(forbidden.test(file)) {issues.push(`${file}: private file`);continue;}
  if(lstatSync(file).isSymbolicLink()) {issues.push(`${file}: symlink`);continue;}
  const text=readFileSync(file,'utf8');
  if(privateText.some(pattern=>pattern.test(text))) issues.push(`${file}: private value pattern`);
}
if(issues.length) {console.error(issues.join('\n'));process.exit(1);}
console.log(`Public file check passed (${files.length} files).`);
