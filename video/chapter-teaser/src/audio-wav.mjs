import fs from "node:fs";
import path from "node:path";

const RIFF_HEADER_BYTES = 44;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readWav(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert(buffer.length >= RIFF_HEADER_BYTES, `WAV is too small: ${filePath}`);
  assert(buffer.toString("ascii", 0, 4) === "RIFF", `Not a RIFF WAV: ${filePath}`);
  assert(buffer.toString("ascii", 8, 12) === "WAVE", `Not a WAVE file: ${filePath}`);

  let format;
  let dataOffset = -1;
  let dataBytes = 0;
  let cursor = 12;
  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", cursor, cursor + 4);
    const chunkBytes = buffer.readUInt32LE(cursor + 4);
    const payload = cursor + 8;
    assert(payload + chunkBytes <= buffer.length, `Truncated ${chunkId} chunk in ${filePath}`);
    if (chunkId === "fmt ") {
      assert(chunkBytes >= 16, `Invalid fmt chunk in ${filePath}`);
      format = {
        audioFormat: buffer.readUInt16LE(payload),
        channels: buffer.readUInt16LE(payload + 2),
        sampleRate: buffer.readUInt32LE(payload + 4),
        byteRate: buffer.readUInt32LE(payload + 8),
        blockAlign: buffer.readUInt16LE(payload + 12),
        bitsPerSample: buffer.readUInt16LE(payload + 14)
      };
    } else if (chunkId === "data") {
      dataOffset = payload;
      dataBytes = chunkBytes;
    }
    cursor = payload + chunkBytes + (chunkBytes & 1);
  }

  assert(format, `Missing fmt chunk in ${filePath}`);
  assert(dataOffset >= 0, `Missing data chunk in ${filePath}`);
  assert(format.channels >= 1 && format.channels <= 2, `Unsupported channel count in ${filePath}`);
  assert([1, 3].includes(format.audioFormat), `Unsupported WAV encoding ${format.audioFormat} in ${filePath}`);
  const bytesPerSample = format.bitsPerSample / 8;
  assert(Number.isInteger(bytesPerSample), `Unsupported bit depth in ${filePath}`);
  assert(format.blockAlign === format.channels * bytesPerSample, `Unexpected block alignment in ${filePath}`);
  const frameCount = Math.floor(dataBytes / format.blockAlign);
  const samples = new Float32Array(frameCount * format.channels);

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const offset = dataOffset + frame * format.blockAlign + channel * bytesPerSample;
      let sample;
      if (format.audioFormat === 3 && format.bitsPerSample === 32) {
        sample = buffer.readFloatLE(offset);
      } else if (format.audioFormat === 1 && format.bitsPerSample === 16) {
        sample = buffer.readInt16LE(offset) / 32768;
      } else if (format.audioFormat === 1 && format.bitsPerSample === 24) {
        sample = buffer.readIntLE(offset, 3) / 8388608;
      } else if (format.audioFormat === 1 && format.bitsPerSample === 32) {
        sample = buffer.readInt32LE(offset) / 2147483648;
      } else if (format.audioFormat === 1 && format.bitsPerSample === 8) {
        sample = (buffer.readUInt8(offset) - 128) / 128;
      } else {
        throw new Error(`Unsupported ${format.audioFormat}/${format.bitsPerSample}-bit WAV: ${filePath}`);
      }
      samples[frame * format.channels + channel] = Number.isFinite(sample) ? sample : 0;
    }
  }

  return {
    filePath,
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    frameCount,
    samples
  };
}

export function findAudibleBounds(wav, {
  thresholdDb = -46,
  preRollMs = 28,
  postRollMs = 90
} = {}) {
  const threshold = 10 ** (thresholdDb / 20);
  let first = 0;
  let last = wav.frameCount - 1;
  const amplitudeAt = (frame) => {
    let peak = 0;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      peak = Math.max(peak, Math.abs(wav.samples[frame * wav.channels + channel]));
    }
    return peak;
  };
  while (first < wav.frameCount && amplitudeAt(first) < threshold) first += 1;
  while (last >= first && amplitudeAt(last) < threshold) last -= 1;
  if (first >= wav.frameCount) {
    throw new Error(`Synthesized cue contains no audible signal: ${wav.filePath}`);
  }
  const preRoll = Math.round(wav.sampleRate * preRollMs / 1000);
  const postRoll = Math.round(wav.sampleRate * postRollMs / 1000);
  return {
    startFrame: Math.max(0, first - preRoll),
    endFrame: Math.min(wav.frameCount, last + 1 + postRoll)
  };
}

