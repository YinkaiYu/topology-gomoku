import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import midiPackage from "@tonejs/midi";

import { compositionTiming } from "../video/footsteps-return/src/data/captions.js";

const { Midi } = midiPackage;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PV_ROOT = path.join(ROOT, "video", "footsteps-return");
const SCORE_ROOT = path.join(PV_ROOT, "audio", "score");
const STEM_ROOT = path.join(SCORE_ROOT, "stems");
const BUILD_SCRIPT = path.join(PV_ROOT, "scripts", "build-score.mjs");
const EXPECTED_PARTS = [
  ["piano", "Piano"],
  ["celesta", "Celesta"],
  ["violin-i", "Violin I"],
  ["violin-ii", "Violin II"],
  ["viola", "Viola"],
  ["cello", "Cello"],
  ["double-bass", "Double Bass"],
  ["french-horn", "French Horn"],
  ["bass-clarinet", "Bass Clarinet"],
  ["choir-aahs", "Choir Aahs"],
  ["restrained-percussion", "Restrained Percussion"]
];
const RANGE_BY_PART = new Map([
  ["Piano", [28, 96]],
  ["Celesta", [60, 108]],
  ["Violin I", [55, 103]],
  ["Violin II", [55, 96]],
  ["Viola", [48, 88]],
  ["Cello", [36, 76]],
  ["Double Bass", [28, 67]],
  ["French Horn", [34, 77]],
  ["Bass Clarinet", [34, 77]],
  ["Choir Aahs", [48, 81]],
  ["Restrained Percussion", [35, 81]]
]);
const EXPECTED_CHAPTER_WORLDS = [
  {
    id: "plane",
    mode: "D Lydian",
    rhythmicIdentity: "lucid 4/4 with a two-note pickup",
    leadParts: ["piano"],
    motive: [62, 66, 64, 69, 68, 71, 74]
  },
  {
    id: "cylinder",
    mode: "B-flat Mixolydian",
    rhythmicIdentity: "3+3 cyclical pulse",
    leadParts: ["bass-clarinet", "cello"],
    motive: [58, 62, 60, 65, 63, 67]
  },
  {
    id: "torus",
    mode: "E Mixolydian / G Lydian",
    rhythmicIdentity: "4.75 against 5.25 second cycles that mesh",
    leadParts: ["piano", "celesta"],
    motive: [52, 59, 57, 61, 56, 64]
  },
  {
    id: "mobius",
    mode: "C octatonic",
    rhythmicIdentity: "3+2+3/8 additive meter",
    leadParts: ["viola", "bass-clarinet"],
    motive: [60, 66, 63, 69, 67, 61]
  },
  {
    id: "klein",
    mode: "D Phrygian dominant",
    rhythmicIdentity: "antiphonal 6/8 propulsion",
    leadParts: ["violin-i", "bass-clarinet", "cello", "double-bass"],
    motive: [81, 75, 78, 86]
  },
  {
    id: "projective",
    mode: "E Lydian",
    rhythmicIdentity: "mirrored six-pulse canon",
    leadParts: ["celesta", "violin-i", "choir-aahs"],
    motive: [76, 83, 78, 82, 80, 87]
  },
  {
    id: "sphere",
    mode: "D major",
    rhythmicIdentity: "broad 4/4 anacrusis into two-bar melody",
    leadParts: ["piano", "french-horn", "violin-i", "choir-aahs"],
    motive: [62, 64, 66, 69, 67, 71, 69, 66, 76, 74]
  }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(PV_ROOT, relativePath), "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runBuilder() {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `score build failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function parseScoreParts(xml) {
  return [...xml.matchAll(/<score-part id="([^"]+)">[\s\S]*?<part-name>([^<]+)<\/part-name>[\s\S]*?<\/score-part>/g)]
    .map((match) => ({ id: match[1], name: match[2] }));
}

function parsePartBodies(xml) {
  return new Map([...xml.matchAll(/<part id="([^"]+)">([\s\S]*?)<\/part>/g)]
    .map((match) => [match[1], match[2]]));
}

