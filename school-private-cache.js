(() => {
  // ../../19347191f4e8/school-review/node_modules/@noble/ciphers/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  var atitle = (title) => title ? `"${title}" ` : "";
  function abool(value, title = "") {
    if (typeof value !== "boolean")
      throw new TypeError(atitle(title) + "expected boolean, got type=" + typeof value);
    return value;
  }
  function anumber(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes(value, length, title = "") {
    if (isBytes(value) && (length === void 0 || value.length === length))
      return value;
    if (length !== void 0)
      anumber(length, "length");
    const bytes2 = isBytes(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes2 ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes2)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function aoutput32(out, instance) {
    aoutput(out, instance);
    if (!isAligned32(out))
      throw new Error("invalid output, must be aligned");
  }
  function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  var swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n) >>> 0;
  function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  var swap32IfBE = isLE ? (u) => u : byteSwap32;
  function equalBytes(a, b) {
    a = abytes(a);
    b = abytes(b);
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function wrapMacConstructor(keyLen, macCons, fromMsg) {
    const mac = macCons;
    const getArgs = fromMsg || (() => []);
    const macC = (msg, key) => mac(key, ...getArgs(msg)).update(msg).digest();
    const tmp = mac(new Uint8Array(keyLen), ...getArgs(new Uint8Array(0)));
    macC.outputLen = tmp.outputLen;
    macC.blockLen = tmp.blockLen;
    macC.create = (key, ...args) => mac(key, ...args);
    return macC;
  }
  var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
    function wrappedCipher(key, ...args) {
      abytes(key, void 0, "key");
      if (params.nonceLength !== void 0) {
        const nonce = args[0];
        abytes(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
      }
      const tagl = params.tagLength;
      const aadStart = params.nonceLength !== void 0 ? 1 : 0;
      if (!params.withAAD) {
        for (let i = aadStart; i < args.length; i++)
          if (isBytes(args[i]))
            throw new Error("AAD not supported");
      }
      if (params.withAAD && args[aadStart] !== void 0)
        abytes(args[aadStart], void 0, "AAD");
      const cipher = constructor(key, ...args);
      const checkOutput = (fnLength, output) => {
        if (output !== void 0) {
          if (fnLength !== 2)
            throw new Error("cipher output not supported");
          abytes(output, void 0, "output");
        }
      };
      let called = false;
      const wrCipher = {
        encrypt(data, output) {
          if (called)
            throw new Error("cannot encrypt() twice with same key + nonce");
          called = true;
          abytes(data, void 0, "data");
          checkOutput(cipher.encrypt.length, output);
          return cipher.encrypt(data, output);
        },
        decrypt(data, output) {
          abytes(data, void 0, "data");
          if (tagl && data.length < tagl)
            throw new Error('"ciphertext" expected length >= tagLength=' + tagl);
          checkOutput(cipher.decrypt.length, output);
          return cipher.decrypt(data, output);
        }
      };
      return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
  };
  function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === void 0)
      return new Uint8Array(expectedLength);
    abytes(out, expectedLength, "output");
    if (onlyAligned && !isAligned32(out))
      throw new Error("invalid output, must be aligned");
    return out;
  }
  function u64Lengths(dataLength, aadLength, isLE2) {
    anumber(dataLength);
    anumber(aadLength);
    abool(isLE2);
    const num = new Uint8Array(16);
    const view = createView(num);
    view.setBigUint64(0, BigInt(aadLength), isLE2);
    view.setBigUint64(8, BigInt(dataLength), isLE2);
    return num;
  }
  function isAligned32(bytes2) {
    return bytes2.byteOffset % 4 === 0;
  }
  function copyBytes(bytes2) {
    return Uint8Array.from(abytes(bytes2));
  }

  // ../../19347191f4e8/school-review/node_modules/@noble/ciphers/_polyval.js
  var BLOCK_SIZE = 16;
  var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  var ZEROS32 = /* @__PURE__ */ u32(ZEROS16);
  var POLY = 225;
  var mul2 = (s0, s1, s2, s3) => {
    const hiBit = s3 & 1;
    return {
      s3: s2 << 31 | s3 >>> 1,
      s2: s1 << 31 | s2 >>> 1,
      s1: s0 << 31 | s1 >>> 1,
      // NIST SP 800-38D §6.3 applies `V >> 1` and XORs R on carry. In this
      // 4x32-bit split, R = 0xe1 || 0^120 lives in the top byte of s0.
      s0: s0 >>> 1 ^ POLY << 24 & -(hiBit & 1)
      // reduce % poly
    };
  };
  var swapLE = (n) => (n >>> 0 & 255) << 24 | (n >>> 8 & 255) << 16 | (n >>> 16 & 255) << 8 | n >>> 24 & 255 | 0;
  var estimateWindow = (bytes2) => {
    if (bytes2 > 64 * 1024)
      return 8;
    if (bytes2 > 1024)
      return 4;
    return 2;
  };
  var GHASH = class {
    blockLen = BLOCK_SIZE;
    outputLen = BLOCK_SIZE;
    s0 = 0;
    s1 = 0;
    s2 = 0;
    s3 = 0;
    finished = false;
    destroyed = false;
    t;
    W;
    windowSize;
    // We select bits per window adaptively based on expectedLength
    constructor(key, expectedLength) {
      abytes(key, 16, "key");
      key = copyBytes(key);
      const kView = createView(key);
      let k0 = kView.getUint32(0, false);
      let k1 = kView.getUint32(4, false);
      let k2 = kView.getUint32(8, false);
      let k3 = kView.getUint32(12, false);
      const doubles = [];
      for (let i = 0; i < 128; i++) {
        doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
        ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2(k0, k1, k2, k3));
      }
      const W = estimateWindow(expectedLength || 1024);
      if (![1, 2, 4, 8].includes(W))
        throw new Error("ghash: invalid window size, expected 2, 4 or 8");
      this.W = W;
      const bits = 128;
      const windows = bits / W;
      const windowSize = this.windowSize = 2 ** W;
      const items = [];
      for (let w = 0; w < windows; w++) {
        for (let byte = 0; byte < windowSize; byte++) {
          let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
          for (let j = 0; j < W; j++) {
            const bit = byte >>> W - j - 1 & 1;
            if (!bit)
              continue;
            const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
            s0 ^= d0, s1 ^= d1, s2 ^= d2, s3 ^= d3;
          }
          items.push({ s0, s1, s2, s3 });
        }
      }
      this.t = items;
    }
    _updateBlock(s0, s1, s2, s3) {
      s0 ^= this.s0, s1 ^= this.s1, s2 ^= this.s2, s3 ^= this.s3;
      const { W, t, windowSize } = this;
      let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
      const mask = (1 << W) - 1;
      let w = 0;
      for (const num of [s0, s1, s2, s3]) {
        for (let bytePos = 0; bytePos < 4; bytePos++) {
          const byte = num >>> 8 * bytePos & 255;
          for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
            const bit = byte >>> W * bitPos & mask;
            const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
            o0 ^= e0, o1 ^= e1, o2 ^= e2, o3 ^= e3;
            w += 1;
          }
        }
      }
      this.s0 = o0;
      this.s1 = o1;
      this.s2 = o2;
      this.s3 = o3;
    }
    update(data) {
      aexists(this);
      abytes(data);
      data = copyBytes(data);
      const b32 = u32(data);
      const blocks = Math.floor(data.length / BLOCK_SIZE);
      const left = data.length % BLOCK_SIZE;
      for (let i = 0; i < blocks; i++) {
        this._updateBlock(swap8IfBE(b32[i * 4 + 0]), swap8IfBE(b32[i * 4 + 1]), swap8IfBE(b32[i * 4 + 2]), swap8IfBE(b32[i * 4 + 3]));
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
        this._updateBlock(swap8IfBE(ZEROS32[0]), swap8IfBE(ZEROS32[1]), swap8IfBE(ZEROS32[2]), swap8IfBE(ZEROS32[3]));
        clean(ZEROS32);
      }
      return this;
    }
    destroy() {
      this.destroyed = true;
      const { t } = this;
      for (const elm of t) {
        elm.s0 = 0, elm.s1 = 0, elm.s2 = 0, elm.s3 = 0;
      }
    }
    digestInto(out) {
      aexists(this);
      aoutput32(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      if (!isLE)
        swap32IfBE(o32.subarray(0, BLOCK_SIZE / 4));
    }
    digest() {
      const res = new Uint8Array(BLOCK_SIZE);
      this.digestInto(res);
      this.destroy();
      return res;
    }
  };
  var ghash = /* @__PURE__ */ wrapMacConstructor(16, (key, expectedLength) => new GHASH(key, expectedLength), (msg) => [msg.length]);

  // ../../19347191f4e8/school-review/node_modules/@noble/ciphers/aes.js
  var BLOCK_SIZE2 = 16;
  var BLOCK_SIZE32 = 4;
  var EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE2);
  var POLY2 = 283;
  function validateKeyLength(key) {
    if (![16, 24, 32].includes(key.length))
      throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
  }
  function mul22(n) {
    return n << 1 ^ POLY2 & -(n >> 7);
  }
  function mul(a, b) {
    let res = 0;
    for (; b > 0; b >>= 1) {
      res ^= a & -(b & 1);
      a = mul22(a);
    }
    return res;
  }
  var sbox = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i = 0, x = 1; i < 256; i++, x ^= mul22(x))
      t[i] = x;
    const box = new Uint8Array(256);
    box[0] = 99;
    for (let i = 0; i < 255; i++) {
      let x = t[255 - i];
      x |= x << 8;
      box[t[i]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
    }
    clean(t);
    return box;
  })();
  var rotr32_8 = (n) => n << 24 | n >>> 8;
  var rotl32_8 = (n) => n << 8 | n >>> 24;
  function genTtable(sbox2, fn) {
    if (sbox2.length !== 256)
      throw new Error("wrong sbox length");
    const T0 = new Uint32Array(256).map((_, j) => fn(sbox2[j]));
    const T1 = T0.map(rotl32_8);
    const T2 = T1.map(rotl32_8);
    const T3 = T2.map(rotl32_8);
    const T01 = new Uint32Array(256 * 256);
    const T23 = new Uint32Array(256 * 256);
    const sbox22 = new Uint16Array(256 * 256);
    for (let i = 0; i < 256; i++) {
      for (let j = 0; j < 256; j++) {
        const idx = i * 256 + j;
        T01[idx] = T0[i] ^ T1[j];
        T23[idx] = T2[i] ^ T3[j];
        sbox22[idx] = sbox2[i] << 8 | sbox2[j];
      }
    }
    return { sbox: sbox2, sbox2: sbox22, T0, T1, T2, T3, T01, T23 };
  }
  var tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
  var xPowers = /* @__PURE__ */ (() => {
    const p = new Uint8Array(16);
    for (let i = 0, x = 1; i < 16; i++, x = mul22(x))
      p[i] = x;
    return p;
  })();
  function expandKeyLE(key) {
    abytes(key);
    const len = key.length;
    validateKeyLength(key);
    const { sbox2 } = tableEncoding;
    const toClean = [];
    if (!isLE || !isAligned32(key))
      toClean.push(key = copyBytes(key));
    const k32 = swap32IfBE(u32(key));
    const Nk = k32.length;
    const subByte = (n) => applySbox(sbox2, n, n, n, n);
    const xk = new Uint32Array(len + 28);
    xk.set(k32);
    for (let i = Nk; i < xk.length; i++) {
      let t = xk[i - 1];
      if (i % Nk === 0)
        t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
      else if (Nk > 6 && i % Nk === 4)
        t = subByte(t);
      xk[i] = xk[i - Nk] ^ t;
    }
    clean(...toClean);
    return xk;
  }
  function apply0123(T01, T23, s0, s1, s2, s3) {
    return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
  }
  function applySbox(sbox2, s0, s1, s2, s3) {
    return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
  }
  function encrypt(xk, s0, s1, s2, s3) {
    const { sbox2, T01, T23 } = tableEncoding;
    let k = 0;
    s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
    const rounds = xk.length / 4 - 2;
    for (let i = 0; i < rounds; i++) {
      const t02 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
      const t12 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
      const t22 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
      const t32 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
      s0 = t02, s1 = t12, s2 = t22, s3 = t32;
    }
    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  }
  function ctr32(xk, isLE2, nonce, src, dst) {
    abytes(nonce, BLOCK_SIZE2, "nonce");
    abytes(src);
    dst = getOutput(src.length, dst);
    const ctr = nonce;
    const c32 = u32(ctr);
    const view = createView(ctr);
    const src32 = u32(src);
    const dst32 = u32(dst);
    const ctrPos = isLE2 ? 0 : 12;
    const srcLen = src.length;
    let ctrNum = view.getUint32(ctrPos, isLE2);
    for (let i = 0; i + 4 <= src32.length; i += 4) {
      const { s0, s1, s2, s3 } = encrypt(xk, swap8IfBE(c32[0]), swap8IfBE(c32[1]), swap8IfBE(c32[2]), swap8IfBE(c32[3]));
      dst32[i + 0] = src32[i + 0] ^ swap8IfBE(s0);
      dst32[i + 1] = src32[i + 1] ^ swap8IfBE(s1);
      dst32[i + 2] = src32[i + 2] ^ swap8IfBE(s2);
      dst32[i + 3] = src32[i + 3] ^ swap8IfBE(s3);
      ctrNum = ctrNum + 1 >>> 0;
      view.setUint32(ctrPos, ctrNum, isLE2);
    }
    const start = BLOCK_SIZE2 * Math.floor(src32.length / BLOCK_SIZE32);
    if (start < srcLen) {
      const { s0, s1, s2, s3 } = encrypt(xk, swap8IfBE(c32[0]), swap8IfBE(c32[1]), swap8IfBE(c32[2]), swap8IfBE(c32[3]));
      const b32 = new Uint32Array([s0, s1, s2, s3]);
      swap32IfBE(b32);
      const buf = u8(b32);
      for (let i = start, pos = 0; i < srcLen; i++, pos++)
        dst[i] = src[i] ^ buf[pos];
      clean(b32);
    }
    return dst;
  }
  function computeTag(fn, isLE2, key, data, AAD) {
    const aadLength = AAD ? AAD.length : 0;
    const h = fn.create(key, data.length + aadLength);
    if (AAD)
      h.update(AAD);
    const num = u64Lengths(8 * data.length, 8 * aadLength, isLE2);
    h.update(data);
    h.update(num);
    const res = h.digest();
    clean(num);
    return res;
  }
  var gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, withAAD: true, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
    if (nonce.length < 8)
      throw new Error("aes/gcm: invalid nonce length");
    const tagLength = 16;
    function _computeTag(authKey, tagMask, data) {
      const tag = computeTag(ghash, false, authKey, data, AAD);
      for (let i = 0; i < tagMask.length; i++)
        tag[i] ^= tagMask[i];
      return tag;
    }
    function deriveKeys() {
      const xk = expandKeyLE(key);
      const authKey = EMPTY_BLOCK.slice();
      const counter = EMPTY_BLOCK.slice();
      ctr32(xk, false, counter, counter, authKey);
      if (nonce.length === 12) {
        counter.set(nonce);
      } else {
        const nonceLen = EMPTY_BLOCK.slice();
        const view = createView(nonceLen);
        view.setBigUint64(8, BigInt(nonce.length * 8), false);
        const g = ghash.create(authKey).update(nonce).update(nonceLen);
        g.digestInto(counter);
        g.destroy();
      }
      const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
      return { xk, authKey, counter, tagMask };
    }
    return {
      encrypt(plaintext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const out = new Uint8Array(plaintext.length + tagLength);
        const toClean = [xk, authKey, counter, tagMask];
        if (!isAligned32(plaintext))
          toClean.push(plaintext = copyBytes(plaintext));
        ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
        const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
        toClean.push(tag);
        out.set(tag, plaintext.length);
        clean(...toClean);
        return out;
      },
      decrypt(ciphertext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const toClean = [xk, authKey, tagMask, counter];
        if (!isAligned32(ciphertext))
          toClean.push(ciphertext = copyBytes(ciphertext));
        const data = ciphertext.subarray(0, -tagLength);
        const passedTag = ciphertext.subarray(-tagLength);
        const tag = _computeTag(authKey, tagMask, data);
        toClean.push(tag);
        if (!equalBytes(tag, passedTag)) {
          clean(...toClean);
          throw new Error("aes-gcm: invalid tag");
        }
        const out = ctr32(xk, false, counter, data);
        clean(...toClean);
        return out;
      }
    };
  });

  // src/security/private-cache.mjs
  var META = "bn.private-cache.v1";
  var ITERATIONS = 6e5;
  var DATABASE_TIMEOUT_MS = 2e4;
  var CRYPTO_TIMEOUT_MS = 15e3;
  var DATABASES = [["bright-nexa-school-os", "records"], ["bn-workspace-recovery-v1", "backups"]];
  var BLOCKED = "Close other School OS tabs, then retry.";
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var protectedKey = (k) => k.startsWith("bright-nexa-school-os:") || k.startsWith("bn.workspace.v1.") || k === "school_admin_token";
  function base64(bytes2) {
    let s = "";
    for (let i = 0; i < bytes2.length; i += 8192) s += String.fromCharCode(...bytes2.subarray(i, i + 8192));
    return btoa(s);
  }
  function bytes(s) {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  function createPrivateCache({ storage: raw, indexedDB, crypto, timeoutMs = DATABASE_TIMEOUT_MS, cryptoTimeoutMs = CRYPTO_TIMEOUT_MS }) {
    async function runCrypto(operation, timeoutMessage, discard = () => {
    }) {
      let timer, expired = false;
      const check = () => {
        if (expired) throw Error(timeoutMessage);
      };
      const work = Promise.resolve().then(() => operation(check)).then((value) => {
        if (expired) {
          discard(value);
          throw Error(timeoutMessage);
        }
        return value;
      });
      try {
        return await Promise.race([work, new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(Error(timeoutMessage));
          }, cryptoTimeoutMs);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }
    let key = null, ready = false, generation = 0;
    function requireKey() {
      if (!key) throw Error("Device records are locked. Unlock with the device passphrase.");
    }
    function seal(value, context) {
      requireKey();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      return { bnEncrypted: 1, nonce: base64(nonce), data: base64(gcm(key, nonce, enc.encode(context)).encrypt(enc.encode(JSON.stringify(value)))) };
    }
    function open(value, context) {
      requireKey();
      if (value?.bnEncrypted !== 1) throw Error("Unencrypted device record detected. Reload to migrate it safely.");
      return JSON.parse(dec.decode(gcm(key, bytes(value.nonce), enc.encode(context)).decrypt(bytes(value.data))));
    }
    function lock() {
      generation++;
      ready = false;
      if (key) key.fill(0);
      key = null;
    }
    async function migrateLocal(attempt) {
      const keys = Array.from({ length: raw.length }, (_, i) => raw.key(i)).filter((k) => k && protectedKey(k));
      for (const k of keys) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (attempt !== generation) throw Error("Device unlock was cancelled. Retry.");
        const old = raw.getItem(k);
        if (old === null) continue;
        let parsed;
        try {
          parsed = JSON.parse(old);
        } catch {
        }
        if (parsed?.bnEncrypted === 1) {
          open(parsed, "local:" + k);
          continue;
        }
        const replacement = JSON.stringify(seal(old, "local:" + k));
        if (open(JSON.parse(replacement), "local:" + k) !== old) throw Error("Device migration verification failed.");
        raw.setItem(k, replacement);
        if (raw.getItem(k) !== replacement) throw Error("Device migration write failed.");
      }
    }
    function scanDatabase(name, store, mode, visit) {
      return new Promise((resolve, reject) => {
        let request, db, tx, timer, finished = false;
        function watchProgress() {
          clearTimeout(timer);
          timer = setTimeout(() => fail(Error("Device storage timed out. " + BLOCKED)), timeoutMs);
        }
        watchProgress();
        function finish(error) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (error && tx) {
            try {
              tx.abort();
            } catch {
            }
          }
          db?.close();
          if (error) reject(error);
          else resolve();
        }
        function fail(error) {
          finish(error || Error("Unable to read device storage. " + BLOCKED));
        }
        try {
          request = indexedDB.open(name, 1);
        } catch (error) {
          fail(error);
          return;
        }
        request.onblocked = () => fail(Error("Device storage is busy. " + BLOCKED));
        request.onerror = () => fail(request.error);
        request.onupgradeneeded = () => {
          if (finished) {
            request.transaction.abort();
            return;
          }
          try {
            request.result.createObjectStore(store);
          } catch (error) {
            request.transaction.abort();
            fail(error);
          }
        };
        request.onsuccess = () => {
          if (finished) {
            request.result.close();
            return;
          }
          db = request.result;
          watchProgress();
          try {
            tx = db.transaction(store, mode);
            tx.oncomplete = () => finish();
            tx.onabort = tx.onerror = () => fail(tx.error);
            const cursor = tx.objectStore(store).openCursor();
            cursor.onerror = () => fail(cursor.error);
            cursor.onsuccess = () => {
              if (finished) return;
              watchProgress();
              const row = cursor.result;
              if (!row) return;
              try {
                visit(row);
                row.continue();
              } catch (error) {
                fail(error);
              }
            };
          } catch (error) {
            fail(error);
          }
        };
      });
    }
    function migrateDatabase(name, store, attempt) {
      return scanDatabase(name, store, "readwrite", (row) => {
        if (attempt !== generation) throw Error("Device unlock was cancelled. Retry.");
        const context = store + ":" + row.key;
        if (row.value?.bnEncrypted === 1) {
          open(row.value, context);
          return;
        }
        const replacement = seal(row.value, context);
        if (JSON.stringify(open(replacement, context)) !== JSON.stringify(row.value)) throw Error("Device migration verification failed.");
        row.update(replacement);
      });
    }
    async function unlock(passphrase, progress = () => {
    }) {
      lock();
      const attempt = generation;
      if (typeof passphrase !== "string" || passphrase.length < 12) throw Error("Use a device passphrase of at least 12 characters.");
      const original = raw.getItem(META);
      const metadata = original ? JSON.parse(original) : { version: 1, salt: base64(crypto.getRandomValues(new Uint8Array(16))), iterations: ITERATIONS };
      if (metadata.version !== 1 || metadata.iterations !== ITERATIONS) throw Error("Unsupported device encryption settings. Records were retained.");
      progress("Verifying device passphrase\u2026");
      const derived = await runCrypto(async (check) => {
        const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
        check();
        return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytes(metadata.salt), iterations: ITERATIONS }, material, 256));
      }, "Device passphrase verification timed out. Retry or restart this browser.", (value) => value.fill(0));
      if (attempt !== generation) {
        derived.fill(0);
        throw Error("Device unlock was cancelled. Retry.");
      }
      key = derived;
      try {
        if (raw.getItem(META) !== original) throw Error("Another tab configured device encryption. Retry with its passphrase.");
        if (original) {
          let verified;
          try {
            verified = open(metadata.check, "verifier");
          } catch {
            throw Error("Device passphrase could not be verified");
          }
          if (verified !== "Bright Nexa device cache") throw Error("Device passphrase could not be verified");
        } else {
          metadata.check = seal("Bright Nexa device cache", "verifier");
          raw.setItem(META, JSON.stringify(metadata));
        }
        for (const [name, store] of DATABASES) {
          progress(store === "records" ? "Opening offline school records\u2026" : "Opening pending-change backups\u2026");
          if (attempt !== generation) throw Error("Device unlock was cancelled. Retry.");
          await migrateDatabase(name, store, attempt);
        }
        if (attempt !== generation) throw Error("Device unlock was cancelled. Retry.");
        progress("Checking local records\u2026");
        await migrateLocal(attempt);
        if (attempt !== generation) throw Error("Device unlock was cancelled. Retry.");
        ready = true;
      } catch (error) {
        if (attempt === generation) lock();
        throw error;
      }
    }
    async function exportRecovery(passphrase, progress = () => {
    }) {
      if (typeof passphrase !== "string" || passphrase.length < 12) throw Error("Use a recovery passphrase of at least 12 characters.");
      progress("Reading device records for recovery\u2026");
      const records = { format: "bright-nexa-device-recovery-v1", local: {}, databases: {} };
      for (let i = 0; i < raw.length; i++) {
        const k = raw.key(i);
        if (k && (protectedKey(k) || k === META)) records.local[k] = raw.getItem(k);
      }
      for (const [name, store] of DATABASES) {
        const rows = [];
        await scanDatabase(name, store, "readonly", (row) => rows.push({ key: row.key, value: row.value }));
        records.databases[name] = { store, rows };
      }
      const salt = crypto.getRandomValues(new Uint8Array(16)), nonce = crypto.getRandomValues(new Uint8Array(12));
      progress("Encrypting recovery file\u2026");
      const payload = enc.encode(JSON.stringify(records));
      const data = await runCrypto(async (check) => {
        const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
        check();
        const recoveryKey = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
        check();
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode(records.format) }, recoveryKey, payload);
      }, "Recovery encryption timed out. Retry or restart this browser.");
      return { format: records.format, iterations: ITERATIONS, salt: base64(salt), nonce: base64(nonce), data: base64(new Uint8Array(data)) };
    }
    const storage = {
      get length() {
        return raw.length;
      },
      key: (i) => raw.key(i),
      getItem(k) {
        if (!protectedKey(k)) return raw.getItem(k);
        requireKey();
        const v = raw.getItem(k);
        return v === null ? null : open(JSON.parse(v), "local:" + k);
      },
      setItem(k, v) {
        if (!protectedKey(k)) return raw.setItem(k, String(v));
        requireKey();
        raw.setItem(k, JSON.stringify(seal(String(v), "local:" + k)));
      },
      removeItem(k) {
        if (protectedKey(k)) requireKey();
        raw.removeItem(k);
      }
    };
    return { unlock, lock, seal, open, storage, exportRecovery, isUnlocked: () => ready, isConfigured: () => raw.getItem(META) !== null };
  }
  function installPrivateCache(root) {
    const vault = createPrivateCache({ storage: root.localStorage, indexedDB: root.indexedDB, crypto: root.crypto });
    let pending = null;
    vault.ensureUnlocked = () => {
      if (vault.isUnlocked()) return Promise.resolve();
      if (pending) return pending;
      pending = new Promise((resolve, reject) => {
        const doc = root.document, dialog = doc.createElement("dialog");
        dialog.setAttribute("aria-labelledby", "bn-device-cache-title");
        dialog.style.cssText = "max-width:460px;width:90%;box-sizing:border-box;border:1px solid #dce6ef;border-radius:16px;padding:24px;color:#102640;font:15px system-ui;line-height:1.5";
        const form = doc.createElement("form"), title = doc.createElement("h2"), info = doc.createElement("p"), label = doc.createElement("label"), input = doc.createElement("input"), confirmLabel = doc.createElement("label"), confirm = doc.createElement("input"), message = doc.createElement("p"), button = doc.createElement("button");
        const setup = !vault.isConfigured();
        title.id = "bn-device-cache-title";
        title.textContent = setup ? "Protect records on this device" : "Unlock device records";
        info.textContent = setup ? "Create a separate device passphrase (12+ characters) to encrypt offline records and pending changes. Keep it safe: it cannot be reset, and losing it prevents recovery of unsent work. Your school login stays the same." : "Enter the device passphrase to open encrypted offline records and pending changes. It is separate from your school login.";
        label.textContent = "Device passphrase";
        input.type = "password";
        input.minLength = 12;
        input.required = true;
        input.autocomplete = setup ? "new-password" : "current-password";
        confirmLabel.textContent = "Confirm device passphrase";
        confirm.type = "password";
        confirm.minLength = 12;
        confirm.required = setup;
        confirm.autocomplete = "new-password";
        confirmLabel.hidden = !setup;
        for (const field of [input, confirm]) field.style.cssText = "display:block;width:100%;box-sizing:border-box;padding:12px;margin:6px 0 16px;border:1px solid #ccd6e2;border-radius:8px";
        button.textContent = setup ? "Encrypt and continue" : "Unlock";
        button.type = "submit";
        const backup = doc.createElement("button");
        backup.type = "button";
        backup.textContent = "Download encrypted recovery";
        button.style.cssText = backup.style.cssText = "min-height:44px;padding:10px 14px;border-radius:9px;font:inherit;font-weight:650;cursor:pointer";
        button.style.cssText += ";background:#0b6bac;color:#fff;border:1px solid #0b6bac";
        backup.style.cssText += ";background:#eef5fc;color:#0b315e;border:1px solid #c6dcec";
        const actions = doc.createElement("div");
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:10px";
        actions.append(button, backup);
        message.style.cssText = "margin:0 0 14px;overflow-wrap:anywhere";
        message.setAttribute("role", "status");
        label.append(input);
        confirmLabel.append(confirm);
        form.append(title, info, label, confirmLabel, message, actions);
        dialog.append(form);
        doc.body.append(dialog);
        function setBusy(busy) {
          button.disabled = busy;
          backup.disabled = busy;
          input.readOnly = busy;
          confirm.readOnly = busy;
          button.style.opacity = backup.style.opacity = busy ? ".65" : "1";
          actions.setAttribute("aria-busy", String(busy));
        }
        const showProgress = (text) => {
          message.textContent = text;
        };
        backup.addEventListener("click", async () => {
          if (button.disabled || backup.disabled) return;
          if (setup && input.value !== confirm.value) {
            message.textContent = "Passphrases do not match.";
            return;
          }
          setBusy(true);
          message.textContent = "Preparing encrypted recovery\u2026";
          try {
            const recovery = await vault.exportRecovery(input.value, showProgress);
            const url = root.URL.createObjectURL(new root.Blob([JSON.stringify(recovery)], { type: "application/json" }));
            const link = doc.createElement("a");
            link.href = url;
            link.download = "school-device-recovery.encrypted.json";
            link.hidden = true;
            dialog.append(link);
            try {
              link.click();
            } finally {
              link.remove();
              root.setTimeout(() => root.URL.revokeObjectURL(url), 6e4);
            }
            message.textContent = "Encrypted recovery download started. Keep this passphrase and any earlier device passphrase. No records were removed. Recovery instructions: DEVICE_CACHE_RECOVERY.md.";
          } catch (error) {
            message.textContent = "Recovery export failed: " + error.message;
          } finally {
            setBusy(false);
          }
        });
        dialog.addEventListener("cancel", (event) => event.preventDefault());
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (button.disabled) return;
          if (setup && input.value !== confirm.value) {
            message.textContent = "Passphrases do not match.";
            return;
          }
          setBusy(true);
          try {
            await vault.unlock(input.value, showProgress);
            input.value = "";
            confirm.value = "";
            dialog.close();
            dialog.remove();
            resolve();
          } catch (error) {
            message.textContent = "Unable to unlock: " + error.message.replace(/[.]$/, "") + ". Records were retained. If storage is full, download encrypted recovery before freeing space.";
            setBusy(false);
          }
        });
        dialog.showModal();
        input.focus();
      }).finally(() => {
        pending = null;
      });
      return pending;
    };
    root.BNPrivateCache = vault;
    root.addEventListener("pagehide", () => vault.lock());
    root.addEventListener("pageshow", (event) => {
      if (event.persisted) root.location.reload();
    });
    return vault;
  }
  if (typeof window !== "undefined" && window.document) installPrivateCache(window);
})();
/*! Bundled license information:

@noble/ciphers/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)
*/
