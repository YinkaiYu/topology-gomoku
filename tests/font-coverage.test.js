const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.join(ROOT, "app");
const WECHAT_ROOT = path.join(ROOT, "wechat");
const FONT_ROOT = path.join(APP_ROOT, "assets", "fonts");
const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".json"]);
const FONT_WEIGHTS = ["400", "600", "700"];
const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"
];

function readUIntBase128(buffer, state) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[state.offset];
    state.offset += 1;
    assert.notEqual(byte, undefined, "truncated WOFF2 table directory");
    assert.notEqual(index === 0 && byte === 0x80, true, "invalid UIntBase128 leading byte");
    assert.ok(value <= 0x01ffffff, "UIntBase128 overflow");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return value;
    }
  }
  throw new Error("UIntBase128 exceeds five bytes");
}

function readWoff2Tables(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "wOF2", "font must be WOFF2");
  const numTables = buffer.readUInt16BE(12);
  const totalCompressedSize = buffer.readUInt32BE(20);
  const state = { offset: 48 };
  const entries = [];

  for (let index = 0; index < numTables; index += 1) {
    const flags = buffer[state.offset];
    state.offset += 1;
    const tagIndex = flags & 0x3f;
    let tag = WOFF2_TAGS[tagIndex];
    if (tagIndex === 0x3f) {
      tag = buffer.toString("ascii", state.offset, state.offset + 4);
      state.offset += 4;
    }
    const transformVersion = flags >>> 6;
    const originalLength = readUIntBase128(buffer, state);
    const transformed = tag === "glyf" || tag === "loca"
      ? transformVersion === 0
      : transformVersion !== 0;
    const storedLength = transformed ? readUIntBase128(buffer, state) : originalLength;
    entries.push({ tag, storedLength });
  }

  const compressed = buffer.subarray(state.offset, state.offset + totalCompressedSize);
  const tableStream = zlib.brotliDecompressSync(compressed);
  const tables = new Map();
  let tableOffset = 0;
  entries.forEach((entry) => {
    tables.set(entry.tag, tableStream.subarray(tableOffset, tableOffset + entry.storedLength));
    tableOffset += entry.storedLength;
  });
  assert.equal(tableOffset, tableStream.length, "WOFF2 table stream length mismatch");
  return tables;
}

function readFormat4(table, offset, codepoints) {
  const length = table.readUInt16BE(offset + 2);
  const limit = offset + length;
  const segmentCount = table.readUInt16BE(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const rangeOffsets = deltas + segmentCount * 2;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = table.readUInt16BE(startCodes + segment * 2);
    const end = table.readUInt16BE(endCodes + segment * 2);
    const delta = table.readInt16BE(deltas + segment * 2);
    const rangeOffset = table.readUInt16BE(rangeOffsets + segment * 2);
    for (let value = start; value <= end && value !== 0xffff; value += 1) {
      let glyph = 0;
      if (rangeOffset === 0) {
        glyph = (value + delta) & 0xffff;
      } else {
        const glyphOffset = rangeOffsets + segment * 2 + rangeOffset + (value - start) * 2;
        if (glyphOffset + 2 <= limit) {
          glyph = table.readUInt16BE(glyphOffset);
          if (glyph !== 0) {
            glyph = (glyph + delta) & 0xffff;
          }
        }
      }
      if (glyph !== 0) {
        codepoints.add(value);
      }
    }
  }
}

function readFormat12(table, offset, codepoints) {
  const groupCount = table.readUInt32BE(offset + 12);
  for (let group = 0; group < groupCount; group += 1) {
    const groupOffset = offset + 16 + group * 12;
    const start = table.readUInt32BE(groupOffset);
    const end = table.readUInt32BE(groupOffset + 4);
    const startGlyph = table.readUInt32BE(groupOffset + 8);
    for (let value = start; value <= end; value += 1) {
      if (startGlyph + value - start !== 0) {
        codepoints.add(value);
      }
    }
  }
}

function readCmap(buffer) {
  const cmap = readWoff2Tables(buffer).get("cmap");
  assert.ok(cmap, "WOFF2 font is missing cmap");
  const tableCount = cmap.readUInt16BE(2);
  const codepoints = new Set();
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 4 + index * 8;
    const platform = cmap.readUInt16BE(recordOffset);
    const encoding = cmap.readUInt16BE(recordOffset + 2);
    const offset = cmap.readUInt32BE(recordOffset + 4);
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) {
      continue;
    }
    const format = cmap.readUInt16BE(offset);
    if (format === 4) {
      readFormat4(cmap, offset, codepoints);
    } else if (format === 12) {
      readFormat12(cmap, offset, codepoints);
    }
  }
  return codepoints;
}

function appTextFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return appTextFiles(entryPath);
    }
    return TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
  });
}

function requiredNonAsciiCodepoints() {
  const codepoints = new Set();
  [APP_ROOT, WECHAT_ROOT].filter((root) => fs.existsSync(root)).forEach((root) => {
    appTextFiles(root).forEach((file) => {
      for (const character of fs.readFileSync(file, "utf8")) {
        if (character.codePointAt(0) > 0x7f && !/\s/u.test(character)) {
          codepoints.add(character.codePointAt(0));
        }
      }
    });
  });
  return [...codepoints].sort((left, right) => left - right);
}

test("所有应用文本都由三个内嵌字体字重完整覆盖", () => {
  const required = requiredNonAsciiCodepoints();
  assert.ok(required.length > 200, "expected the complete application character set");
  FONT_WEIGHTS.forEach((weight) => {
    const fontPath = path.join(FONT_ROOT, `noto-serif-sc-${weight}.woff2`);
    const cmap = readCmap(fs.readFileSync(fontPath));
    const missing = required.filter((codepoint) => !cmap.has(codepoint));
    assert.deepEqual(
      missing,
      [],
      `${path.basename(fontPath)} missing: ${missing.map((value) => String.fromCodePoint(value)).join("")}`
    );
  });
});
