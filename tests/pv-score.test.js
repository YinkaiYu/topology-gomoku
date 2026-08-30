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
});

test("deterministic builder emits a real 11-part master and one single-part score/MIDI per stem", () => {
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
  const bodies = parsePartBodies(masterXml);
  for (const { id, name } of scoreParts) {
    const body = bodies.get(id);
    assert.ok(body, `master is missing body for ${name}`);
    assert.equal((body.match(/<measure number="/g) ?? []).length, 46, `${name} must span all 46 measures`);
    assert.equal(scoreDurationDivisions(body), 183250, `${name} notation must cover the 183.250-second 1/32 grid before the 102 ms render pad`);
    assertNotatedDurationsAreCalculable(body);
    assert.match(body, /<(?:pitch|unpitched)>/, `${name} must contain sounding notes, not only rests`);
  }

  for (const [stemId, stemName] of EXPECTED_PARTS) {
    const stemXml = fs.readFileSync(path.join(STEM_ROOT, `${stemId}.musicxml`), "utf8");
    assert.deepEqual(parseScoreParts(stemXml).map(({ name }) => name), [stemName]);
    const stemBody = [...parsePartBodies(stemXml).values()][0];
    assert.equal((stemBody.match(/<measure number="/g) ?? []).length, 46);
    assert.equal(scoreDurationDivisions(stemBody), 183250);
    assertNotatedDurationsAreCalculable(stemBody);
    const stemMidi = new Midi(fs.readFileSync(path.join(STEM_ROOT, `${stemId}.mid`)));
    assert.deepEqual(stemMidi.tracks.map(({ name }) => name), [stemName]);
    assert.ok(stemMidi.tracks[0].notes.length > 0, `${stemName} MIDI stem must contain real notes`);
  }
});

test("generated MIDI realizes the seven chapter identities as audible notes and rhythm transformations", () => {
  runBuilder();
  const midi = new Midi(fs.readFileSync(path.join(SCORE_ROOT, "master.mid")));
  assert.equal(midi.header.ppq, 1000);
  assert.equal(midi.header.tempos.length, 1);
  assert.ok(Math.abs(midi.header.tempos[0].bpm - 60) < 0.001);
  assert.deepEqual(midi.tracks.map(({ name }) => name), EXPECTED_PARTS.map(([, name]) => name));

  notesAt(trackByName(midi, "Piano"), [24.7, 25.7, 26.7, 27.7, 28.7], [62, 65, 67, 69, 72]);

  const cello = trackByName(midi, "Cello");
  const cylinderStarts = [41.2, 41.85, 42.5, 43.15, 44.0];
  notesAt(cello, cylinderStarts, [50, 53, 55, 57, 60]);
  notesAt(cello, cylinderStarts.map((time) => time + 5.2), [50, 53, 55, 57, 60]);
  const pan = cello.controlChanges[10] ?? [];
  assert.ok(pan.some((event) => event.time >= 40.7 && event.time < 42 && event.value < 0.35));
  assert.ok(pan.some((event) => event.time > 52 && event.time < 56.7 && event.value > 0.65));

  notesAt(trackByName(midi, "Violin II"), [59.9, 60.65, 61.4, 62.15, 62.9], [74, 77, 79, 81, 84]);
  notesAt(trackByName(midi, "Viola"), [61.2, 61.7, 62.45, 63.45, 64.45], [62, 65, 67, 69, 72]);

  notesAt(trackByName(midi, "Celesta"), [79.2, 80.1, 81.0, 81.9, 82.8], [84, 81, 79, 77, 74]);

  notesAt(trackByName(midi, "Bass Clarinet"), [97.2, 98.1, 99.0, 99.9, 100.8], [50, 53, 55, 57, 60]);
  notesAt(cello, [97.8, 98.7, 99.6, 100.5, 101.4], [60, 57, 55, 53, 50]);

  notesAt(trackByName(midi, "Celesta"), [115.9, 116.65, 117.4, 118.15, 118.9], [74, 77, 79, 81, 84]);
  notesAt(trackByName(midi, "Violin I"), [117.4, 118.15, 118.9, 119.65, 120.4], [84, 81, 79, 77, 74]);

  notesAt(trackByName(midi, "Piano"), [134.7, 135.9, 137.5, 139.3, 141.7], [62, 65, 67, 69, 72]);
  const sphereWindow = [131.38, 156.301333];
  for (const name of ["Piano", "Violin I", "Violin II", "Viola", "Cello", "Double Bass", "French Horn", "Choir Aahs"]) {
    assert.ok(trackByName(midi, name).notes.some((note) => note.time >= sphereWindow[0] && note.time < sphereWindow[1]),
      `${name} must participate in the Sphere expansion`);
  }
  const resolution = trackByName(midi, "Piano").notes.filter((note) => Math.abs(note.time - 152.8) < 0.012).map(({ midi: pitch }) => pitch);
  assert.deepEqual(resolution, [38, 45, 50, 53, 57], "Sphere must cadence into a voiced D-minor resolution");
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
  assert.ok(percussion.notes.length <= 18, "percussion must punctuate rather than run continuously");
  assert.ok(percussion.notes.every((note) => note.duration <= 1.5));
});

test("SFX are sparse deterministic synthesis cues and every external audio resource has commercial-video clearance", () => {
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
    assert.equal(resource.commercialVideoUse, true, `${resource.id} must explicitly permit commercial video use`);
    assert.match(resource.license, /MIT|Apache-2\.0|BSD-3-Clause|GPL-3\.0|LGPL/i);
    assert.ok(resource.provenance);
  });
  const soundfont = licenses.resources.find(({ id }) => id === "ms-basic-sf3");
  assert.ok(soundfont);
  assert.equal(soundfont.license, "MIT");
  assert.match(soundfont.sha256, /^[a-f0-9]{64}$/);
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
  assert.ok(review.objectiveChecks.narrationBandHeadroomDb >= 6);
  assert.equal(review.evidence.type, "waveform-spectrum-form-contact-sheet");
});