function scoreDurationDivisions(partBody) {
  return [...partBody.matchAll(/<note>([\s\S]*?)<\/note>/g)]
    .filter((match) => !match[1].includes("<chord/>") && !match[1].includes("<grace") && match[1].includes("<voice>1</voice>"))
    .reduce((total, match) => total + Number(/<duration>(\d+)<\/duration>/.exec(match[1])?.[1] ?? 0), 0);
}

function assertNotatedDurationsAreCalculable(partBody) {
  const baseDuration = new Map([
    ["whole", 4000], ["half", 2000], ["quarter", 1000], ["eighth", 500], ["16th", 250], ["32nd", 125]
  ]);
  for (const match of partBody.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
    const body = match[1];
    const duration = Number(/<duration>(\d+)<\/duration>/.exec(body)?.[1]);
    const type = /<type>([^<]+)<\/type>/.exec(body)?.[1];
    assert.ok(type, `MusicXML duration ${duration} is missing a calculable note type`);
    const dots = (body.match(/<dot\/>/g) ?? []).length;
    const expected = baseDuration.get(type) * (dots === 0 ? 1 : dots === 1 ? 1.5 : 1.75);
    assert.equal(duration, expected, `MusicXML ${type} with ${dots} dots must agree with duration ${duration}`);
  }
}

function notesAt(track, starts, pitches, tolerance = 0.012) {
  assert.equal(starts.length, pitches.length);
  starts.forEach((time, index) => {
    assert.ok(track.notes.some((note) => Math.abs(note.time - time) <= tolerance && note.midi === pitches[index]),
      `${track.name} is missing MIDI ${pitches[index]} at ${time.toFixed(3)}s`);
  });
}

function trackByName(midi, name) {
  const track = midi.tracks.find((candidate) => candidate.name === name);
  assert.ok(track, `missing MIDI track ${name}`);
  return track;
}

function parsePcmWave(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        subFormatCode: length >= 40 ? buffer.readUInt32LE(body + 24) : buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        blockAlign: buffer.readUInt16LE(body + 12),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
    } else if (id === "data") {
      data = buffer.subarray(body, body + length);
    }
    offset = body + length + (length % 2);
  }
  assert.ok(format && data, "WAV must include fmt and data chunks");
  assert.ok(format.audioFormat === 1 || (format.audioFormat === 65534 && format.subFormatCode === 1));
  assert.ok([16, 24, 32].includes(format.bitsPerSample));
  const bytesPerSample = format.bitsPerSample / 8;
  const frameCount = Math.floor(data.length / format.blockAlign);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frameCount));
  const scale = 2 ** (format.bitsPerSample - 1);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = frame * format.blockAlign + channel * bytesPerSample;
      let integer;
      if (bytesPerSample === 2) integer = data.readInt16LE(sampleOffset);
      else if (bytesPerSample === 3) {
        integer = data.readUIntLE(sampleOffset, 3);
        if (integer & 0x800000) integer -= 0x1000000;
      } else integer = data.readInt32LE(sampleOffset);
      channels[channel][frame] = integer / scale;
    }
  }
  return { ...format, frameCount, channels };
}

function channelRmsDb(wave, channel, startSeconds, endSeconds) {
  const start = Math.floor(startSeconds * wave.sampleRate);
  const end = Math.min(wave.frameCount, Math.ceil(endSeconds * wave.sampleRate));
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += wave.channels[channel][index] ** 2;
  const rms = Math.sqrt(sum / Math.max(1, end - start));
  return 20 * Math.log10(Math.max(rms, 1e-12));
}

