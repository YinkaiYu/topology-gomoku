const freezeCue = (id, semanticGroup, estimatedDuration, spokenText, visibleText, terminalPunctuation) => Object.freeze({
  id,
  speakerRole: "narrator",
  semanticGroup,
  estimatedDuration,
  spokenText,
  subtitle: Object.freeze({ visibleText, terminalPunctuation })
});

// spokenText is the approved voiceover source. Chapter-card labels are never added as
// title announcements, but approved prose may naturally use the same word (for example 方庭).
// Subtitle presentation stays a later task.
export const narrationCues = Object.freeze([
  freezeCue("intro-boundary", "intro", 4, "人们总把棋盘的边缘视作尽头。", "人们总把棋盘的边缘视作尽头", "。"),
  freezeCue("intro-roads", "intro", 8, "可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻。", "可那些消失在边界上的道路并未中断。它们在另一处接缝后延续，将遥远的落点重新变为近邻", "。"),
  freezeCue("intro-invitation", "intro", 7, "现在，落子之人啊，循着隐藏的连接前行吧。七种世界，将在你面前依次展开。", "现在，落子之人啊，循着隐藏的连接前行吧。七种世界，将在你面前依次展开", "。"),
  freezeCue("plane-order", "plane", 5, "边界分明，方向笔直，胜负都在眼前。方庭以有限的秩序收容第一条五连，也由此埋下对所有边界的疑问。", "边界分明，方向笔直，胜负都在眼前。方庭以有限的秩序收容第一条五连，也由此埋下对所有边界的疑问", "。"),
  freezeCue("cylinder-cycle", "cylinder", 7, "左右相接，上下仍被截断。横向的路绕过世界回到身后，纵向的路却有始有终。", "左右相接，上下仍被截断。横向的路绕过世界回到身后，纵向的路却有始有终", "。"),
  freezeCue("cylinder-distance", "cylinder", 4, "只拥有一重循环的世界，该如何丈量远近？", "只拥有一重循环的世界，该如何丈量远近", "？"),
  freezeCue("torus-cycles", "torus", 8, "四边相接，两个方向各自成环。一条斜线可以先越过上边，再从左侧归来。", "四边相接，两个方向各自成环。一条斜线可以先越过上边，再从左侧归来", "。"),
  freezeCue("torus-shortest-path", "torus", 4, "两重循环交织之处，最短的道路往往藏在视野之外。", "两重循环交织之处，最短的道路往往藏在视野之外", "。"),
  freezeCue("mobius-turn", "mobius", 7, "左右边界相接，却带着一次翻转。沿同一面环行一周，归来时上下已经交换。", "左右边界相接，却带着一次翻转。沿同一面环行一周，归来时上下已经交换", "。"),
  freezeCue("mobius-one-side", "mobius", 4, "只有一面的世界，正反又该如何分辨？", "只有一面的世界，正反又该如何分辨", "？"),
  freezeCue("klein-two-returns", "klein", 9, "一组边界如圆环般相接，另一组边界让方向翻转。两种归来共处一界：一条路保持原样，一条路带回倒影。", "一组边界如圆环般相接，另一组边界让方向翻转。两种归来共处一界：一条路保持原样，一条路带回倒影", "。"),
  freezeCue("klein-memory", "klein", 3, "路径会记住你选择的环绕。", "路径会记住你选择的环绕", "。"),
  freezeCue("projective-reflection", "projective", 6, "上下左右，全都通向各自的倒影。一次越界改变方向，两次倒映使棋路重新吻合。", "上下左右，全都通向各自的倒影。一次越界改变方向，两次倒映使棋路重新吻合", "。"),
  freezeCue("projective-twin", "projective", 6, "在双生的世界里，每次远行，都会遇见另一个自己。", "在双生的世界里，每次远行，都会遇见另一个自己", "。"),
  freezeCue("sphere-closure", "sphere", 9, "在最后的世界，棋路离开一条边，便会沿相邻的方向继续。四条边依次归向彼此，方形的棋盘也随之闭合成球。", "在最后的世界，棋路离开一条边，便会沿相邻的方向继续。四条边依次归向彼此，方形的棋盘也随之闭合成球", "。"),
  freezeCue("sphere-map", "sphere", 5, "人们为了看清完整的世界，将它展开成一张有边的图。", "人们为了看清完整的世界，将它展开成一张有边的图", "。"),
  freezeCue("sphere-boundary", "sphere", 6, "所谓边界，或许只是观察世界时留下的痕迹。", "所谓边界，或许只是观察世界时留下的痕迹", "。"),
  freezeCue("outro-invocation", "outro", 3, "现在，落子之人。", "现在，落子之人", "。"),
  freezeCue("outro-connection", "outro", 4, "七种世界已经显现，但最后的连接，仍等待你亲手完成。", "七种世界已经显现，但最后的连接，仍等待你亲手完成", "。"),
  freezeCue("outro-stone", "outro", 3, "若你已经理解边界的意义，就落下那颗棋子。", "若你已经理解边界的意义，就落下那颗棋子", "。"),
  freezeCue("outro-world", "outro", 4, "然后，去看见世界本来的样子吧。", "然后，去看见世界本来的样子吧", "。")
]);

export const narrationCueById = Object.freeze(Object.fromEntries(narrationCues.map((cue) => [cue.id, cue])));
