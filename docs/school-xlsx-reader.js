/* Excel import reader reused from Bright Nexa Smart Tools.
   XLSX first sheet only; formulas are not evaluated. No file data leaves browser. */
(function(root){
 'use strict';
 const n=x=>String(x??'');
 const E=root.BrightNexaSmart;
 if(!E||typeof E.parseCsv!=='function')throw Error('School CSV engine could not load.');
 async function xlsxRows(buffer){
 if(buffer.byteLength>4000000)throw Error('Maximum file size is 4 MB.');
 const d=new DataView(buffer),u=new Uint8Array(buffer);
 const u16=p=>d.getUint16(p,true),u32=p=>d.getUint32(p,true);
 if(buffer.byteLength<22||u32(0)!==0x04034b50)throw Error('Invalid XLSX/ZIP file.');
 let eocd=-1;
 for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){
  if(u32(i)===0x06054b50){eocd=i;break;}
 }
 if(eocd<0)throw Error('XLSX ZIP directory not found.');
 const decoder=new TextDecoder(),count=u16(eocd+10),start=u32(eocd+16);
 if(count>4000||start>=buffer.byteLength)throw Error('Unsupported Excel ZIP archive.');
 let offset=start;const entries=new Map();
 for(let j=0;j<count;j++){
  if(offset+46>buffer.byteLength||u32(offset)!==0x02014b50)throw Error('Corrupted XLSX directory.');
  const method=u16(offset+10),size=u32(offset+20),uncompressed=u32(offset+24),nameLen=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),local=u32(offset+42);
  const filename=decoder.decode(u.slice(offset+46,offset+46+nameLen));
  if(uncompressed>16000000||size>4000000)throw Error('Spreadsheet part too large.');
  entries.set(filename,{method,size,uncompressed,local});
  offset+=46+nameLen+extra+comment;
 }
 async function part(name){
  const e=entries.get(name);if(!e)return '';
  const p=e.local;
  if(p+30>buffer.byteLength||u32(p)!==0x04034b50)throw Error('Bad XLSX local header.');
  const start=p+30+u16(p+26)+u16(p+28),end=start+e.size;
  if(end>buffer.byteLength)throw Error('Corrupted XLSX content.');
  const bytes=u.slice(start,end);
  let output;
  if(e.method===0)output=bytes;
  else if(e.method===8&&typeof DecompressionStream==='function'){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    output=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw Error('This browser cannot open compressed XLSX. Save Excel as CSV and retry.');
  if(output.byteLength!==e.uncompressed||output.byteLength>16000000)throw Error('Corrupted or oversized Excel content.');
  return decoder.decode(output);
 }
 function xml(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Excel XML document contains unsupported entities.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid Excel XML.');
  return doc;
 }
 const stringsXml=await part('xl/sharedStrings.xml');
 const shared=stringsXml?[...xml(stringsXml).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const name=[...entries.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
 if(!name)throw Error('No standard Excel worksheet found.');
 const sheet=xml(await part(name));
 const rows=[],elems=[...sheet.getElementsByTagName('row')];
 if(elems.length>10001)throw Error('Maximum 10,000 Excel rows.');
 function indexFromCell(cell){
  const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'A';
  let n=0;for(const l of letters)n=n*26+l.charCodeAt(0)-64;return n-1;
 }
 for(const row of elems){
  const values=[];
  for(const c of row.getElementsByTagName('c')){
   const col=indexFromCell(c);if(col>63)throw Error('Maximum 64 columns.');
   const type=c.getAttribute('t');const v=c.getElementsByTagName('v')[0]?.textContent||'';
   values[col]=type==='s'?(shared[Number(v)]||''):type==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):type==='b'?(v==='1'?'TRUE':'FALSE'):v;
  }
  if(values.some(v=>n(v).trim()))rows.push(values);
 }
 if(rows.length<2)throw Error('First worksheet needs header and data.');
 const csv=rows.map(r=>Array.from({length:Math.max(rows[0].length,r.length)},(_,i)=>{
  const val=n(r[i]);return '"'+val.replace(/"/g,'""')+'"';
 }).join(',')).join('\n');
 return E.parseCsv(csv);
}
 root.BrightNexaSheetReader={read:xlsxRows};
})(globalThis);
