(function attachTopologyGameContent(root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TopologyGameContent = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function topologyGameContentFactory() {
  "use strict";

  var TUTORIAL_AUTO_ADVANCE_DELAY = 820;
  var TUTORIAL_PROMPTS = [
    "传统的五子棋",
    "就是把五颗子",
    "连成一条线",
    "好无趣",
    "好无聊"
  ];

  var LEVELS = [
    {
      name: "方庭",
      typeName: "平面",
      topology: "plane",
      tutorial: true,
      width: 7,
      height: 7,
      edgeText: "有边界",
      xConnection: null,
      yConnection: null,
      ruleTitle: "先连成五颗",
      ruleText: "连续落子，横、竖、斜皆可",
      lessonPaths: [
        { start: [1, 3], direction: 0, prompts: TUTORIAL_PROMPTS }
      ]
    },
    {
      name: "回廊",
      typeName: "圆柱",
      topology: "cylinder",
      width: 7,
      height: 6,
      edgeText: "左右相接",
      xConnection: "same",
      yConnection: null,
      ruleTitle: "左右相接",
      ruleText: "越过一边，从另一边继续",
      lessonPaths: [
        {
          start: [5, 2],
          direction: 0,
          prompts: ["从右侧开始", "走到边界", "越过右边，从左边回来", "两侧其实相接", "补上第五颗"]
        },
        {
          start: [5, 0],
          direction: 1,
          prompts: ["再试一条斜线", "斜着走向右边", "越界后从左边接回", "方向没有改变", "斜线也能五连"]
        }
      ]
    },
    {
      name: "环游",
      typeName: "环面",
      topology: "torus",
      width: 7,
      height: 6,
      edgeText: "四边相接",
      xConnection: "same",
      yConnection: "same",
      ruleTitle: "四边相接",
      ruleText: "上下左右，都没有尽头",
      lessonPaths: [
        {
          start: [3, 4],
          direction: 2,
          prompts: ["先从下方开始", "走到下边界", "越过下边，从上边回来", "上下也没有尽头", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "先越过上边", "再越过左边", "两次跨界仍是同一条线", "补上第五颗"]
        }
      ]
    },
    {
      name: "扭带",
      typeName: "莫比乌斯环",
      topology: "mobius",
      width: 8,
      height: 6,
      edgeText: "左右翻转",
      xConnection: "twist",
      yConnection: null,
      ruleTitle: "左右翻转",
      ruleText: "越过边界，上下镜像",
      lessonPaths: [
        {
          start: [6, 1],
          direction: 0,
          prompts: ["从右侧开始", "走到边界", "越界后，上下镜像", "镜像后仍是同一条线", "补上第五颗"]
        },
        {
          start: [6, 0],
          direction: 1,
          prompts: ["再试一条斜线", "斜着走到右边", "越界后方向翻转", "折向的两段彼此相连", "补上第五颗"]
        }
      ]
    },
    {
      name: "瓶界",
      typeName: "克莱因瓶",
      topology: "klein",
      width: 7,
      height: 6,
      edgeText: "一扭一环",
      xConnection: "twist",
      yConnection: "same",
      ruleTitle: "一扭一环",
      ruleText: "一组翻转，一组相接",
      lessonPaths: [
        {
          start: [3, 4],
          direction: 2,
          prompts: ["先从下方开始", "走到下边界", "这一组边直接相接", "上下没有尽头", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "先越过相接的边", "再越过翻转的边", "一环一扭仍能连成线", "补上第五颗"]
        }
      ]
    },
    {
      name: "双生",
      typeName: "实射影平面",
      topology: "projective",
      width: 8,
      height: 8,
      edgeText: "双向翻转",
      xConnection: "twist",
      yConnection: "twist",
      ruleTitle: "双向翻转",
      ruleText: "每条边，都通向镜面",
      lessonPaths: [
        {
          start: [1, 6],
          direction: 2,
          prompts: ["从下方开始", "走到边界", "越界后，左右镜像", "下边通向倒影", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再走一条斜线", "越过上边后翻转", "接着越过左边再翻转", "两次倒映仍在同一条线上", "补上第五颗"]
        }
      ]
    },
    {
      name: "归圆",
      typeName: "球面",
      topology: "sphere",
      width: 7,
      height: 7,
      edgeText: "邻边相合",
      xConnection: "adjacent",
      yConnection: "adjacent",
      ruleTitle: "邻边相合",
      ruleText: "相邻两边，转向后相接",
      lessonPaths: [
        {
          start: [2, 1],
          direction: 6,
          prompts: ["从上方开始", "走向上边界", "上边转向左边", "转弯后，线仍连续", "补上第五颗"]
        },
        {
          start: [1, 0],
          direction: 5,
          prompts: ["再靠近顶点", "落在两边交会处", "路径沿邻边转向", "穿过顶点仍然连续", "补上第五颗"]
        }
      ]
    }
  ];

  var DIFFICULTIES = {
    easy: { label: "随性", wait: 390, rank: 1 },
    normal: { label: "机敏", wait: 520, rank: 2 },
    hard: { label: "深思", wait: 680, rank: 3 }
  };
  var DIFFICULTY_ORDER = ["easy", "normal", "hard"];

  return {
    TUTORIAL_AUTO_ADVANCE_DELAY: TUTORIAL_AUTO_ADVANCE_DELAY,
    TUTORIAL_PROMPTS: TUTORIAL_PROMPTS,
    LEVELS: LEVELS,
    DIFFICULTIES: DIFFICULTIES,
    DIFFICULTY_ORDER: DIFFICULTY_ORDER
  };
});
