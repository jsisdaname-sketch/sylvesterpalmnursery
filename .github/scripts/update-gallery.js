
  #!/usr/bin/env node
  'use strict';

  const fs = require('fs');
  const path = require('path');
                                        
  const GALLERY_DIR = path.join('SylvesterPalm', 'images', 'gallery');
  const INDEX_HTML  = path.join('SylvesterPalm', 'index.html');
  const VALID_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
  const PER_LINE    = 3;
  const START       = '// GALLERY_START';
  const END         = '// GALLERY_END';
  
  // Natural sort: pad digit runs so lexicographic order matches numeric order.
  // Uses direct < / > comparison (not localeCompare) for predictable ASCII ordering.
  function naturalCompare(a, b) {
    const pad = s => s.replace(/(\d+)/g, m => m.padStart(20, '0')).toLowerCase();
    const pa = pad(a), pb = pad(b);
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    return 0;
  }
                                        
  // Read gallery directory
  if (!fs.existsSync(GALLERY_DIR)) {
    console.error('ERROR: Gallery directory not found:', GALLERY_DIR);
    process.exit(1);
  }
  
  const files = fs.readdirSync(GALLERY_DIR)
    .filter(f => VALID_EXTS.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare);
  
  if (files.length === 0) {             
    console.log('Gallery folder is empty — nothing to update.');
    process.exit(0);
  }

  // Read index.html
  let html = fs.readFileSync(INDEX_HTML, 'utf8');

  // Auto-add markers if missing (initial setup fallback)
  if (!html.includes(START)) {
    console.log('Markers not found — adding GALLERY_START / GALLERY_END markers...');
    html = html.replace(
      /(const palms=\[[\s\S]*?\];)/,
      `${START}\n$1\n${END}`
    );                                  
    if (!html.includes(START)) {
      console.error('ERROR: Could not locate the gallery array in index.html to add markers.');
      process.exit(1);                  
    }
  }

  const startIdx = html.indexOf(START);
  const endIdx   = html.indexOf(END);   

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    console.error('ERROR: GALLERY_START / GALLERY_END markers are malformed in index.html.');
    process.exit(1);
  }
                                        
  // Extract filenames already in the array for diffing
  const between = html.slice(startIdx + START.length, endIdx);
  const existingFiles = new Set(
    (between.match(/images\/gallery\/([^"]+)/g) || [])
      .map(m => decodeURIComponent(m.replace('images/gallery/', '')))
  );

  const newFiles    = files.filter(f => !existingFiles.has(f));
  const beforeCount = existingFiles.size;
                                        
  // Build array entries — encode spaces in filenames for safe use in HTML
  const entries = files.map(f => `{img:"images/gallery/${f.replace(/ /g, '%20')}"}`);

  // Format PER_LINE entries per line
  const lines = [];                     
  for (let i = 0; i < entries.length; i += PER_LINE) {
    lines.push('  ' + entries.slice(i, i + PER_LINE).join(','));
  }
  const newArray = `const palms=[\n${lines.join(',\n')}\n];`;

  // Splice the new array between the markers
  html = html.slice(0, startIdx + START.length) + '\n' + newArray + '\n' + html.slice(endIdx);
  
  fs.writeFileSync(INDEX_HTML, html, 'utf8');

  // Report
  console.log(`Gallery updated: ${beforeCount} → ${files.length} photo${files.length === 1 ? '' : 's'}`);
  if (newFiles.length > 0) {            
    console.log(`New photo${newFiles.length === 1 ? '' : 's'} added (${newFiles.length}):`);
    newFiles.forEach(f => console.log(`  + ${f}`));
  } else {
    console.log('No new photos detected — array regenerated from current gallery folder.');
  }
  
