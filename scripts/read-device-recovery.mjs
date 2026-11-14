// Offline recovery reader. Passphrases are read from stdin, never command args.
import fs from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/read-device-recovery.mjs encrypted.json new-output.json (passphrase on stdin)');
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.replace(/\r?\n$/,'');
const blob=JSON.parse(await fs.readFile(input,'utf8'));
if(blob.format!=='bright-nexa-device-recovery-v1'||blob.iterations!==600000)throw Error('Unsupported recovery format');
const material=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:Buffer.from(blob.salt,'base64'),iterations:blob.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
const data=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(blob.nonce,'base64'),additionalData:new TextEncoder().encode(blob.format)},key,Buffer.from(blob.data,'base64'));
const records=JSON.parse(new TextDecoder().decode(data));
// Existing ciphertext inside a partially migrated export uses the original device
// passphrase; this reader intentionally preserves it and its salt/verifier.
await fs.writeFile(output,JSON.stringify(records,null,2),{flag:'wx',mode:0o600});
console.log('Recovery contents verified and written. Keep the output private; it can contain student records.');