test("score plan is locked to the measured master timeline and declares an original five-note source cell", () => {
  const plan = readJson(path.join("audio", "score", "score-plan.json"));
  assert.deepEqual(plan.sourceMusic, {
    importedOrTranscribedReferenceMusic: false,
    externalSourceFiles: [],
    declaration: "Every pitched and rhythmic event is original to this project. No reference-PV music was imported, traced, transcribed, or transformed."
  });
  assert.deepEqual(plan.motif.pitchClasses, [2, 5, 7, 9, 0]);
  assert.deepEqual(plan.motif.spelling, ["D", "F", "G", "A", "C"]);
  assert.equal(plan.timeline.durationSeconds, compositionTiming.duration);
  assert.deepEqual(plan.timeline.scenes, compositionTiming.scenes.map(({ id, kind, chapterId = null, start, duration }) => ({
    id, kind, chapterId, start, duration
  })));
  assert.deepEqual(plan.parts.map(({ id, name }) => [id, name]), EXPECTED_PARTS);
  assert.equal(plan.render.soundProfile, "MuseScore Basic");
  assert.equal(plan.render.sampleRate, 48000);
  assert.equal(plan.render.channels, 2);
  assert.ok(plan.cohesion, "the rewritten suite must declare its boundary-only cohesion contract");
  assert.equal(plan.cohesion.sharedChapterMelody, false);
  assert.deepEqual(plan.cohesion.boundarySonority.pitchClasses, [2, 9]);
  assert.ok(plan.cohesion.boundarySonority.maximumDurationSeconds <= 0.625);
  assert.ok(Array.isArray(plan.chapterWorlds), "the rewritten suite must declare seven independent chapter worlds");
  assert.deepEqual(plan.chapterWorlds.map(({ id, mode, rhythmicIdentity, leadParts, motive }) => ({
    id, mode, rhythmicIdentity, leadParts, motive: motive.pitches
  })), EXPECTED_CHAPTER_WORLDS);
  assert.equal(new Set(plan.chapterWorlds.map(({ mode }) => mode)).size, 7, "every chapter needs its own harmonic world");
  assert.equal(new Set(plan.chapterWorlds.map(({ rhythmicIdentity }) => rhythmicIdentity)).size, 7, "every chapter needs its own rhythmic identity");
  assert.equal(new Set(plan.chapterWorlds.map(({ motive }) => motive.pitches.join(","))).size, 7, "chapter motives must be independent");
  assert.ok(plan.chapterWorlds.every(({ arc }) => arc.length >= 3), "every chapter needs a compact internal arc");
  assert.ok(Array.isArray(plan.joins) && plan.joins.length >= 8);
  assert.ok(plan.joins.every(({ overlapSeconds, pickupGestureId, pivot }) =>
    overlapSeconds >= 0.25 && pickupGestureId && pivot), "every structural join needs an audible overlap, pickup and pivot");
});

