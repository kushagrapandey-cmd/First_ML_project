await import('./prepare-model.mjs');
import {build} from 'esbuild';
await build({entryPoints:['src/auth-sdk.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'public/auth-sdk.js',minify:true,legalComments:'eof'});
console.log('Auth browser bundle built.');
await import('./migrate.mjs');

await import('./verify-cloud.mjs');
