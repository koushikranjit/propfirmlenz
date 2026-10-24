const fs = require('fs');

const replacements = [
  // Hex values (case-insensitive)
  [/#00F0FF/gi, '#8F58FF'],
  [/#1EE7FC/gi, '#8F58FF'],
  [/#396DFA/gi, '#7936FF'],
  [/#38BDF8/gi, '#8F58FF'],
  [/#3B82F6/gi, '#7936FF'],
  [/#0099FF/gi, '#8F58FF'],
  [/#1890FF/gi, '#8F58FF'],
  [/#00E5FF/gi, '#8F58FF'],
  [/#00D2FF/gi, '#8F58FF'],
  [/#7CF2FF/gi, '#B388FF'],
  [/#8ab2ff/gi, '#C49BFF'],
  [/#071B25/gi, '#0D0D1C'],
  [/#041116/gi, '#0D0D1C'],
  [/#040D1A/gi, '#0D0D1C'],

  // RGBA variations (cyan & blue -> purple #8F58FF or #7936FF)
  [/rgba?\(\s*0\s*,\s*240\s*,\s*255\s*,/gi, 'rgba(143, 88, 255,'],
  [/rgba?\(\s*30\s*,\s*231\s*,\s*252\s*,/gi, 'rgba(143, 88, 255,'],
  [/rgba?\(\s*57\s*,\s*109\s*,\s*250\s*,/gi, 'rgba(121, 54, 255,'],
  [/rgba?\(\s*56\s*,\s*189\s*,\s*248\s*,/gi, 'rgba(143, 88, 255,'],
  [/rgba?\(\s*59\s*,\s*130\s*,\s*246\s*,/gi, 'rgba(121, 54, 255,'],
  [/rgba?\(\s*0\s*,\s*153\s*,\s*255\s*,/gi, 'rgba(143, 88, 255,'],
  [/rgba?\(\s*24\s*,\s*144\s*,\s*255\s*,/gi, 'rgba(143, 88, 255,']
];

function transformFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let totalReplaced = 0;

  for (const [pattern, replacement] of replacements) {
    const matches = content.match(pattern);
    if (matches) {
      totalReplaced += matches.length;
      content = content.replace(pattern, replacement);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Transformed:', filePath, '->', totalReplaced, 'replacements');
}

transformFile('D:/Projects/Prop Firm Lenz/src/app/clone.css');
transformFile('D:/Projects/Prop Firm Lenz/src/app/clone-body.html');
transformFile('D:/Projects/Prop Firm Lenz/public/clone-app.js');
