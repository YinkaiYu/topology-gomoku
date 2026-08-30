import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import midiPackage from "@tonejs/midi";

import { findFfmpeg, findMuseScore } from "./doctor.mjs";

const { Midi } = midiPackage;
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const pvRoot = path.resolve(scriptDirectory, "..");
const scoreRoot = path.join(pvRoot, "audio", "score");
const stemRoot = path.join(scoreRoot, "stems");
const renderedRoot = path.join(scoreRoot, "rendered");
const renderedStemRoot = path.join(renderedRoot, "stems");
const scorePlanPath = path.join(scoreRoot, "score-plan.json");
const sfxPlanPath = path.join(pvRoot, "audio", "sfx", "sfx-plan.json");
const sfxRoot = path.join(pvRoot, "audio", "sfx");
const voiceTimingPath = path.join(pvRoot, "audio", "voiceover", "timing.json");
const evidencePath = path.join(scoreRoot, "review-evidence.svg");
const EPSILON = 1e-7;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function secondsToDivisions(seconds, divisionsPerQuarter, tempoBpm) {
  return Math.round(seconds * divisionsPerQuarter * tempoBpm / 60);
}

function expandGestures(plan) {
  const byPart = new Map(plan.parts.map((part) => [part.id, []]));
  const automationByPart = new Map(plan.parts.map((part) => [part.id, []]));
  for (const gesture of plan.gestures) {
    if (!byPart.has(gesture.part)) {
      throw new Error(`Gesture ${gesture.id} references unknown part ${gesture.part}`);
    }
    const repeat = gesture.repeat ?? { count: 1, every: 0 };
    for (let repetition = 0; repetition < repeat.count; repetition += 1) {
      for (const sourceEvent of gesture.events) {
        byPart.get(gesture.part).push({
          gestureId: gesture.id,
          sectionId: gesture.sectionId,
          technique: gesture.technique,
          dynamic: gesture.dynamic,
          playback: gesture.playback ?? {},
          start: round(gesture.start + repetition * repeat.every + sourceEvent.offset),
          duration: round(sourceEvent.duration),
          pitches: [...sourceEvent.pitches].sort((left, right) => left - right),
          velocity: sourceEvent.velocity
        });
      }
    }
    for (const [controller, points] of Object.entries(gesture.automation ?? {})) {
      for (const point of points) {
        automationByPart.get(gesture.part).push({ controller, ...point });
      }
    }
  }
  for (const events of byPart.values()) {
    events.sort((left, right) => left.start - right.start || left.pitches[0] - right.pitches[0]);
  }
  return { byPart, automationByPart };
}

function validatePlan(plan, expanded) {
  const expectedDuration = plan.render.measureCount * 4 - 4 + plan.render.lastMeasureDivisions / plan.render.divisionsPerQuarter;
  if (Math.abs(expectedDuration - plan.timeline.durationSeconds) > EPSILON) {
    throw new Error(`Measure grid ${expectedDuration} does not equal timeline ${plan.timeline.durationSeconds}`);
  }
  if (plan.render.tempoBpm !== 60 || plan.render.divisionsPerQuarter !== 1000) {
    throw new Error("The score currently relies on a 60 BPM / 1000 divisions-per-quarter millisecond grid.");
  }
  const sectionIds = new Set(plan.form.map(({ id }) => id));
  const partById = new Map(plan.parts.map((part) => [part.id, part]));
  for (const gesture of plan.gestures) {
    if (!sectionIds.has(gesture.sectionId)) {
      throw new Error(`Gesture ${gesture.id} references unknown section ${gesture.sectionId}`);
    }
  }
  for (const [partId, events] of expanded.byPart) {
    const part = partById.get(partId);
    if (events.length === 0) {
      throw new Error(`${part.name} has no events`);
    }
    for (const event of events) {
      if (event.start < 0 || event.start + event.duration > plan.timeline.durationSeconds + EPSILON) {
        throw new Error(`${event.gestureId} exceeds the master timeline`);
      }
      if (!(event.duration >= 0.06)) {
        throw new Error(`${event.gestureId} contains an event shorter than 60 ms`);
      }
      for (const pitch of event.pitches) {
        if (!Number.isInteger(pitch) || pitch < part.concertRange[0] || pitch > part.concertRange[1]) {
          throw new Error(`${event.gestureId} pitch ${pitch} exceeds ${part.name} range`);
        }
      }
    }
    const lanes = part.staves === 2 ? [1, 2] : [1];
    for (const lane of lanes) {
      const laneEvents = events
        .map((event) => ({ ...event, pitches: event.pitches.filter((pitch) => part.staves !== 2 || (lane === 1 ? pitch >= 60 : pitch < 60)) }))
        .filter((event) => event.pitches.length > 0);
      for (let index = 1; index < laneEvents.length; index += 1) {
        const previous = laneEvents[index - 1];
        const current = laneEvents[index];
        if (previous.start + previous.duration > current.start + EPSILON) {
          throw new Error(`${part.name} lane ${lane} overlaps ${previous.gestureId} and ${current.gestureId}`);
        }
      }
    }
  }
}

function midiPitch(pitch) {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const spellings = [
    ["C", 0], ["C", 1], ["D", 0], ["E", -1], ["E", 0], ["F", 0],
    ["F", 1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]
  ];
  const [step, alter] = spellings[pitchClass];
  return { step, alter, octave: Math.floor(pitch / 12) - 1 };
}

function durationToType(duration) {
  const types = [
    [4000, "whole"], [3000, "half", 1], [2000, "half"], [1500, "quarter", 1],
    [1000, "quarter"], [750, "eighth", 1], [500, "eighth"], [375, "16th", 1], [250, "16th"], [125, "32nd"]
  ];
  const match = types.find(([units]) => units === duration);
  return match ? { type: match[1], dots: match[2] ?? 0 } : undefined;
}

function splitNotatedDuration(duration) {
  const values = [4000, 3000, 2000, 1500, 1000, 750, 500, 375, 250, 125];
  if (duration < 0 || duration % 125 !== 0) {
    throw new Error(`MusicXML duration ${duration} is outside the 1/32-note grid`);
  }
  const pieces = [];
  let remaining = duration;
  for (const value of values) {
    while (remaining >= value) {
      pieces.push(value);
      remaining -= value;
    }
  }
  if (remaining !== 0) {
    throw new Error(`Unable to notate duration ${duration}`);
  }
  return pieces;
}

