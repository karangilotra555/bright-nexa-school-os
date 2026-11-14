'use strict';
const esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
esbuild.buildSync({entryPoints:[path.join(root,'src/security/private-cache.mjs')],bundle:true,format:'iife',target:'es2022',outfile:path.join(root,'school-private-cache.js'),legalComments:'eof'});
for(const dir of ['docs','app-extracted/dist'])fs.copyFileSync(path.join(root,'school-private-cache.js'),path.join(root,dir,'school-private-cache.js'));
