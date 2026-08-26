const fs = require('fs');
const content = fs.readFileSync('api/index.js', 'utf8');
console.log('includes tty:', content.includes('tty'));
const reqMatches = content.match(/require\(['"]tty['"]\)/g);
console.log('require tty matches:', reqMatches ? reqMatches.length : 0);
const impMatches = content.match(/import.*tty/g);
console.log('import tty matches:', impMatches ? impMatches.length : 0);

// Search for dynamic require
const dynMatches = content.match(/require\([^)]*tty[^)]*\)/g);
console.log('dynamic require tty:', dynMatches ? dynMatches.length : 0);

// Find all occurrences of 'tty' and show context
let idx = content.indexOf('tty');
while (idx >= 0) {
  console.log(`Found at ${idx}: ...${content.substring(Math.max(0, idx-50), idx+50)}...`);
  idx = content.indexOf('tty', idx + 1);
}