function noteXml({ pitch, duration, voice, staff, chord, tieStart, tieStop, percussion, part }) {
  const { step, alter, octave } = midiPitch(pitch);
  const notationType = durationToType(duration);
  if (!notationType) {
    throw new Error(`No MusicXML note type for duration ${duration}`);
  }
  const ties = `${tieStop ? '      <tie type="stop"/>\n' : ""}${tieStart ? '      <tie type="start"/>\n' : ""}`;
  const notations = tieStart || tieStop
    ? `      <notations>${tieStop ? '<tied type="stop"/>' : ""}${tieStart ? '<tied type="start"/>' : ""}</notations>\n`
    : "";
  const pitchMarkup = percussion
    ? `      <instrument id="${part.scoreId}-I${pitch}"/>\n      <unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched>\n`
    : `      <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>\n`;
  return [
    "    <note>",
    chord ? "      <chord/>" : null,
    pitchMarkup.trimEnd(),
    ties.trimEnd() || null,
    `      <duration>${duration}</duration>`,
    `      <voice>${voice}</voice>`,
    `      <type>${notationType.type}</type>`,
    ...Array.from({ length: notationType.dots }, () => "      <dot/>"),
    `      <staff>${staff}</staff>`,
    notations.trimEnd() || null,
    "    </note>"
  ].filter(Boolean).join("\n");
}

function restXml(duration, voice, staff) {
  const notationType = durationToType(duration);
  if (!notationType) {
    throw new Error(`No MusicXML rest type for duration ${duration}`);
  }
  return [
    "    <note>",
    "      <rest/>",
    `      <duration>${duration}</duration>`,
    `      <voice>${voice}</voice>`,
    `      <type>${notationType.type}</type>`,
    ...Array.from({ length: notationType.dots }, () => "      <dot/>"),
    `      <staff>${staff}</staff>`,
    "    </note>"
  ].filter(Boolean).join("\n");
}

function dynamicXml(dynamic, offset) {
  return [
    "    <direction placement=\"below\">",
    `      <direction-type><dynamics><${dynamic}/></dynamics></direction-type>`,
    offset ? `      <offset sound="yes">${offset}</offset>` : null,
    "    </direction>"
  ].filter(Boolean).join("\n");
}

function wordsXml(words, offset, rehearsal = false) {
  return [
    "    <direction placement=\"above\">",
    rehearsal
      ? `      <direction-type><rehearsal enclosure="rectangle">${xmlEscape(words)}</rehearsal></direction-type>`
      : `      <direction-type><words font-style="italic" font-size="9">${xmlEscape(words)}</words></direction-type>`,
    offset ? `      <offset sound="no">${offset}</offset>` : null,
    "    </direction>"
  ].filter(Boolean).join("\n");
}

function playbackXml(playback, offset) {
  if (typeof playback?.pizzicato !== "boolean") return null;
  return [
    "    <direction placement=\"below\">",
    `      <direction-type><words font-style="italic" font-size="8">${playback.pizzicato ? "pizz." : "arco"}</words></direction-type>`,
    offset ? `      <offset sound="yes">${offset}</offset>` : null,
    `      <sound pizzicato="${playback.pizzicato ? "yes" : "no"}"/>`,
    "    </direction>"
  ].filter(Boolean).join("\n");
}

function laneEventsForPart(events, part, staff) {
  if (part.staves !== 2) {
    return events;
  }
  return events
    .map((event) => ({ ...event, pitches: event.pitches.filter((pitch) => staff === 1 ? pitch >= 60 : pitch < 60) }))
    .filter((event) => event.pitches.length > 0);
}

function renderLane({ events, part, staff, voice, measureStart, measureEnd, divisionsPerQuarter, tempoBpm }) {
  const segments = [];
  for (const event of laneEventsForPart(events, part, staff)) {
    const exactEventStart = secondsToDivisions(event.start, divisionsPerQuarter, tempoBpm);
    const exactEventEnd = secondsToDivisions(event.start + event.duration, divisionsPerQuarter, tempoBpm);
    const eventStart = Math.round(exactEventStart / 125) * 125;
    const eventEnd = Math.max(eventStart + 125, Math.round(exactEventEnd / 125) * 125);
    const segmentStart = Math.max(eventStart, measureStart);
    const segmentEnd = Math.min(eventEnd, measureEnd);
    if (segmentStart < segmentEnd) {
      segments.push({
        ...event,
        startUnits: segmentStart,
        endUnits: segmentEnd,
        tieStop: eventStart < measureStart,
        tieStart: eventEnd > measureEnd
      });
    }
  }
  segments.sort((left, right) => left.startUnits - right.startUnits || left.pitches[0] - right.pitches[0]);
  const result = [];
  let cursor = measureStart;
  for (const segment of segments) {
    if (segment.startUnits > cursor) {
      splitNotatedDuration(segment.startUnits - cursor).forEach((duration) => result.push(restXml(duration, voice, staff)));
    }
    const pieces = splitNotatedDuration(segment.endUnits - segment.startUnits);
    pieces.forEach((duration, pieceIndex) => {
      segment.pitches.forEach((pitch, pitchIndex) => result.push(noteXml({
        pitch,
        duration,
        voice,
        staff,
        chord: pitchIndex > 0,
        tieStart: segment.tieStart || pieceIndex < pieces.length - 1,
        tieStop: segment.tieStop || pieceIndex > 0,
        percussion: part.clef === "percussion",
        part
      })));
    });
    cursor = Math.max(cursor, segment.endUnits);
  }
  if (cursor < measureEnd) {
    splitNotatedDuration(measureEnd - cursor).forEach((duration) => result.push(restXml(duration, voice, staff)));
  }
  return result.join("\n");
}

function clefMarkup(part) {
  if (part.clef === "grand") {
    return "      <staves>2</staves>\n      <clef number=\"1\"><sign>G</sign><line>2</line></clef>\n      <clef number=\"2\"><sign>F</sign><line>4</line></clef>";
  }
  const clefs = {
    treble: ["G", 2],
    bass: ["F", 4],
    alto: ["C", 3],
    percussion: ["percussion", 2]
  };
  const [sign, line] = clefs[part.clef];
  return `      <clef><sign>${sign}</sign><line>${line}</line></clef>`;
}

function measureDurations(plan) {
  return Array.from({ length: plan.render.measureCount }, (_, index) =>
    index === plan.render.measureCount - 1 ? plan.render.notatedLastMeasureDivisions : 4 * plan.render.divisionsPerQuarter);
}

function sectionLabel(section) {
  const labels = {
    intro: "Prologue · sparse discovery",
    plane: "I · Plane — prime",
    cylinder: "II · Cylinder — one orbit",
    torus: "III · Torus — interlocked cycles",
    mobius: "IV · Möbius — retrograde",
    klein: "V · Klein — prime / mirror",
    projective: "VI · Projective — mirrored canon",
    sphere: "VII · Sphere — full resolution",
    gallery: "Gallery · memories",
    outro: "Outro · returning footsteps",
    "end-card": "End · resonance / silence"
  };
  return labels[section.id];
}

