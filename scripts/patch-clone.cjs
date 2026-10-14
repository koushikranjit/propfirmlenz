const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\koush\\Downloads\\Prop Firm Match Clone (1).html';
let content = fs.readFileSync(srcPath, 'utf8');

console.log('Original content length:', content.length);

// 1. Fix logoSource to prioritize TRUSTPILOT_FIRMS embedded base64 logo!
const newLogoSource = [
  'const logoSource=n=>{',
  '  if(!n) return \'\';',
  '  const clean=(n||\'\').trim();',
  '  const dir=TRUSTPILOT_FIRMS.find(f=>f.name===clean || f.name.toLowerCase()===clean.toLowerCase());',
  '  if(dir?.logo && dir.logo.startsWith(\'data:\')) return dir.logo;',
  '  const baseName=clean.replace(/\\s+(Futures|Crypto)$/i,\'\').trim();',
  '  const baseDir=TRUSTPILOT_FIRMS.find(f=>f.name===baseName || f.name.toLowerCase()===baseName.toLowerCase());',
  '  if(baseDir?.logo && baseDir.logo.startsWith(\'data:\')) return baseDir.logo;',
  '  const mapped=logoFiles[clean]||logoFiles[baseName];',
  '  if(mapped && mapped.startsWith(\'data:\')) return mapped;',
  '  return dir?.logo || \'\';',
  '};'
].join('\n');

const logoSourceRegex = /const logoSource=n=>\{[\s\S]*?return dir\?\.logo \|\| '';[\s\S]*?\};|const logoSource=n=>\{[^}]+mapped[^}]+\};/;
if (logoSourceRegex.test(content)) {
  content = content.replace(logoSourceRegex, newLogoSource);
  console.log('Replaced logoSource!');
} else {
  console.log('logoSource already updated or not found');
}

// 2. Fix platformIcon to use SVG badges instead of missing png files
const newPlatformCode = [
  'const platformSvgs={',
  '  \'cTrader\': \'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#E65100"/><text x="12" y="15" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold" font-family="sans-serif">cTr</text></svg>\',',
  '  \'MT5\': \'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#1B75BC"/><text x="12" y="15" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="sans-serif">MT5</text></svg>\',',
  '  \'MT4\': \'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#005A9C"/><text x="12" y="15" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="sans-serif">MT4</text></svg>\',',
  '  \'Match-Trader\': \'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#7B1FA2"/><text x="12" y="15" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold" font-family="sans-serif">M-T</text></svg>\',',
  '  \'DXtrade\': \'<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#2E7D32"/><text x="12" y="15" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="sans-serif">DX</text></svg>\'',
  '};',
  'const platformIcon=p=>{const svg=platformSvgs[p];return svg?`<span class="platform" title="${p}" aria-label="${p}">${svg}</span>`:\'\';};'
].join('\n');

const platformTargetRegex = /const platformFiles=\{[\s\S]*?\};\s*const platformIcon=p=>\{[\s\S]*?\};/;
if (platformTargetRegex.test(content)) {
  content = content.replace(platformTargetRegex, newPlatformCode);
  console.log('Successfully replaced platformFiles and platformIcon!');
} else {
  console.log('platformTargetRegex did not match, trying substring...');
}

// 3. Fix country flags to use FlagCDN
content = content.replaceAll('assets/flags/${f.flag}.png', 'https://flagcdn.com/24x18/${(f.flag||\'\').toLowerCase()}.png');
content = content.replaceAll('assets/flags/${', 'https://flagcdn.com/24x18/${');

// 4. Fix YouTube video thumbnails
content = content.replaceAll('assets/video-thumbnails/${v[1]}.jpg', 'https://img.youtube.com/vi/${v[1]}/hqdefault.jpg');
content = content.replaceAll('assets/video-thumbnails/${', 'https://img.youtube.com/vi/${');

// Write out the workable build to the target file and also to public/
const outputPath = 'C:\\Users\\koush\\Downloads\\Prop Firm Match Clone (1).html';
fs.writeFileSync(outputPath, content, 'utf8');
console.log('Updated original file at:', outputPath);

// Also write to public/clone.html in the project
const publicClonePath = path.resolve(__dirname, '..', 'public', 'clone.html');
fs.writeFileSync(publicClonePath, content, 'utf8');
console.log('Wrote copy to:', publicClonePath);

