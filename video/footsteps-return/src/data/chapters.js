const freeze = (value) => Object.freeze(value);

export const chapters = freeze([
  freeze({ id: "plane", title: freeze({ act: "ACT. PROLOGUE", chapter: "方庭", topology: "平面" }) }),
  freeze({ id: "cylinder", title: freeze({ act: "ACT. I", chapter: "回廊", topology: "圆柱面" }) }),
  freeze({ id: "torus", title: freeze({ act: "ACT. II", chapter: "环游", topology: "环面" }) }),
  freeze({ id: "mobius", title: freeze({ act: "ACT. III", chapter: "扭带", topology: "莫比乌斯环" }) }),
  freeze({ id: "klein", title: freeze({ act: "ACT. IV", chapter: "瓶界", topology: "克莱因瓶" }) }),
  freeze({ id: "projective", title: freeze({ act: "ACT. V", chapter: "双生", topology: "实射影平面" }) }),
  freeze({ id: "sphere", title: freeze({ act: "ACT. VI", chapter: "归圆", topology: "球面" }) })
]);