function partListXml(parts) {
  return parts.map((part) => {
    const percussionPitches = part.clef === "percussion" ? [36, 52, 59, 81] : [];
    const instruments = percussionPitches.length
      ? percussionPitches.map((pitch) => `      <score-instrument id="${part.scoreId}-I${pitch}"><instrument-name>${pitch === 36 ? "Muted Bass Drum" : pitch === 52 ? "Soft Chinese Cymbal" : pitch === 81 ? "Open Triangle" : "Suspended Cymbal"}</instrument-name><instrument-sound>${part.instrumentSound}</instrument-sound></score-instrument>`).join("\n")
      : `      <score-instrument id="${part.scoreId}-I1"><instrument-name>${xmlEscape(part.name)}</instrument-name><instrument-sound>${part.instrumentSound}</instrument-sound></score-instrument>`;
    const midi = percussionPitches.length
      ? percussionPitches.map((pitch) => `      <midi-instrument id="${part.scoreId}-I${pitch}"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>${pitch}</midi-unpitched><volume>72</volume><pan>0</pan></midi-instrument>`).join("\n")
      : `      <midi-instrument id="${part.scoreId}-I1"><midi-channel>${part.midiChannel + 1}</midi-channel><midi-program>${part.gmProgram + 1}</midi-program><volume>72</volume><pan>${round(part.stereoPosition * 90, 2)}</pan></midi-instrument>`;
    return [
      `    <score-part id="${part.scoreId}">`,
      `      <part-name>${xmlEscape(part.name)}</part-name>`,
      `      <part-abbreviation>${xmlEscape(part.abbreviation)}</part-abbreviation>`,
      instruments,
      midi,
      "    </score-part>"
    ].join("\n");
  }).join("\n");
}

function partBodyXml(plan, part, events, includeSectionMarks) {
  const durations = measureDurations(plan);
  let measureStart = 0;
  const techniqueStarts = new Map();
  for (const event of events) {
    const exactUnits = secondsToDivisions(event.start, plan.render.divisionsPerQuarter, plan.render.tempoBpm);
    const units = Math.round(exactUnits / plan.render.notationGridMilliseconds) * plan.render.notationGridMilliseconds;
    if (!techniqueStarts.has(event.gestureId)) {
      techniqueStarts.set(event.gestureId, { units, technique: event.technique, dynamic: event.dynamic, playback: event.playback });
    }
  }
  const measures = durations.map((measureDuration, index) => {
    const measureEnd = measureStart + measureDuration;
    const directions = [];
    if (index === 0) {
      directions.push([
        "    <direction placement=\"above\">",
        "      <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type>",
        "      <sound tempo=\"60\"/>",
        "    </direction>"
      ].join("\n"));
    }
    if (includeSectionMarks) {
      for (const section of plan.form) {
        const exactUnits = secondsToDivisions(section.start, plan.render.divisionsPerQuarter, plan.render.tempoBpm);
        const units = Math.round(exactUnits / plan.render.notationGridMilliseconds) * plan.render.notationGridMilliseconds;
        if (units >= measureStart && units < measureEnd) {
          directions.push(wordsXml(sectionLabel(section), units - measureStart, true));
        }
      }
    }
    for (const { units, technique, dynamic, playback } of techniqueStarts.values()) {
      if (units >= measureStart && units < measureEnd) {
        directions.push(wordsXml(technique, units - measureStart));
        directions.push(dynamicXml(dynamic, units - measureStart));
        const playbackDirection = playbackXml(playback, units - measureStart);
        if (playbackDirection) directions.push(playbackDirection);
      }
    }
    const keyChange = plan.render.keySignatureChanges?.find(({ measure }) => measure === index + 1);
    const timeChange = plan.render.timeSignatureChanges?.find(({ measure }) => measure === index + 1);
    const attributeContent = [
      index === 0 ? `      <divisions>${plan.render.divisionsPerQuarter}</divisions>` : null,
      keyChange ? `      <key><fifths>${keyChange.fifths}</fifths><mode>${keyChange.mode}</mode></key>` : null,
      timeChange ? `      <time><beats>${timeChange.beats}</beats><beat-type>${timeChange.beatType}</beat-type></time>` : null,
      index === 0 ? clefMarkup(part) : null
    ].filter(Boolean);
    const attributes = attributeContent.length ? [
      "    <attributes>",
      ...attributeContent,
      "    </attributes>"
    ].join("\n") : "";
    const staffOne = renderLane({
      events, part, staff: 1, voice: 1, measureStart, measureEnd,
      divisionsPerQuarter: plan.render.divisionsPerQuarter, tempoBpm: plan.render.tempoBpm
    });
    const staffTwo = part.staves === 2 ? [
      `    <backup><duration>${measureDuration}</duration></backup>`,
      renderLane({
        events, part, staff: 2, voice: 2, measureStart, measureEnd,
        divisionsPerQuarter: plan.render.divisionsPerQuarter, tempoBpm: plan.render.tempoBpm
      })
    ].join("\n") : "";
    const implicit = index === durations.length - 1 ? ' implicit="yes"' : "";
    const markup = [
      `  <measure number="${index + 1}"${implicit}>`,
      attributes,
      ...directions,
      staffOne,
      staffTwo,
      "  </measure>"
    ].filter(Boolean).join("\n");
    measureStart = measureEnd;
    return markup;
  });
  return ` <part id="${part.scoreId}">\n${measures.join("\n")}\n </part>`;
}

function musicXml(plan, parts, eventsByPart) {
  const bodies = parts.map((part, index) => partBodyXml(plan, part, eventsByPart.get(part.id), index === 0)).join("\n");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>",
    "<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 4.0 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">",
    "<score-partwise version=\"4.0\">",
    `  <work><work-title>${xmlEscape(plan.title)}</work-title></work>`,
    "  <identification>",
    `    <creator type="composer">${xmlEscape(plan.composerCredit)}</creator>`,
    `    <rights>${xmlEscape(plan.copyright)}</rights>`,
    "    <encoding><software>Footsteps Return deterministic score builder</software><encoding-description>Original score generated from score-plan.json; no external source music.</encoding-description></encoding>",
    "  </identification>",
    "  <defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults>",
    "  <part-list>",
    partListXml(parts),
    "  </part-list>",
    bodies,
    "</score-partwise>",
    ""
  ].join("\n");
}

function configureMidiHeader(midi, plan) {
  const keyNameByFifths = new Map([
    [-7, "Cb"], [-6, "Gb"], [-5, "Db"], [-4, "Ab"], [-3, "Eb"], [-2, "Bb"], [-1, "F"],
    [0, "C"], [1, "G"], [2, "D"], [3, "A"], [4, "E"], [5, "B"], [6, "F#"], [7, "C#"]
  ]);
  const measureTicks = 4 * plan.render.divisionsPerQuarter;
  midi.header.fromJSON({
    name: plan.title,
    ppq: plan.render.divisionsPerQuarter,
    tempos: [{ bpm: plan.render.tempoBpm, ticks: 0 }],
    timeSignatures: plan.render.timeSignatureChanges.map(({ measure, beats, beatType }) => ({
      ticks: (measure - 1) * measureTicks,
      timeSignature: [String(beats).split("+").reduce((sum, value) => sum + Number(value), 0), beatType],
      measures: measure - 1
    })),
    keySignatures: plan.render.keySignatureChanges.map(({ measure, fifths, mode }) => ({
      ticks: (measure - 1) * measureTicks,
      key: keyNameByFifths.get(fifths),
      scale: mode === "minor" ? "minor" : "major"
    })),
    meta: plan.form.map((section) => ({
      ticks: secondsToDivisions(section.start, plan.render.divisionsPerQuarter, plan.render.tempoBpm),
      text: sectionLabel(section),
      type: "marker"
    }))
  });
}

