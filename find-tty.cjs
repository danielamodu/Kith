const fs = require('fs');
const content = fs.readFileSync('api/index.js', 'utf8');
const idx = content.indexOf("require('tty')");
console.log('index:', idx);
if (idx >= 0) {
  console.log(content.substring(Math.max(0, idx-100), idx+100));
}