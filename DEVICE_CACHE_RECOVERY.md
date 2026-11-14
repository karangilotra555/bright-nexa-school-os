# Encrypted offline cache

The first updated ERP visit asks for a separate device passphrase of at least 12 characters. It encrypts existing browser school records and pending edits. Subsequent page visits require that passphrase. Logging out locks the key; pending edits remain encrypted. Supabase sign-in is unchanged.

Keep the passphrase safe. There is no server copy or password reset for this device key. Do not clear site data to bypass the prompt: unsent changes may exist only on this device.

## Storage-full recovery

Encryption increases storage size. A nearly full browser can reject migration. The app keeps the existing records and refuses to open a partially migrated workspace. In that case, use **Download encrypted device recovery** in the unlock dialog. This exports protected localStorage records and both IndexedDB stores without removing or changing their contents. Close other School OS tabs before exporting so they cannot change records during the export.

Retain the export passphrase and the original device passphrase if different. Verify the export before freeing any site storage. The offline reader requires Node.js 22 or later and takes the export passphrase through standard input, not a command-line argument:

```
node scripts/read-device-recovery.mjs school-device-recovery.encrypted.json private-recovery.json
```

Supply the passphrase on stdin and end input (Ctrl+Z then Enter in a Windows terminal). Prefer a secure stdin provider if terminal echo/history is a concern. The reader refuses to overwrite an existing output. It verifies the export's authentication tag and writes a private recovery inventory containing the exact original keys and database rows. Already encrypted rows remain encrypted and retain their original metadata. This is a recovery inventory, not an automatic cloud import; reconcile pending records before restoring them to the school's authoritative workspace.

Do not commit, upload publicly, or share the decrypted recovery file. A storage-full device remains locked until enough space is available for migration. Free unrelated origin storage only after verifying backups; never discard pending school records to make the migration pass.

## Release validation

Run `npm run build` for cache/auth regression tests and mirror/checksum verification. Browser-to-browser Supabase sync, real tenant permissions, and device-specific storage limits still require a disposable-school end-to-end check before production deployment.