function midiBytes(plan, parts, eventsByPart, automationByPart) {
  const midi = new Midi();
  configureMidiHeader(midi, plan);
  for (const part of parts) {
    const track = midi.addTrack();
    track.name = part.name;
    track.channel = part.midiChannel;
    track.instrument.number = part.gmProgram;
    for (const event of eventsByPart.get(part.id)) {
      for (const pitch of event.pitches) {
        track.addNote({
          midi: pitch,
          ticks: secondsToDivisions(event.start, plan.render.divisionsPerQuarter, plan.render.tempoBpm),
          durationTicks: secondsToDivisions(event.duration, plan.render.divisionsPerQuarter, plan.render.tempoBpm),
          velocity: event.velocity,
          noteOffVelocity: Math.max(0.05, event.velocity * 0.55)
        });
      }
    }
    for (const automation of automationByPart.get(part.id)) {
      if (automation.controller === "pan") {
        track.addCC({
          number: 10,
          ticks: secondsToDivisions(automation.time, plan.render.divisionsPerQuarter, plan.render.tempoBpm),
          value: automation.value
        });
      }
    }
  }
  const bytes = midi.toArray();
  // @tonejs/midi 2.0.28 writes the key-name array index plus seven instead of
  // the signed circle-of-fifths value. Patch only the emitted FF 59 events so
  // the deterministic MIDI carries the same real signatures as MusicXML.
  let keySignatureIndex = 0;
  for (let index = 0; index + 4 < bytes.length && keySignatureIndex < plan.render.keySignatureChanges.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0x59 && bytes[index + 2] === 0x02) {
      const change = plan.render.keySignatureChanges[keySignatureIndex];
      bytes[index + 3] = change.fifths < 0 ? 256 + change.fifths : change.fifths;
      bytes[index + 4] = change.mode === "minor" ? 1 : 0;
      keySignatureIndex += 1;
    }
  }
  if (keySignatureIndex !== plan.render.keySignatureChanges.length) {
    throw new Error(`Expected ${plan.render.keySignatureChanges.length} MIDI key signatures, found ${keySignatureIndex}`);
  }
  return bytes;
}

function xorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0x100000000) * 2 - 1;
  };
}

function synthesizeSfx(generator, sampleRate) {
  const { category, parameters: parameters, seed } = generator;
  const frameCount = Math.round(parameters.duration * sampleRate);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  const random = xorshift32(seed);
  let filtered = 0;
  let slowFiltered = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const progress = index / Math.max(1, frameCount - 1);
    let mono = 0;
    let pan = 0;
    if (category === "stone-placement") {
      const noise = random();
      const coefficient = 1 - Math.exp(-2 * Math.PI * parameters.lowPassHz / sampleRate);
      filtered += coefficient * (noise - filtered);
      mono = filtered * Math.exp(-parameters.noiseDecay * time) * 0.7;
      parameters.partialsHz.forEach((frequency, partialIndex) => {
        mono += Math.sin(2 * Math.PI * frequency * time) * Math.exp(-parameters.partialDecay[partialIndex] * time) * 0.42;
      });
      pan = Math.sin(progress * Math.PI) * parameters.stereoWidth;
    } else if (category === "seam-crossing") {
      const [from, to] = parameters.chirpHz;
      const frequency = from + (to - from) * progress;
      const phase = 2 * Math.PI * (from * time + 0.5 * (to - from) * time * progress);
      const window = Math.sin(Math.PI * progress) ** 2;
      const noise = random();
      filtered += 0.16 * (noise - filtered);
      slowFiltered += 0.025 * (noise - slowFiltered);
      mono = (Math.sin(phase) * 0.58 + (filtered - slowFiltered) * 0.36) * window;
      pan = parameters.pan[0] + (parameters.pan[1] - parameters.pan[0]) * progress;
    } else if (category === "surface-bend") {
      const window = Math.sin(Math.PI * progress) ** 2;
      parameters.partialsHz.forEach(([from, to], partialIndex) => {
        const average = (from + (to - from) * progress * 0.5);
        mono += Math.sin(2 * Math.PI * average * time + partialIndex * 0.73) * window / (partialIndex + 1);
      });
      pan = Math.sin(progress * Math.PI * 2) * parameters.stereoWidth;
    } else if (category === "camera-occlusion") {
      const cutoff = parameters.lowPassHz[0] * (1 - progress) + parameters.lowPassHz[1] * progress;
      const coefficient = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
      filtered += coefficient * (random() - filtered);
      const attack = Math.min(1, progress / 0.18);
      const release = Math.min(1, (1 - progress) / 0.42);
      mono = filtered * Math.min(attack, release);
      pan = parameters.pan[0] + (parameters.pan[1] - parameters.pan[0]) * progress;
    } else if (category === "chapter-low-punctuation") {
      parameters.partialsHz.forEach((frequency, partialIndex) => {
        mono += Math.sin(2 * Math.PI * frequency * time) * parameters.partialGain[partialIndex] * Math.exp(-parameters.decay[partialIndex] * time);
      });
    } else {
      throw new Error(`Unsupported SFX category ${category}`);
    }
    const gain = parameters.gain;
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    left[index] = mono * gain * leftGain;
    right[index] = mono * gain * rightGain;
  }
  return { left, right, sampleRate };
}

function writePcm16Wave(filePath, audio) {
  const frameCount = audio.left.length;
  const channels = 2;
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const dataLength = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(audio.sampleRate, 24);
  buffer.writeUInt32LE(audio.sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < frameCount; index += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.left[index])) * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.right[index])) * 32767), 46 + index * 4);
  }
  fs.writeFileSync(filePath, buffer);
}

function signalStats(channels) {
  let peak = 0;
  let squareSum = 0;
  let samples = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      squareSum += sample * sample;
      samples += 1;
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, samples));
  const toDb = (value) => value > 0 ? 20 * Math.log10(value) : -Infinity;
  return { peakDbfs: round(toDb(peak), 3), rmsDbfs: round(toDb(rms), 3) };
}

function buildSfx(sfxPlan) {
  const generatedRoot = path.join(sfxRoot, "generated");
  fs.mkdirSync(generatedRoot, { recursive: true });
  const files = [];
  for (const generator of sfxPlan.generators) {
    const audio = synthesizeSfx(generator, sfxPlan.sampleRate);
    const outputPath = path.join(pvRoot, generator.outputFile.replaceAll("/", path.sep));
    writePcm16Wave(outputPath, audio);
    files.push({
      id: generator.id,
      category: generator.category,
      path: path.relative(pvRoot, outputPath).replaceAll(path.sep, "/"),
      sha256: sha256(outputPath),
      sampleRate: sfxPlan.sampleRate,
      channels: 2,
      bitDepth: 16,
      durationSeconds: round(audio.left.length / sfxPlan.sampleRate, 6),
      ...signalStats([audio.left, audio.right])
    });
  }
  writeJson(path.join(sfxRoot, "render-metadata.json"), {
    schemaVersion: 1,
    generator: "scripts/build-score.mjs deterministic synthesis",
    externalSamples: [],
    files
  });
}

