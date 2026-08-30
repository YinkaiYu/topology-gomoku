const FULL_STOPS = /[。.]/g;

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

export function flattenStoryCues(story) {
  const sections = [
    { id: story.intro.id, cues: story.intro.cues },
    ...story.chapters.map((chapter) => ({ id: chapter.id, cues: chapter.cues })),
    { id: story.finale.id, cues: story.finale.cues }
  ];
  return sections.flatMap((section) => section.cues.map((cue, index) => ({
    id: `${section.id}-${String(index + 1).padStart(2, "0")}`,
    sectionId: section.id,
    index,
    text: cue.text,
    captionText: cue.text.replace(FULL_STOPS, ""),
    pauseAfterFrames: cue.pauseAfterFrames
  })));
}

export function buildTimeline(story, measuredCues) {
  const fps = story.render.fps;
  const expected = flattenStoryCues(story);
  const measuredById = new Map(measuredCues.map((cue) => [cue.id, cue]));
  const cues = [];
  const segments = [];
  let cursor = 0;

  const scheduleNarratedSegment = ({ id, kind, source, title, chapterId, manifold }) => {
    const startFrame = cursor;
    cursor += source.preRollFrames;
    const narrationCueIds = [];
    for (let index = 0; index < source.cues.length; index += 1) {
      const cueId = `${id}-${String(index + 1).padStart(2, "0")}`;
      const sourceCue = expected.find((cue) => cue.id === cueId);
      const measured = measuredById.get(cueId);
      if (!measured || !(measured.durationSeconds > 0)) {
        throw new Error(`Missing measured voice duration for ${cueId}`);
      }
      const durationFrames = Math.max(1, Math.ceil(measured.durationSeconds * fps));
      const start = cursor;
      const end = start + durationFrames;
      cues.push({
        ...sourceCue,
        startFrame: start,
        endFrame: end,
        durationFrames,
        sourceDurationSeconds: round(measured.durationSeconds),
        sourceSampleRate: measured.sourceSampleRate,
        sourceStartSample: measured.sourceStartSample,
        sourceEndSample: measured.sourceEndSample,
        voiceFile: measured.voiceFile
      });
      narrationCueIds.push(cueId);
      cursor = end + sourceCue.pauseAfterFrames;
    }
    cursor += source.postRollFrames;
    segments.push({
      id,
      kind,
      ...(title ? { title } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(manifold ? { manifold } : {}),
      startFrame,
      endFrame: cursor,
      durationFrames: cursor - startFrame,
      narrationCueIds
    });
  };

  scheduleNarratedSegment({ id: story.intro.id, kind: "intro", source: story.intro, title: story.title });

  for (const chapter of story.chapters) {
    const cardStart = cursor;
    cursor += story.render.titleFrames;
    segments.push({
      id: `${chapter.id}-card`,
      kind: "chapter-card",
      chapterId: chapter.id,
      act: chapter.act,
      title: chapter.chapter,
      manifold: chapter.manifold,
      transformFrame: cardStart + story.render.titleTransformFrame,
      startFrame: cardStart,
      endFrame: cursor,
      durationFrames: story.render.titleFrames,
      narrationCueIds: []
    });
    scheduleNarratedSegment({
      id: chapter.id,
      kind: "chapter",
      source: chapter,
      title: chapter.chapter,
      chapterId: chapter.id,
      manifold: chapter.manifold
    });
  }

  const tableauStart = cursor;
  cursor += story.tableau.durationFrames;
  segments.push({
    id: story.tableau.id,
    kind: "tableau",
    startFrame: tableauStart,
    endFrame: cursor,
    durationFrames: story.tableau.durationFrames,
    narrationCueIds: []
  });

  scheduleNarratedSegment({ id: story.finale.id, kind: "finale", source: story.finale });

  const endCardStart = cursor;
  cursor += story.endCard.durationFrames;
  segments.push({
    id: story.endCard.id,
    kind: "end-card",
    title: story.endCard.gameTitle,
    institution: story.endCard.institution,
    startFrame: endCardStart,
    endFrame: cursor,
    durationFrames: story.endCard.durationFrames,
    narrationCueIds: []
  });

  const subtitles = cues.map((cue) => ({
    id: cue.id,
    cueId: cue.id,
    text: cue.captionText,
    startFrame: cue.startFrame,
    endFrame: cue.endFrame,
    durationFrames: cue.durationFrames
  }));
  return {
    fps,
    totalFrames: cursor,
    durationSeconds: round(cursor / fps),
    segments,
    cues,
    subtitles
  };
}

export function frameToSrtTime(frame, fps) {
  const milliseconds = Math.round(frame * 1000 / fps);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds % 3600000 / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export function frameToAssTime(frame, fps) {
  const centiseconds = Math.round(frame * 100 / fps);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds % 360000 / 6000);
  const seconds = Math.floor(centiseconds % 6000 / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
}

export function serializeSrt(subtitles, fps) {
  return `${subtitles.map((subtitle, index) => [
    index + 1,
    `${frameToSrtTime(subtitle.startFrame, fps)} --> ${frameToSrtTime(subtitle.endFrame, fps)}`,
    subtitle.text
  ].join("\n")).join("\n\n")}\n`;
}

export function serializeAss(subtitles, fps) {
  const events = subtitles.map((subtitle) =>
    `Dialogue: 0,${frameToAssTime(subtitle.startFrame, fps)},${frameToAssTime(subtitle.endFrame, fps)},Caption,,0,0,0,,${subtitle.text}`
  );
  return [
    "[Script Info]",
    "; Generated from integer 60 fps cue boundaries by scripts/build-audio.mjs",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Caption,Topo Serif SC,44,&H00F2EFE7,&H00F2EFE7,&HCC070908,&H00000000,0,0,0,0,100,100,1.2,0,1,2.2,0,2,144,144,90,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    ""
  ].join("\n");
}
