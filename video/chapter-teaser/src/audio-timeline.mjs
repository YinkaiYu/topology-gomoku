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
    captionText: cue.text.replace(FULL_STOPS, "")
  })));
}

export function buildTimeline(story, timing) {
  if (!timing || !Array.isArray(timing.visualSegments) || !Array.isArray(timing.cues)) {
    throw new Error("narration-timing.json must define visualSegments and cues");
  }
  const fps = story.render.fps;
  if (timing.fps !== fps || !Number.isInteger(timing.totalFrames)) {
    throw new Error("Narration timing must use the story frame rate and an integer totalFrames");
  }

  const expected = flattenStoryCues(story);
  if (expected.length !== timing.cues.length) {
    throw new Error(`Story/timing cue count mismatch: ${expected.length} != ${timing.cues.length}`);
  }
  const cues = timing.cues.map((timed, index) => {
    const source = expected[index];
    if (source.captionText !== timed.captionText) {
      throw new Error(`Story/timing text mismatch at ${timed.id}: ${source.captionText} != ${timed.captionText}`);
    }
    return {
      id: timed.id,
      storyCueId: source.id,
      sectionId: source.sectionId,
      index: source.index,
      text: source.text,
      captionText: timed.captionText,
      startSeconds: timed.startSeconds,
      endSeconds: timed.endSeconds,
      startFrame: timed.startFrame,
      endFrame: timed.endFrame,
      durationFrames: timed.endFrame - timed.startFrame
    };
  });

  const chapterById = new Map(story.chapters.map((chapter) => [chapter.id, chapter]));
  const segments = timing.visualSegments.map((source) => {
    const chapter = source.chapterId ? chapterById.get(source.chapterId) : null;
    const narrationCueIds = cues
      .filter((cue) => cue.startFrame >= source.startFrame && cue.endFrame <= source.endFrame)
      .map((cue) => cue.id);
    const segment = {
      ...source,
      narrationCueIds
    };
    if (chapter) {
      segment.act = chapter.act;
      segment.title = chapter.chapter;
      segment.manifold = chapter.manifold;
    }
    if (source.kind === "chapter-card") {
      segment.transformFrame = source.startFrame + Math.round(source.durationFrames * 0.52);
    }
    if (source.kind === "end-card") {
      segment.title = story.endCard.gameTitle;
      segment.institution = story.endCard.institution;
      segment.producer = story.endCard.producer;
    }
    return segment;
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
    totalFrames: timing.totalFrames,
    durationSeconds: round(timing.totalFrames / fps),
    segments,
    cues,
    subtitles
  };
}

export function frameToSrtTime(frame, fps) {
  // One subtitle time unit is shorter than a 60 fps frame. Flooring both
  // boundaries preserves the intended [startFrame, endFrame) frame set while
  // preventing a rounded end from leaking into a silent logo or title card.
  const milliseconds = Math.floor(frame * 1000 / fps + Number.EPSILON);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds % 3600000 / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export function frameToAssTime(frame, fps) {
  const centiseconds = Math.floor(frame * 100 / fps + Number.EPSILON);
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
    "Style: Caption,Topo Sans PV,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0.8,0,1,3.2,0,2,120,120,86,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    ""
  ].join("\n");
}