function buildScore() {
  const plan = readJson(scorePlanPath);
  const sfxPlan = readJson(sfxPlanPath);
  const expanded = expandGestures(plan);
  validatePlan(plan, expanded);
  fs.mkdirSync(stemRoot, { recursive: true });
  fs.mkdirSync(renderedStemRoot, { recursive: true });
  fs.writeFileSync(path.join(scoreRoot, "master.musicxml"), musicXml(plan, plan.parts, expanded.byPart), "utf8");
  fs.writeFileSync(path.join(scoreRoot, "master.mid"), midiBytes(plan, plan.parts, expanded.byPart, expanded.automationByPart));
  for (const part of plan.parts) {
    fs.writeFileSync(path.join(stemRoot, `${part.id}.musicxml`), musicXml(plan, [part], expanded.byPart), "utf8");
    fs.writeFileSync(path.join(stemRoot, `${part.id}.mid`), midiBytes(plan, [part], expanded.byPart, expanded.automationByPart));
  }
  buildSfx(sfxPlan);
  console.log(`✓ Built original score: ${plan.parts.length} parts, ${plan.gestures.length} gestures, ${plan.timeline.durationSeconds}s.`);
}

function parseWave(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${filePath} is not a RIFF/WAVE file`);
  }
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
  const integerPcm = format && (format.audioFormat === 1 || (format.audioFormat === 65534 && format.subFormatCode === 1));
  if (!format || !data || !integerPcm || ![16, 24, 32].includes(format.bitsPerSample)) {
    throw new Error(`${filePath} must be integer PCM16/24/32`);
  }
  const bytesPerSample = format.bitsPerSample / 8;
  const frameCount = Math.floor(data.length / format.blockAlign);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frameCount));
  const scale = 2 ** (format.bitsPerSample - 1);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = frame * format.blockAlign + channel * bytesPerSample;
      let integer;
      if (bytesPerSample === 2) {
        integer = data.readInt16LE(sampleOffset);
      } else if (bytesPerSample === 3) {
        integer = data.readUIntLE(sampleOffset, 3);
        if (integer & 0x800000) integer -= 0x1000000;
      } else {
        integer = data.readInt32LE(sampleOffset);
      }
      channels[channel][frame] = integer / scale;
    }
  }
  return { ...format, frameCount, channels, durationSeconds: frameCount / format.sampleRate };
}

function windowRms(wave, startSeconds, endSeconds) {
  const first = Math.max(0, Math.floor(startSeconds * wave.sampleRate));
  const last = Math.min(wave.frameCount, Math.ceil(endSeconds * wave.sampleRate));
  let squareSum = 0;
  let samples = 0;
  for (const channel of wave.channels) {
    for (let index = first; index < last; index += 1) {
      squareSum += channel[index] * channel[index];
      samples += 1;
    }
  }
  return Math.sqrt(squareSum / Math.max(1, samples));
}

function toDb(value) {
  return 20 * Math.log10(Math.max(value, 1e-12));
}

function channelWindowRms(wave, channelIndex, startSeconds, endSeconds) {
  const first = Math.max(0, Math.floor(startSeconds * wave.sampleRate));
  const last = Math.min(wave.frameCount, Math.ceil(endSeconds * wave.sampleRate));
  let squareSum = 0;
  for (let index = first; index < last; index += 1) {
    squareSum += wave.channels[channelIndex][index] ** 2;
  }
  return Math.sqrt(squareSum / Math.max(1, last - first));
}

function presenceBandRms(wave, startSeconds, endSeconds, lowHz = 180, highHz = 4500) {
  const warmupStart = Math.max(0, startSeconds - 0.25);
  const first = Math.floor(warmupStart * wave.sampleRate);
  const measuredFirst = Math.max(first, Math.floor(startSeconds * wave.sampleRate));
  const last = Math.min(wave.frameCount, Math.ceil(endSeconds * wave.sampleRate));
  const dt = 1 / wave.sampleRate;
  const highPassAlpha = (1 / (2 * Math.PI * lowHz)) / ((1 / (2 * Math.PI * lowHz)) + dt);
  const lowPassAlpha = dt / ((1 / (2 * Math.PI * highHz)) + dt);
  let squareSum = 0;
  let samples = 0;
  for (const channel of wave.channels) {
    let previousInput = 0;
    let highPassed = 0;
    let bandPassed = 0;
    for (let index = first; index < last; index += 1) {
      const input = channel[index];
      highPassed = highPassAlpha * (highPassed + input - previousInput);
      previousInput = input;
      bandPassed += lowPassAlpha * (highPassed - bandPassed);
      if (index >= measuredFirst) {
        squareSum += bandPassed * bandPassed;
        samples += 1;
      }
    }
  }
  return Math.sqrt(squareSum / Math.max(1, samples));
}

function voiceScoreEvidence(masterWave) {
  const timing = readJson(voiceTimingPath);
  const projectRoot = path.resolve(pvRoot, "..", "..");
  const cues = timing.cues.map((cue) => {
    const voicePath = path.resolve(projectRoot, cue.outputFile);
    if (!fs.existsSync(voicePath)) throw new Error(`Missing actual dry voice cue PCM ${voicePath}`);
    const actualHash = sha256(voicePath);
    if (actualHash !== cue.sha256) throw new Error(`Dry voice cue hash mismatch for ${cue.id}`);
    const voiceWave = parseWave(voicePath);
    const start = cue.timelineStartSeconds;
    const end = cue.timelineEndSeconds;
    const voiceRmsDbfs = toDb(windowRms(voiceWave, 0, voiceWave.durationSeconds));
    const scoreRmsDbfs = toDb(windowRms(masterWave, start, end));
    const voicePresenceBandRmsDbfs = toDb(presenceBandRms(voiceWave, 0, voiceWave.durationSeconds));
    const scorePresenceBandRmsDbfs = toDb(presenceBandRms(masterWave, start, end));
    return {
      id: cue.id,
      timelineStartSeconds: start,
      timelineEndSeconds: end,
      voiceSha256: actualHash,
      voiceRmsDbfs: round(voiceRmsDbfs, 2),
      scoreRmsDbfs: round(scoreRmsDbfs, 2),
      voiceToScoreRmsMarginDb: round(voiceRmsDbfs - scoreRmsDbfs, 2),
      voicePresenceBandRmsDbfs: round(voicePresenceBandRmsDbfs, 2),
      scorePresenceBandRmsDbfs: round(scorePresenceBandRmsDbfs, 2),
      voiceToScorePresenceBandMarginDb: round(voicePresenceBandRmsDbfs - scorePresenceBandRmsDbfs, 2)
    };
  });
  return {
    cueCount: cues.length,
    presenceBandHz: [180, 4500],
    minimumVoiceToScoreRmsMarginDb: Math.min(...cues.map(({ voiceToScoreRmsMarginDb }) => voiceToScoreRmsMarginDb)),
    minimumVoiceToScorePresenceBandMarginDb: Math.min(...cues.map(({ voiceToScorePresenceBandMarginDb }) => voiceToScorePresenceBandMarginDb)),
    method: "Actual dry voice cue PCM is hash-verified against timing.json, then compared with the exact score-master timeline window using broadband RMS and a cascaded first-order 180 Hz high-pass / 4500 Hz low-pass presence-band RMS. Digital-silence windows use a deterministic -240 dBFS analysis floor so every reported margin remains finite.",
    cues
  };
}

function narrationDensityEvidence() {
  const timing = readJson(voiceTimingPath);
  const midi = new Midi(fs.readFileSync(path.join(scoreRoot, "master.mid")));
  const notes = midi.tracks.flatMap((track) => track.notes.map((note) => ({
    time: note.time,
    end: note.time + note.duration
  })));
  const cues = timing.cues.map((cue) => {
    const start = cue.timelineStartSeconds;
    const end = cue.timelineEndSeconds;
    const duration = end - start;
    const noteOnsets = notes.filter((note) => note.time >= start && note.time < end).length;
    const sweep = [];
    for (const note of notes) {
      if (note.time < end && note.end > start) {
        sweep.push({ time: Math.max(start, note.time), delta: 1 });
        sweep.push({ time: Math.min(end, note.end), delta: -1 });
      }
    }
    sweep.sort((left, right) => left.time - right.time || left.delta - right.delta);
    let active = 0;
    let maximumSimultaneousPitches = 0;
    for (const point of sweep) {
      active += point.delta;
      maximumSimultaneousPitches = Math.max(maximumSimultaneousPitches, active);
    }
    return {
      id: cue.id,
      noteOnsets,
      noteOnsetsPerSecond: round(noteOnsets / duration, 2),
      maximumSimultaneousPitches
    };
  });
  return {
    cueCount: cues.length,
    source: "generated master.mid note-on events and sounding-note intervals",
    maximumNoteOnsetsPerSecond: Math.max(...cues.map(({ noteOnsetsPerSecond }) => noteOnsetsPerSecond)),
    maximumSimultaneousPitches: Math.max(...cues.map(({ maximumSimultaneousPitches }) => maximumSimultaneousPitches)),
    cues
  };
}

function cylinderStereoEvidence(plan, celloWave, celloSha256) {
  const window = (startSeconds, endSeconds) => {
    const leftRmsDbfs = toDb(channelWindowRms(celloWave, 0, startSeconds, endSeconds));
    const rightRmsDbfs = toDb(channelWindowRms(celloWave, 1, startSeconds, endSeconds));
    return {
      startSeconds,
      endSeconds,
      leftRmsDbfs: round(leftRmsDbfs, 2),
      rightRmsDbfs: round(rightRmsDbfs, 2),
      leftMinusRightRmsDb: round(leftRmsDbfs - rightRmsDbfs, 2)
    };
  };
  const declared = plan.reviewWindows?.cylinderStereoMotion;
  if (!declared?.early || !declared?.late) throw new Error("score plan must declare retimed Cylinder review windows");
  const earlyWindow = window(declared.early.startSeconds, declared.early.endSeconds);
  const lateWindow = window(declared.late.startSeconds, declared.late.endSeconds);
  return {
    stemId: "cello",
    sourceStemSha256: celloSha256,
    automationConsumer: "scripts/score-audio.mjs equal-power PCM spatializer applied to the real MuseScore Basic cello stem",
    earlyWindow,
    lateWindow,
    leftToRightSwingDb: round(earlyWindow.leftMinusRightRmsDb - lateWindow.leftMinusRightRmsDb, 2)
  };
}

function chapterRenderProfiles(plan, stemPaths) {
  const profiles = plan.chapterWorlds.map(({ id }) => {
    const section = plan.form.find((candidate) => candidate.id === id);
    return { chapterId: id, startSeconds: section.start, endSeconds: section.end, stemRmsDbfs: [] };
  });
  for (const { part, filePath } of stemPaths) {
    const wave = parseWave(filePath);
    for (const profile of profiles) {
      const rmsDbfs = toDb(windowRms(wave, profile.startSeconds, profile.endSeconds));
      profile.stemRmsDbfs.push({ id: part.id, rmsDbfs: Number.isFinite(rmsDbfs) ? round(rmsDbfs, 2) : null });
    }
  }
  return profiles.map((profile) => {
    const rankedParts = profile.stemRmsDbfs
      .filter(({ rmsDbfs }) => Number.isFinite(rmsDbfs))
      .sort((left, right) => right.rmsDbfs - left.rmsDbfs)
      .map(({ id }) => id);
    return {
      ...profile,
      dominantPart: rankedParts[0],
      rankedParts,
      activeParts: rankedParts.filter((id) => profile.stemRmsDbfs.find((stem) => stem.id === id).rmsDbfs > -80)
    };
  });
}

function chapterJoinContinuity(plan, masterWave) {
  const joins = plan.joins.map(({ from, to, boundary }) => ({
    from,
    to,
    boundarySeconds: boundary,
    centeredWindowSeconds: [round(boundary - 0.25, 6), round(boundary + 0.25, 6)],
    centeredWindowRmsDbfs: round(toDb(windowRms(masterWave, boundary - 0.25, boundary + 0.25)), 2)
  }));
  return {
    boundaryCount: joins.length,
    method: "RMS of the exact rendered master PCM in a 500 ms window centered on all nine composed joins from intro→Plane through gallery→outro; MIDI tests separately require overlapping sounding notes and pickups.",
    minimumCenteredWindowRmsDbfs: Math.min(...joins.map(({ centeredWindowRmsDbfs }) => centeredWindowRmsDbfs)),
    joins
  };
}

function lateTimelineCoverage(plan, masterWave) {
  const midi = new Midi(fs.readFileSync(path.join(scoreRoot, "master.mid")));
  const noteEnds = midi.tracks.flatMap((track) => track.notes.map((note) => note.time + note.duration));
  const lastNotatedEventEndSeconds = Math.max(...noteEnds);
  const outro = plan.form.find(({ id }) => id === "outro");
  const endCard = plan.form.find(({ id }) => id === "end-card");
  if (!outro || !endCard) throw new Error("late timeline coverage requires outro and end-card form sections");
  return {
    source: "generated master.mid exact note ends plus exact rendered master PCM form windows",
    lastNotatedEventEndSeconds: round(lastNotatedEventEndSeconds),
    tailSilenceSeconds: round(plan.timeline.durationSeconds - lastNotatedEventEndSeconds),
    outroWindowSeconds: [outro.start, outro.end],
    outroRmsDbfs: round(toDb(windowRms(masterWave, outro.start, outro.end)), 2),
    endCardTailWindowSeconds: [endCard.start, Math.min(endCard.end, lastNotatedEventEndSeconds)],
    endCardTailRmsDbfs: round(toDb(windowRms(masterWave, endCard.start, Math.min(endCard.end, lastNotatedEventEndSeconds))), 2)
  };
}

function spectrumFingerprint(wave) {
  const frequencies = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const windowSize = 4096;
  const windows = 18;
  const monoAt = (index) => wave.channels.reduce((sum, channel) => sum + channel[index], 0) / wave.channels.length;
  return frequencies.map((frequency) => {
    let energy = 0;
    for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
      const center = Math.floor((windowIndex + 0.5) / windows * wave.frameCount);
      const start = Math.max(0, Math.min(wave.frameCount - windowSize, center - windowSize / 2));
      let real = 0;
      let imaginary = 0;
      for (let sampleIndex = 0; sampleIndex < windowSize; sampleIndex += 1) {
        const sample = monoAt(start + sampleIndex) * (0.5 - 0.5 * Math.cos(2 * Math.PI * sampleIndex / (windowSize - 1)));
        const phase = 2 * Math.PI * frequency * sampleIndex / wave.sampleRate;
        real += sample * Math.cos(phase);
        imaginary -= sample * Math.sin(phase);
      }
      energy += Math.sqrt(real * real + imaginary * imaginary) / windowSize;
    }
    const magnitude = energy / windows;
    return { frequencyHz: frequency, db: round(magnitude > 0 ? 20 * Math.log10(magnitude) : -120, 2) };
  });
}

function waveformEnvelope(wave, columns = 900) {
  const monoPeak = [];
  for (let column = 0; column < columns; column += 1) {
    const start = Math.floor(column / columns * wave.frameCount);
    const end = Math.max(start + 1, Math.floor((column + 1) / columns * wave.frameCount));
    let peak = 0;
    const stride = Math.max(1, Math.floor((end - start) / 160));
    for (let index = start; index < end; index += stride) {
      const sample = wave.channels.reduce((sum, channel) => sum + channel[index], 0) / wave.channels.length;
      peak = Math.max(peak, Math.abs(sample));
    }
    monoPeak.push(peak);
  }
  return monoPeak;
}

function toolVersion(command, args) {
  if (!command) return null;
  const result = spawnSync(command, args, { encoding: "utf8" });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split(/\r?\n/)[0] || null;
}

function audioMetadata(filePath) {
  const wave = parseWave(filePath);
  return {
    path: path.relative(pvRoot, filePath).replaceAll(path.sep, "/"),
    sha256: sha256(filePath),
    sampleRate: wave.sampleRate,
    channels: wave.channels.length,
    bitDepth: wave.bitsPerSample,
    durationSeconds: round(wave.durationSeconds, 6),
    ...signalStats(wave.channels)
  };
}

function timelineLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remaining}`;
}