export function trimmedDuration(wav, options) {
  const bounds = findAudibleBounds(wav, options);
  return {
    ...bounds,
    sourceFrames: bounds.endFrame - bounds.startFrame,
    durationSeconds: (bounds.endFrame - bounds.startFrame) / wav.sampleRate
  };
}

export function mixResampledCue({
  destination,
  destinationSampleRate,
  destinationStartFrame,
  destinationFrameCount,
  wav,
  sourceStartFrame,
  sourceEndFrame,
  gain = 1,
  pan = 0,
  fadeMs = 8
}) {
  const sourceFrames = sourceEndFrame - sourceStartFrame;
  assert(sourceFrames > 0, `Cannot mix an empty cue from ${wav.filePath}`);
  const destinationTotalFrames = Math.floor(destination.length / 2);
  const framesToWrite = Math.min(destinationFrameCount, destinationTotalFrames - destinationStartFrame);
  const leftGain = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const rightGain = Math.sin((pan + 1) * Math.PI / 4) * gain;
  const fadeFrames = Math.max(1, Math.round(destinationSampleRate * fadeMs / 1000));

  for (let frame = 0; frame < framesToWrite; frame += 1) {
    const sourcePosition = frame * wav.sampleRate / destinationSampleRate;
    if (sourcePosition >= sourceFrames) break;
    const sourceFloor = Math.floor(sourcePosition);
    const fraction = sourcePosition - sourceFloor;
    const firstFrame = Math.min(sourceEndFrame - 1, sourceStartFrame + sourceFloor);
    const secondFrame = Math.min(sourceEndFrame - 1, firstFrame + 1);
    const sampleAt = (sourceFrame, channel) => {
      const actualChannel = Math.min(channel, wav.channels - 1);
      return wav.samples[sourceFrame * wav.channels + actualChannel];
    };
    let left = sampleAt(firstFrame, 0) * (1 - fraction) + sampleAt(secondFrame, 0) * fraction;
    let right = sampleAt(firstFrame, wav.channels > 1 ? 1 : 0) * (1 - fraction)
      + sampleAt(secondFrame, wav.channels > 1 ? 1 : 0) * fraction;
    const fadeIn = Math.min(1, frame / fadeFrames);
    const fadeOut = Math.min(1, (framesToWrite - 1 - frame) / fadeFrames);
    const envelope = Math.min(fadeIn, fadeOut);
    const destinationOffset = (destinationStartFrame + frame) * 2;
    destination[destinationOffset] += left * leftGain * envelope;
    destination[destinationOffset + 1] += right * rightGain * envelope;
  }
}

export function writePcm16Stereo(filePath, samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length % 2 !== 0) {
    throw new Error("writePcm16Stereo expects an interleaved stereo Float32Array");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const dataBytes = samples.length * 2;
  const header = createPcm16StereoHeader(samples.length / 2, sampleRate);
  const file = fs.openSync(filePath, "w");
  try {
    fs.writeSync(file, header);
    const chunkSamples = 131072;
    for (let offset = 0; offset < samples.length; offset += chunkSamples) {
      const count = Math.min(chunkSamples, samples.length - offset);
      const encoded = Buffer.allocUnsafe(count * 2);
      for (let index = 0; index < count; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[offset + index]));
        const integer = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
        encoded.writeInt16LE(integer, index * 2);
      }
      fs.writeSync(file, encoded);
    }
  } finally {
    fs.closeSync(file);
  }
}

export function createPcm16StereoHeader(totalFrames, sampleRate) {
  const dataBytes = totalFrames * 4;
  const header = Buffer.alloc(RIFF_HEADER_BYTES);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

export function readPcm16StereoBlock(fileDescriptor, startFrame, frameCount, totalFrames) {
  const readableFrames = Math.max(0, Math.min(frameCount, totalFrames - startFrame));
  const buffer = Buffer.alloc(frameCount * 4);
  if (readableFrames > 0) {
    fs.readSync(fileDescriptor, buffer, 0, readableFrames * 4, RIFF_HEADER_BYTES + startFrame * 4);
  }
  return buffer;
}

export function pcm16Sample(buffer, sampleIndex) {
  return buffer.readInt16LE(sampleIndex * 2) / 32768;
}

export function wavHeaderBytes() {
  return RIFF_HEADER_BYTES;
}