test("deterministic builder emits a real 11-part master and one single-part score/MIDI per stem", () => {
  const plan = readJson(path.join("audio", "score", "score-plan.json"));
  const expectedNotationDivisions = Math.round(plan.render.notatedDurationSeconds * plan.render.divisionsPerQuarter);
  runBuilder();
  const generated = [path.join(SCORE_ROOT, "master.musicxml"), path.join(SCORE_ROOT, "master.mid")];
  for (const [stemId] of EXPECTED_PARTS) {
    generated.push(path.join(STEM_ROOT, `${stemId}.musicxml`), path.join(STEM_ROOT, `${stemId}.mid`));
  }
  const firstHashes = generated.map(sha256);
  runBuilder();
  assert.deepEqual(generated.map(sha256), firstHashes, "score generation must be byte deterministic");

  const masterXml = fs.readFileSync(path.join(SCORE_ROOT, "master.musicxml"), "utf8");
  const scoreParts = parseScoreParts(masterXml);
  assert.deepEqual(scoreParts.map(({ name }) => name), EXPECTED_PARTS.map(([, name]) => name));
  assert.match(masterXml, /<work-title>Footsteps Return — Seven Topological Realms<\/work-title>/);
  assert.match(masterXml, /<sound tempo="60"\/>/);
  assert.match(masterXml, /<divisions>1000<\/divisions>/);
  assert.match(masterXml, /<beats>3\+2\+3<\/beats><beat-type>8<\/beat-type>/,
    "Möbius additive meter must reach the actual notation source");
  assert.ok((masterXml.match(/<key><fifths>/g) ?? []).length >= 8,
    "chapter harmonic worlds must reach the actual notation source");
  assert.match(masterXml, /<sound pizzicato="yes"\/>/,
    "declared pizzicato identities must reach the actual MuseScore playback source");
  assert.match(masterXml, /<pan>-25\.2<\/pan>/,
    "the cello's declared stage position must be present in MusicXML as well as the PCM spatializer");
  const bodies = parsePartBodies(masterXml);
  for (const { id, name } of scoreParts) {
    const body = bodies.get(id);
    assert.ok(body, `master is missing body for ${name}`);
    assert.equal((body.match(/<measure number="/g) ?? []).length, plan.render.measureCount,
      `${name} must span the final measured timeline grid`);
    assert.equal(scoreDurationDivisions(body), expectedNotationDivisions,
      `${name} notation must cover the declared 1/32 grid before the measured render pad`);
    assertNotatedDurationsAreCalculable(body);
    assert.match(body, /<(?:pitch|unpitched)>/, `${name} must contain sounding notes, not only rests`);
  }

  for (const [stemId, stemName] of EXPECTED_PARTS) {
    const stemXml = fs.readFileSync(path.join(STEM_ROOT, `${stemId}.musicxml`), "utf8");
    assert.deepEqual(parseScoreParts(stemXml).map(({ name }) => name), [stemName]);
    const stemBody = [...parsePartBodies(stemXml).values()][0];
    assert.equal((stemBody.match(/<measure number="/g) ?? []).length, plan.render.measureCount);
    assert.equal(scoreDurationDivisions(stemBody), expectedNotationDivisions);
    assertNotatedDurationsAreCalculable(stemBody);
    const stemMidi = new Midi(fs.readFileSync(path.join(STEM_ROOT, `${stemId}.mid`)));
    assert.deepEqual(stemMidi.tracks.map(({ name }) => name), [stemName]);
    assert.ok(stemMidi.tracks[0].notes.length > 0, `${stemName} MIDI stem must contain real notes`);
    assert.equal(stemMidi.header.keySignatures.length, 8);
  }
});

test("generated MIDI realizes seven independent chapter worlds rather than one theme in variation", () => {
  runBuilder();
  const midi = new Midi(fs.readFileSync(path.join(SCORE_ROOT, "master.mid")));
  assert.equal(midi.header.ppq, 1000);
  assert.equal(midi.header.tempos.length, 1);
  assert.ok(Math.abs(midi.header.tempos[0].bpm - 60) < 0.001);
  assert.deepEqual(midi.header.timeSignatures.map(({ timeSignature }) => timeSignature), [[4, 4], [8, 8], [4, 4]]);
  assert.deepEqual(midi.header.keySignatures.map(({ ticks }) => ticks), [0, 20000, 36000, 56000, 76000, 92000, 112000, 128000]);
  assert.deepEqual(midi.tracks.map(({ name }) => name), EXPECTED_PARTS.map(([, name]) => name));

  const piano = trackByName(midi, "Piano");
  notesAt(piano, [2.25, 3, 4.125, 4.5, 5.25], [62, 65, 67, 69, 72]);
  notesAt(piano, [22, 22.75, 23.25, 24.375, 24.875, 25.625, 26.375],
    [62, 66, 64, 69, 68, 71, 74]);

  const bassClarinet = trackByName(midi, "Bass Clarinet");
  notesAt(bassClarinet, [38.25, 38.75, 39.25, 40.25, 40.75, 41.5],
    [58, 62, 60, 65, 63, 67]);
  const cello = trackByName(midi, "Cello");
  notesAt(cello, [38, 39.25, 40.5, 41.75], [46, 53, 48, 55]);
  const pan = cello.controlChanges[10] ?? [];
  assert.ok(pan.some((event) => event.time >= 37.7 && event.time < 39 && event.value < 0.2));
  assert.ok(pan.some((event) => event.time > 53 && event.time < 56.7 && event.value > 0.8));

  notesAt(piano, [57, 57.5, 58.25, 59, 59.5, 60.5], [52, 59, 57, 61, 56, 64]);
  const celesta = trackByName(midi, "Celesta");
  notesAt(celesta, [58.1, 58.85, 59.35, 60.35, 61.1], [79, 81, 78, 84, 83]);

  const viola = trackByName(midi, "Viola");
  notesAt(viola, [76, 76.75, 77.5, 78.5, 79.25, 80], [60, 66, 63, 69, 67, 61]);

  notesAt(trackByName(midi, "Violin I"), [94.25, 94.75, 95.25, 96], [81, 75, 78, 86]);
  notesAt(bassClarinet, [95.75, 96.25, 96.75, 97.5], [38, 45, 46, 51]);

  notesAt(celesta, [112.75, 113.5, 114.25, 115.25, 116, 117], [76, 83, 78, 82, 80, 87]);

  notesAt(piano, [131.5, 132.25, 133, 134, 135, 135.75, 136.5, 137.5, 138.25, 139.25],
    [62, 64, 66, 69, 67, 71, 69, 66, 76, 74]);
  const sphereWindow = [131.38, 156.301333];
  for (const name of EXPECTED_PARTS.map(([, name]) => name)) {
    assert.ok(trackByName(midi, name).notes.some((note) => note.time >= sphereWindow[0] && note.time < sphereWindow[1]),
      `${name} must participate in the Sphere expansion`);
  }
  const resolution = piano.notes.filter((note) => Math.abs(note.time - 177.2) < 0.012).map(({ midi: pitch }) => pitch);
  assert.deepEqual(resolution, [38, 45, 50, 54, 59, 64], "the suite must release into a bright D6/9 cadence");
});

test("generated MIDI overlaps chapter joins with pickups and never substitutes long silence for continuity", () => {
  runBuilder();
  const midi = new Midi(fs.readFileSync(path.join(SCORE_ROOT, "master.mid")));
  const expectedJoins = [
    { boundary: 21.502667, outgoing: ["Double Bass", 20.95], pickup: ["Piano", 21.25] },
    { boundary: 37.762667, outgoing: ["Piano", 37.35], pickup: ["Bass Clarinet", 37.45] },
    { boundary: 56.601334, outgoing: ["Cello", 56.25], pickup: ["Celesta", 56.25] },
    { boundary: 75.781334, outgoing: ["Celesta", 75.4], pickup: ["Viola", 75.3] },
    { boundary: 93.894667, outgoing: ["Viola", 93.5], pickup: ["Restrained Percussion", 93.45] },
    { boundary: 112.626667, outgoing: ["Restrained Percussion", 112.35], pickup: ["Celesta", 112.2] },
    { boundary: 131.38, outgoing: ["Choir Aahs", 131.1], pickup: ["French Horn", 130.9] },
    { boundary: 156.301333, outgoing: ["Violin I", 156], pickup: ["Celesta", 155.8] }
  ];
  for (const { boundary, outgoing: [outgoingPart, outgoingStart], pickup: [pickupPart, pickupStart] } of expectedJoins) {
    const outgoing = trackByName(midi, outgoingPart).notes.find((note) => Math.abs(note.time - outgoingStart) <= 0.012);
    const pickup = trackByName(midi, pickupPart).notes.find((note) => Math.abs(note.time - pickupStart) <= 0.012);
    assert.ok(outgoing, `missing outgoing relay ${outgoingPart} at ${outgoingStart}`);
    assert.ok(pickup, `missing pickup relay ${pickupPart} at ${pickupStart}`);
    assert.ok(outgoing.time + outgoing.duration > boundary, `outgoing phrase must cross ${boundary}`);
    assert.ok(pickup.time < boundary, `pickup must enter before ${boundary}`);
  }
});

test("every generated note stays within a playable concert range and percussion remains restrained", () => {
  runBuilder();
  const midi = new Midi(fs.readFileSync(path.join(SCORE_ROOT, "master.mid")));
  for (const track of midi.tracks) {
    const [minimum, maximum] = RANGE_BY_PART.get(track.name);
    assert.ok(track.notes.length > 0);
    track.notes.forEach((note) => assert.ok(note.midi >= minimum && note.midi <= maximum,
      `${track.name} MIDI ${note.midi} is outside ${minimum}–${maximum}`));
    track.notes.forEach((note) => {
      assert.ok(note.time >= 0 && note.time + note.duration <= compositionTiming.duration + 0.001,
        `${track.name} note exceeds the measured master timeline`);
      assert.ok(note.duration >= 0.06, `${track.name} contains an unplayably short event`);
    });
  }
  const percussion = trackByName(midi, "Restrained Percussion");
  assert.equal(percussion.channel, 9);
  assert.ok(percussion.notes.length <= 24, "percussion must punctuate rather than run continuously");
  assert.ok(percussion.notes.every((note) => note.duration <= 1.5));
});

test("SFX remain sparse and every external audio dependency is classified against hashed license evidence", () => {
  const sfx = readJson(path.join("audio", "sfx", "sfx-plan.json"));
  assert.deepEqual(sfx.allowedCategories, [
    "stone-placement",
    "seam-crossing",
    "surface-bend",
    "camera-occlusion",
    "chapter-low-punctuation"
  ]);
  assert.deepEqual(sfx.externalSamples, []);
  assert.equal(sfx.sampleRate, 48000);
  assert.ok(sfx.cues.length >= 12 && sfx.cues.length <= 24);
  assert.ok(sfx.cues.every((cue) => sfx.allowedCategories.includes(cue.category)));
  assert.ok(sfx.cues.every((cue) => cue.time >= 0 && cue.time < compositionTiming.duration && cue.duration <= 1.8));
  assert.ok(sfx.generators.every(({ seed, algorithm, parameters }) => Number.isInteger(seed) && algorithm && parameters));

  const licenses = readJson(path.join("assets", "audio-licenses.json"));
  const external = licenses.resources.filter(({ external }) => external);
  assert.ok(external.length >= 2);
  external.forEach((resource) => {
    assert.ok(["release-audio-input", "build-tool-only", "historical-build-artifact"].includes(resource.usageClass),
      `${resource.id} must distinguish release input, build tooling and rejected historical artifacts`);
    assert.match(resource.license, /MIT|Apache-2\.0|BSD-3-Clause|GPL-3\.0|LGPL/i);
    assert.ok(Array.isArray(resource.licenseEvidence) && resource.licenseEvidence.length > 0,
      `${resource.id} must cite saved LICENSE/NOTICE evidence`);
    resource.licenseEvidence.forEach(({ repositoryPath, sha256: expectedHash, source }) => {
      const evidencePath = path.join(PV_ROOT, repositoryPath);
      assert.ok(fs.statSync(evidencePath).isFile(), `${resource.id} license evidence must be a real file`);
      assert.equal(sha256(evidencePath), expectedHash, `${resource.id} license evidence hash is stale`);
      assert.ok(source, `${resource.id} must record where the license file came from`);
    });
    if (resource.usageClass === "release-audio-input") {
      assert.equal(resource.commercialVideoUse, true, `${resource.id} must explicitly permit commercial video use`);
      assert.ok(resource.assetEvidence?.every(({ sha256: assetHash }) => /^[a-f0-9]{64}$/.test(assetHash)));
    } else {
      assert.equal(resource.releasedWithVideo, false, `${resource.id} is tooling and must not be mislabeled as a shipped audio asset`);
      if (resource.usageClass === "historical-build-artifact") {
        assert.equal(resource.incorporatedIntoReleasedAudio, false, `${resource.id} cannot remain in release audio after final voice selection`);
      }
    }
  });
  assert.deepEqual(external.filter(({ usageClass }) => usageClass === "release-audio-input").map(({ id }) => id).sort(),
    ["ms-basic-sf3", "qwen3-tts-voice-design-cold-witness"]);
  const soundfont = licenses.resources.find(({ id }) => id === "ms-basic-sf3");
  assert.ok(soundfont);
  assert.equal(soundfont.license, "MIT");
  assert.match(soundfont.assetEvidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(soundfont.renderSoundProfile, "MuseScore Basic");
});

test("tracked render metadata proves 48 kHz stereo master/stems and records honest review limits", () => {
  const metadata = readJson(path.join("audio", "score", "render-metadata.json"));
  const review = readJson(path.join("audio", "score", "review.json"));
  assert.equal(metadata.source.scorePlanSha256, sha256(path.join(SCORE_ROOT, "score-plan.json")));
  assert.equal(metadata.source.masterMusicXmlSha256, sha256(path.join(SCORE_ROOT, "master.musicxml")));
  assert.equal(metadata.source.masterMidiSha256, sha256(path.join(SCORE_ROOT, "master.mid")));
  assert.equal(metadata.timelineDurationSeconds, compositionTiming.duration);
  assert.equal(metadata.renderer.soundProfile, "MuseScore Basic");
  assert.match(metadata.renderer.soundfontSha256, /^[a-f0-9]{64}$/);
  assert.equal(metadata.master.sampleRate, 48000);
  assert.equal(metadata.master.channels, 2);
  assert.ok(Math.abs(metadata.master.durationSeconds - compositionTiming.duration) < 1 / 48000);
  assert.match(metadata.master.sha256, /^[a-f0-9]{64}$/);
  assert.equal(review.masterSha256, metadata.master.sha256);
  assert.equal(review.reviewAsset.path, "audio/score/review/score-review.opus");
  assert.equal(review.reviewAsset.codec, "Opus 48 kbps VBR");
  assert.match(review.reviewAsset.sha256, /^[a-f0-9]{64}$/);
  assert.ok(review.reviewAsset.bytes > 100000);
  assert.ok(metadata.master.peakDbfs <= -0.1 && metadata.master.peakDbfs > -30);
  assert.ok(metadata.master.rmsDbfs < metadata.master.peakDbfs && metadata.master.rmsDbfs > -60);
  assert.deepEqual(metadata.stems.map(({ id }) => id), EXPECTED_PARTS.map(([id]) => id));
  metadata.stems.forEach((stem) => {
    assert.equal(stem.sampleRate, 48000);
    assert.equal(stem.channels, 2);
    assert.ok(Math.abs(stem.durationSeconds - compositionTiming.duration) < 1 / 48000);
    assert.match(stem.sha256, /^[a-f0-9]{64}$/);
    assert.ok(stem.peakDbfs <= -0.1 && stem.rmsDbfs < stem.peakDbfs);
  });
  assert.equal(review.subjectiveListening.status, "not-completed");
  assert.ok(review.subjectiveListening.requiredBeforeFinalMix);
  assert.equal(review.objectiveChecks.silenceOrMissingAudio, false);
  assert.equal(review.objectiveChecks.clippingDetected, false);
  assert.equal("narrationBandHeadroomDb" in review.objectiveChecks, false,
    "a score-only crest-factor calculation must not be labeled narration headroom");
  const comparison = review.objectiveChecks.voiceScoreComparison;
  assert.equal(comparison.cueCount, 21);
  assert.deepEqual(comparison.presenceBandHz, [180, 4500]);
  assert.ok(comparison.minimumVoiceToScoreRmsMarginDb >= 3);
  assert.ok(comparison.minimumVoiceToScorePresenceBandMarginDb >= 6);
  assert.equal(comparison.cues.length, 21);
  assert.ok(comparison.cues.every(({ voiceSha256, voiceRmsDbfs, scoreRmsDbfs,
    voicePresenceBandRmsDbfs, scorePresenceBandRmsDbfs }) =>
    /^[a-f0-9]{64}$/.test(voiceSha256) &&
    [voiceRmsDbfs, scoreRmsDbfs, voicePresenceBandRmsDbfs, scorePresenceBandRmsDbfs].every(Number.isFinite)));
  assert.match(comparison.method, /actual dry voice cue PCM/i);
  const density = review.objectiveChecks.narrationWindowDensity;
  assert.equal(density.cueCount, 21);
  assert.ok(density.maximumNoteOnsetsPerSecond <= 8);
  assert.ok(density.maximumSimultaneousPitches <= 16);
  const motion = review.objectiveChecks.cylinderStereoMotion;
  assert.equal(motion.stemId, "cello");
  assert.equal(motion.sourceStemSha256, metadata.stems.find(({ id }) => id === "cello").sha256);
  assert.ok(motion.earlyWindow.leftMinusRightRmsDb >= 3);
  assert.ok(motion.lateWindow.leftMinusRightRmsDb <= -3);
  assert.ok(motion.leftToRightSwingDb >= 6);
  const profiles = review.objectiveChecks.chapterRenderProfiles;
  assert.deepEqual(profiles.map(({ chapterId }) => chapterId), EXPECTED_CHAPTER_WORLDS.map(({ id }) => id));
  assert.equal(profiles.find(({ chapterId }) => chapterId === "plane").dominantPart, "piano");
  assert.deepEqual(new Set(profiles.find(({ chapterId }) => chapterId === "torus").rankedParts.slice(0, 2)),
    new Set(["piano", "celesta"]));
  assert.equal(profiles.find(({ chapterId }) => chapterId === "mobius").dominantPart, "viola");
  assert.ok(profiles.find(({ chapterId }) => chapterId === "klein").rankedParts.slice(0, 3).includes("bass-clarinet"));
  assert.ok(profiles.find(({ chapterId }) => chapterId === "projective").activeParts.includes("choir-aahs"));
  assert.equal(profiles.find(({ chapterId }) => chapterId === "sphere").activeParts.length, EXPECTED_PARTS.length);
  assert.ok(new Set(profiles.map(({ dominantPart }) => dominantPart)).size >= 6,
    "real rendered chapters must not collapse to one lead timbre");
  const continuity = review.objectiveChecks.chapterJoinContinuity;
  assert.equal(continuity.boundaryCount, 8);
  assert.ok(continuity.minimumCenteredWindowRmsDbfs > -65);
  assert.ok(continuity.joins.every(({ centeredWindowRmsDbfs }) => Number.isFinite(centeredWindowRmsDbfs)));
  assert.equal(review.evidence.type, "waveform-spectrum-form-contact-sheet");
});

const renderedCelloPath = path.join(SCORE_ROOT, "rendered", "stems", "cello.wav");
test("real MuseScore cello stem moves from left to right across the Cylinder window", {
  skip: fs.existsSync(renderedCelloPath) ? false : "run npm run pv:score to create ignored render evidence"
}, () => {
  const metadata = readJson(path.join("audio", "score", "render-metadata.json"));
  const review = readJson(path.join("audio", "score", "review.json"));
  const celloMetadata = metadata.stems.find(({ id }) => id === "cello");
  assert.equal(sha256(renderedCelloPath), celloMetadata.sha256, "tracked evidence must describe this exact rendered stem");
  const wave = parsePcmWave(renderedCelloPath);
  assert.equal(wave.sampleRate, 48000);
  assert.equal(wave.channels.length, 2);
  const earlyBalance = channelRmsDb(wave, 0, 38, 42.5) - channelRmsDb(wave, 1, 38, 42.5);
  const lateBalance = channelRmsDb(wave, 0, 52, 56) - channelRmsDb(wave, 1, 52, 56);
  assert.ok(earlyBalance >= 3, `Cylinder must begin left-weighted, got ${earlyBalance.toFixed(2)} dB`);
  assert.ok(lateBalance <= -3, `Cylinder must finish right-weighted, got ${lateBalance.toFixed(2)} dB`);
  assert.ok(earlyBalance - lateBalance >= 6, "Cylinder must produce an audible left-to-right swing");
  assert.ok(Math.abs(review.objectiveChecks.cylinderStereoMotion.earlyWindow.leftMinusRightRmsDb - earlyBalance) <= 0.05);
  assert.ok(Math.abs(review.objectiveChecks.cylinderStereoMotion.lateWindow.leftMinusRightRmsDb - lateBalance) <= 0.05);
});