function evidenceSvg(plan, masterWave, masterStats, fingerprint, objectiveChecks) {
  const width = 1800;
  const height = 1040;
  const left = 120;
  const plotWidth = 1560;
  const waveTop = 255;
  const waveHeight = 300;
  const envelope = waveformEnvelope(masterWave);
  const maxPeak = Math.max(...envelope, 0.001);
  const topPoints = envelope.map((peak, index) => `${left + index / (envelope.length - 1) * plotWidth},${waveTop + waveHeight / 2 - peak / maxPeak * waveHeight * 0.45}`).join(" ");
  const bottomPoints = [...envelope].reverse().map((peak, reverseIndex) => {
    const index = envelope.length - 1 - reverseIndex;
    return `${left + index / (envelope.length - 1) * plotWidth},${waveTop + waveHeight / 2 + peak / maxPeak * waveHeight * 0.45}`;
  }).join(" ");
  const colors = ["#6e7f91", "#8fa0ad", "#768d9a", "#9aa6ac", "#687b87", "#8897a0", "#a4b0b5", "#7f919a", "#9ba8ad", "#72838c", "#4f5d65"];
  const form = plan.form.map((section, index) => {
    const x = left + section.start / plan.timeline.durationSeconds * plotWidth;
    const sectionWidth = (section.end - section.start) / plan.timeline.durationSeconds * plotWidth;
    const shortLabel = section.id === "end-card" ? "end" : section.id;
    return `<rect x="${round(x, 2)}" y="165" width="${round(sectionWidth, 2)}" height="54" fill="${colors[index]}" opacity="0.78"/><text x="${round(x + sectionWidth / 2, 2)}" y="198" text-anchor="middle" class="form">${xmlEscape(shortLabel)}</text>`;
  }).join("\n");
  const minDb = Math.floor(Math.min(...fingerprint.map(({ db }) => db), -72) / 6) * 6;
  const maxDb = Math.max(...fingerprint.map(({ db }) => db), -18);
  const bars = fingerprint.map(({ frequencyHz, db }, index) => {
    const barWidth = 110;
    const gap = 55;
    const x = left + 65 + index * (barWidth + gap);
    const normalized = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb || 1)));
    const barHeight = normalized * 250;
    return `<rect x="${x}" y="${900 - barHeight}" width="${barWidth}" height="${barHeight}" rx="8" fill="#91a6b2"/><text x="${x + barWidth / 2}" y="928" text-anchor="middle" class="axis">${frequencyHz >= 1000 ? `${frequencyHz / 1000}k` : frequencyHz} Hz</text><text x="${x + barWidth / 2}" y="${884 - barHeight}" text-anchor="middle" class="axis">${db.toFixed(1)} dB</text>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Footsteps Return score waveform, form and spectrum evidence</title>
  <desc id="desc">A deterministic contact sheet aligning the ${plan.timeline.durationSeconds.toFixed(3)}-second score waveform with all form sections and a nine-band spectral fingerprint.</desc>
  <style>
    text { font-family: "Segoe UI", sans-serif; fill: #dfe6ea; } .title { font-size: 38px; font-weight: 600; } .meta { font-size: 20px; fill: #aebcc4; }
    .form { font-size: 15px; fill: #10161a; font-weight: 600; } .axis { font-size: 16px; fill: #aebcc4; } .label { font-size: 23px; font-weight: 600; }
  </style>
  <rect width="1800" height="1040" fill="#11181c"/>
  <text x="120" y="72" class="title">Footsteps Return · original score evidence</text>
  <text x="120" y="112" class="meta">${plan.timeline.durationSeconds.toFixed(3)} s · 48 kHz stereo · MS Basic · SHA-256 ${masterStats.sha256.slice(0, 16)}…</text>
  <text x="120" y="146" class="meta">Peak ${masterStats.peakDbfs.toFixed(3)} dBFS · RMS ${masterStats.rmsDbfs.toFixed(3)} dBFS · voice/score ≥ ${objectiveChecks.voiceScoreComparison.minimumVoiceToScoreRmsMarginDb.toFixed(2)} dB · Cylinder swing ${objectiveChecks.cylinderStereoMotion.leftToRightSwingDb.toFixed(2)} dB</text>
  ${form}
  <text x="120" y="246" class="label">Waveform envelope aligned to final timeline</text>
  <line x1="120" y1="405" x2="1680" y2="405" stroke="#34444d"/>
  <polygon points="${topPoints} ${bottomPoints}" fill="#bed0d8" opacity="0.82"/>
  <text x="120" y="584" class="axis">${timelineLabel(0)}</text><text x="900" y="584" text-anchor="middle" class="axis">${timelineLabel(plan.timeline.durationSeconds / 2)}</text><text x="1680" y="584" text-anchor="end" class="axis">${timelineLabel(plan.timeline.durationSeconds)}</text>
  <text x="120" y="640" class="label">Nine-band spectral fingerprint (windowed whole-score samples)</text>
  <line x1="120" y1="900" x2="1680" y2="900" stroke="#34444d"/>
  ${bars}
  <text x="120" y="998" class="meta">Evidence: exact rendered PCM, hash-verified dry voice PCM, channel-window RMS, MIDI density, waveform peaks and 4096-sample Hann-window DFT. No subjective listening claim.</text>
</svg>
`;
}

