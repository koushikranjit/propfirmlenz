const fs = require('fs');
const path = require('path');

const rawCss = fs.readFileSync(path.join(__dirname, '../src/app/clone.css'), 'utf8');
const css = rawCss.replaceAll("url('/assets/logo-mark.png')", "url('assets/logo-mark.png')");
const body = fs.readFileSync(path.join(__dirname, '../src/app/clone-body.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/clone-app.js'), 'utf8');

const htmlContent = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="artifact-revision" content="firm-profile-reference-layout-2026-10-08b">
<meta name="color-scheme" content="dark">
<title>Prop Firm Lenz — Compare Prop Trading Firms</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body data-market-theme="forex">
${body}
<script>
${js}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../public/index.html'), htmlContent, 'utf8');
fs.writeFileSync(path.join(__dirname, '../public/clone.html'), htmlContent, 'utf8');
console.log('Successfully synchronized public/index.html and public/clone.html');

