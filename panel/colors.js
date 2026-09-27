// レスの色分けロジック。
// - 色相(hue): レス種別(テキストのみ / 画像・メディアあり)を表す
// - 明度(lightness)/彩度(chroma): そうだね数を表す(多いほど濃い色になる)
//
// テキスト = blue、画像 = orange の単色ランプをそれぞれ使用する。
// 各ランプの (t, L, C) はデザインシステムの公式ランプ(blue: #cde2fb〜#0d366b)から
// 実測して求めたもので、orangeはblueと同じ L/C カーブを orange の色相に載せて生成している。
window.FutabaHeatmap = (function () {
  const RAMP_POINTS = [
    [0, 0.905, 0.0411],
    [0.0833, 0.8578, 0.0575],
    [0.1667, 0.812, 0.0788],
    [0.25, 0.764, 0.097],
    [0.3333, 0.717, 0.1183],
    [0.4167, 0.6708, 0.1364],
    [0.5, 0.6221, 0.1612],
    [0.5833, 0.5753, 0.1626],
    [0.6667, 0.5275, 0.1497],
    [0.75, 0.4796, 0.1416],
    [0.8333, 0.4327, 0.1282],
    [0.9167, 0.385, 0.1183],
    [1, 0.3381, 0.1027],
  ];

  const HUE = {
    text: 254.9, // blue
    media: 40.64, // orange
  };

  function lin2s(c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }

  function linFromOklab([L, a, b]) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  function relLum([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function toHexByte(v) {
    return Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  }

  function oklchToHex(L, C, hueDeg) {
    const hRad = (hueDeg * Math.PI) / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);
    const lin = linFromOklab([L, a, b]);
    const srgb = lin.map(lin2s);
    return {
      hex: `#${toHexByte(srgb[0])}${toHexByte(srgb[1])}${toHexByte(srgb[2])}`,
      lum: relLum(lin.map((v) => Math.max(0, Math.min(1, v)))),
    };
  }

  function lerpLC(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < RAMP_POINTS.length - 1; i++) {
      const [t0, L0, C0] = RAMP_POINTS[i];
      const [t1, L1, C1] = RAMP_POINTS[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        return [L0 + (L1 - L0) * f, C0 + (C1 - C0) * f];
      }
    }
    const last = RAMP_POINTS[RAMP_POINTS.length - 1];
    return [last[1], last[2]];
  }

  // kind: "text" | "media"
  // t: 0 (そうだね最小) 〜 1 (そうだね最大) に正規化した値
  function heatColor(kind, t) {
    const [L, C] = lerpLC(t);
    return oklchToHex(L, C, HUE[kind]);
  }

  function normalize(value, min, max) {
    if (max <= min) return 0.5;
    return (value - min) / (max - min);
  }

  // 外れ値(一部だけ突出して多いそうだね数)に引っ張られて残りが潰れないよう、
  // 上下 lowPct/highPct 分位点を min/max として使う(値自体はクリップしない。
  // heatColor 側で t を 0〜1 にクランプするので範囲外は自然に両端の色になる)。
  function percentileBounds(values, lowPct = 0.05, highPct = 0.95) {
    if (values.length === 0) return { min: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    return { min: at(lowPct), max: at(highPct) };
  }

  // 背景色に対して読みやすい文字色(黒 or 白)を選ぶ
  function textColorFor(bgLum) {
    const white = (1.0 + 0.05) / (bgLum + 0.05);
    const black = (bgLum + 0.05) / (0.0 + 0.05);
    return white >= black ? "#ffffff" : "#0b0b0b";
  }

  return { heatColor, normalize, percentileBounds, textColorFor };
})();