function analyzeRender() {
  const plan = readJson(scorePlanPath);
  const masterPath = path.join(renderedRoot, "master.wav");
  const stemPaths = plan.parts.map((part) => ({ part, filePath: path.join(renderedStemRoot, `${part.id}.wav`) }));
  for (const filePath of [masterPath, ...stemPaths.map(({ filePath }) => filePath)]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing rendered WAV ${filePath}`);
    }
  }
  const masterWave = parseWave(masterPath);
  const master = audioMetadata(masterPath);
  const stems = stemPaths.map(({ part, filePath }) => ({ id: part.id, name: part.name, ...audioMetadata(filePath) }));
  const museScore = findMuseScore();
  const ffmpeg = findFfmpeg();
  const soundfontPath = museScore ? path.resolve(path.dirname(museScore), "..", "sound", "MS Basic.sf3") : undefined;
  const soundfontSha256 = soundfontPath && fs.existsSync(soundfontPath) ? sha256(soundfontPath) : null;
  const metadata = {
    schemaVersion: 1,
    timelineDurationSeconds: plan.timeline.durationSeconds,
    source: {
      scorePlanSha256: sha256(scorePlanPath),
      masterMusicXmlSha256: sha256(path.join(scoreRoot, "master.musicxml")),
      masterMidiSha256: sha256(path.join(scoreRoot, "master.mid"))
    },
    renderer: {
      museScore: toolVersion(museScore, ["--version"]),
      ffmpeg: toolVersion(ffmpeg, ["-version"]),
      soundProfile: plan.render.soundProfile,
      soundfontSha256,
      pathResolution: "doctor.mjs resolves MuseScore and FFmpeg to existing absolute executables; render script rejects non-rooted results",
      masterAssembly: "Every final stem is a real MuseScore Basic MusicXML render. scripts/score-audio.mjs consumes declared stereo placement/automation on the resulting PCM, then FFmpeg sums those exact stems into master.wav."
    },
    master,
    stems
  };
  writeJson(path.join(scoreRoot, "render-metadata.json"), metadata);

  const fingerprint = spectrumFingerprint(masterWave);
  const reviewAssetPath = path.join(scoreRoot, "review", "score-review.opus");
  if (!fs.existsSync(reviewAssetPath)) {
    throw new Error(`Missing low-bitrate review asset ${reviewAssetPath}`);
  }
  const voiceScoreComparison = voiceScoreEvidence(masterWave);
  const narrationWindowDensity = narrationDensityEvidence();
  const cello = stems.find(({ id }) => id === "cello");
  const celloWave = parseWave(path.join(renderedStemRoot, "cello.wav"));
  const cylinderStereoMotion = cylinderStereoEvidence(plan, celloWave, cello.sha256);
  const renderedChapterProfiles = chapterRenderProfiles(plan, stemPaths);
  const renderedJoinContinuity = chapterJoinContinuity(plan, masterWave);
  const renderedLateTimelineCoverage = lateTimelineCoverage(plan, masterWave);
  const objectiveChecks = {
    silenceOrMissingAudio: !Number.isFinite(master.rmsDbfs) || master.rmsDbfs < -80,
    clippingDetected: master.peakDbfs >= -0.01,
    masterPeakDbfs: master.peakDbfs,
    masterRmsDbfs: master.rmsDbfs,
    voiceScoreComparison,
    narrationWindowDensity,
    cylinderStereoMotion,
    chapterRenderProfiles: renderedChapterProfiles,
    chapterJoinContinuity: renderedJoinContinuity,
    lateTimelineCoverage: renderedLateTimelineCoverage,
    spectrumFingerprint: fingerprint,
    stemsWithSignal: stems.filter(({ rmsDbfs }) => Number.isFinite(rmsDbfs) && rmsDbfs > -80).length,
    durationConsistent: [master, ...stems].every(({ durationSeconds }) => Math.abs(durationSeconds - plan.timeline.durationSeconds) < 1 / plan.render.sampleRate)
  };
  const review = {
    schemaVersion: 1,
    masterSha256: master.sha256,
    reviewAsset: {
      path: "audio/score/review/score-review.opus",
      codec: "Opus 48 kbps VBR",
      bytes: fs.statSync(reviewAssetPath).size,
      sha256: sha256(reviewAssetPath),
      versionControl: "ignored local audition file"
    },
    subjectiveListening: {
      status: "not-completed",
      reason: "This agent cannot perform a trustworthy human auditory evaluation of orchestral balance, musical affect, or Chinese-narration intelligibility and will not fabricate one.",
      requiredBeforeFinalMix: true,
      checklist: [
        "Listen on studio monitors and ordinary phone speakers.",
        "Confirm each topology reads as its own musical world rather than one theme in variation.",
        "Confirm overlaps, pickups, pivots and timbral relays make every chapter join continuous.",
        "Confirm speech remains intelligible without aggressive ducking.",
        "Confirm MS Basic timbre is acceptable or replace it only with a separately licensed, recorded render profile."
      ]
    },
    objectiveChecks,
    evidence: {
      type: "waveform-spectrum-form-contact-sheet",
      path: "audio/score/review-evidence.svg",
      method: "Direct PCM parsing, waveform envelope, form alignment and nine-band windowed spectral fingerprint"
    }
  };
  writeJson(path.join(scoreRoot, "review.json"), review);
  fs.writeFileSync(evidencePath, evidenceSvg(plan, masterWave, master, fingerprint, objectiveChecks), "utf8");
  console.log(`✓ Analyzed rendered score: peak ${master.peakDbfs} dBFS, RMS ${master.rmsDbfs} dBFS, minimum dry-voice/score RMS margin ${voiceScoreComparison.minimumVoiceToScoreRmsMarginDb} dB, Cylinder swing ${cylinderStereoMotion.leftToRightSwingDb} dB.`);
}

if (process.argv.includes("--analyze-render")) {
  analyzeRender();
} else {
  buildScore();
}
