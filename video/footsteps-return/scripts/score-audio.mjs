import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function parseWave(filePath) {
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

export function spatializeWave(wave, { staticPosition = 0, panAutomation = [] } = {}) {
  if (wave.channels.length < 1 || wave.channels.length > 2) {
    throw new Error(`Spatialization expects mono or stereo PCM, received ${wave.channels.length} channels`);
  }
  const position = clamp(staticPosition, -1, 1);
  const automation = [...panAutomation]
    .sort((left, right) => left.time - right.time)
    .map((point) => ({ time: point.time, position: clamp(point.value * 2 - 1, -1, 1) }));
  const output = [new Float32Array(wave.frameCount), new Float32Array(wave.frameCount)];
  const edgeRampSeconds = 0.25;
  const firstAutomationFrame = automation.length
    ? Math.max(0, Math.round((automation[0].time - edgeRampSeconds) * wave.sampleRate))
    : Infinity;
  const lastAutomationFrame = automation.length
    ? Math.round((automation.at(-1).time + edgeRampSeconds) * wave.sampleRate)
    : -Infinity;
  let automationIndex = 0;
  for (let frame = 0; frame < wave.frameCount; frame += 1) {
    let pan = position;
    if (frame >= firstAutomationFrame && frame <= lastAutomationFrame) {
      const time = frame / wave.sampleRate;
      if (time < automation[0].time) {
        const progress = clamp((time - (automation[0].time - edgeRampSeconds)) / edgeRampSeconds, 0, 1);
        pan = position + (automation[0].position - position) * progress;
      } else if (time > automation.at(-1).time) {
        const progress = clamp((time - automation.at(-1).time) / edgeRampSeconds, 0, 1);
        pan = automation.at(-1).position + (position - automation.at(-1).position) * progress;
      } else {
        while (automationIndex + 1 < automation.length && time > automation[automationIndex + 1].time) {
          automationIndex += 1;
        }
        const left = automation[automationIndex];
        const right = automation[Math.min(automationIndex + 1, automation.length - 1)];
        const progress = right.time > left.time ? clamp((time - left.time) / (right.time - left.time), 0, 1) : 0;
        pan = left.position + (right.position - left.position) * progress;
      }
    }
    const leftGain = Math.sqrt(1 - pan);
    const rightGain = Math.sqrt(1 + pan);
    const leftSource = wave.channels[0][frame];
    const rightSource = wave.channels[1]?.[frame] ?? leftSource;
    output[0][frame] = leftSource * leftGain;
    output[1][frame] = rightSource * rightGain;
  }
  return { sampleRate: wave.sampleRate, frameCount: wave.frameCount, channels: output };
}

export function writePcm24Wave(filePath, wave) {
  const channelCount = wave.channels.length;
  if (channelCount !== 2) throw new Error("PCM24 writer expects stereo audio");
  const bitsPerSample = 24;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = wave.frameCount * blockAlign;
  const buffer = Buffer.allocUnsafe(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(wave.sampleRate, 24);
  buffer.writeUInt32LE(wave.sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let frame = 0; frame < wave.frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      let integer = Math.round(clamp(wave.channels[channel][frame], -0.999999, 0.999999) * 8388608);
      if (integer < 0) integer += 0x1000000;
      buffer.writeUIntLE(integer, 44 + frame * blockAlign + channel * bytesPerSample, bytesPerSample);
    }
  }
  fs.writeFileSync(filePath, buffer);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runSpatializeCli() {
  const input = argument("--input");
  const output = argument("--output");
  const planPath = argument("--plan");
  const partId = argument("--part");
  if (!input || !output || !planPath || !partId) {
    throw new Error("Usage: score-audio.mjs spatialize --input in.wav --output out.wav --plan score-plan.json --part part-id");
  }
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const part = plan.parts.find(({ id }) => id === partId);
  if (!part) throw new Error(`Unknown score part ${partId}`);
  const panAutomation = plan.gestures
    .filter((gesture) => gesture.part === partId)
    .flatMap((gesture) => gesture.automation?.pan ?? []);
  const wave = parseWave(input);
  const spatialized = spatializeWave(wave, { staticPosition: part.stereoPosition, panAutomation });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  writePcm24Wave(output, spatialized);
  console.log(`Spatialized ${partId}: static ${part.stereoPosition}, ${panAutomation.length} pan points.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv[2] !== "spatialize") throw new Error(`Unknown score audio command ${process.argv[2] ?? "(missing)"}`);
  runSpatializeCli();
}
