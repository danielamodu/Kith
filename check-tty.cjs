const fs = require('fs');
const content = fs.readFileSync('api/index.js', 'utf8');
console.log('includes tty:', content.includes('tty'));
const matches = content.match(/require\(['"]tty['"]\)/g);
console.log('require tty matches:', matches ? matches.length : 0);