import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const directory of ['server', 'scripts', 'test']) {
  for (const file of readdirSync(directory).filter(file => file.endsWith('.mjs'))) execFileSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
}
console.log('JavaScript syntax checked; JSX is checked by npm run build.');
