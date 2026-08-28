"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".json"]);
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

function readSfntTables(buffer) {
  const signature = buffer.toString("ascii", 0, 4);
  const isTrueType = buffer.readUInt32BE(0) === 0x00010000 || signature === "true";
  assert.ok(isTrueType || signature === "OTTO", "font must be a TTF or OpenType SFNT");
  const numTables = buffer.readUInt16BE(4);
  const tables = new Map();

  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16;
    assert.ok(recordOffset + 16 <= buffer.length, "truncated SFNT table directory");
    const tag = buffer.toString("ascii", recordOffset, recordOffset + 4);
    const tableOffset = buffer.readUInt32BE(recordOffset + 8);
    const tableLength = buffer.readUInt32BE(recordOffset + 12);
    assert.ok(tableOffset + tableLength <= buffer.length, `truncated SFNT ${tag} table`);
    tables.set(tag, buffer.subarray(tableOffset, tableOffset + tableLength));
  }
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
  const tables = buffer.toString("ascii", 0, 4) === "wOF2"
    ? readWoff2Tables(buffer)
    : readSfntTables(buffer);
  const cmap = tables.get("cmap");
  assert.ok(cmap, "font is missing cmap");
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

function textFiles(directory, extensions = DEFAULT_TEXT_EXTENSIONS) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return textFiles(entryPath, extensions);
    }
    return extensions.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
  });
}

function requiredNonAsciiCodepoints(textRoots, extensions = DEFAULT_TEXT_EXTENSIONS) {
  const codepoints = new Set();
  textRoots.forEach((textRoot) => {
    textFiles(textRoot, extensions).forEach((file) => {
      for (const character of fs.readFileSync(file, "utf8")) {
        if (character.codePointAt(0) > 0x7f && !/\s/u.test(character)) {
          codepoints.add(character.codePointAt(0));
        }
      }
    });
  });
  return [...codepoints].sort((left, right) => left - right);
}

function assertFontCoverage({ fontPaths, textRoots, minimumCodepoints = 0 }) {
  const required = requiredNonAsciiCodepoints(textRoots);
  assert.ok(
    required.length >= minimumCodepoints,
    `expected at least ${minimumCodepoints} required non-ASCII codepoints`
  );
  fontPaths.forEach((fontPath) => {
    const cmap = readCmap(fs.readFileSync(fontPath));
    const missing = required.filter((codepoint) => !cmap.has(codepoint));
    assert.deepEqual(
      missing,
      [],
      `${path.basename(fontPath)} missing: ${missing.map((value) => String.fromCodePoint(value)).join("")}`
    );
  });
  return required;
}

module.exports = {
  DEFAULT_TEXT_EXTENSIONS,
  assertFontCoverage,
  readCmap,
  requiredNonAsciiCodepoints,
  textFiles
};
