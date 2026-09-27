// content.js から実際のレスデータが送られてくるまでのサンプルデータ。
// { kind: "text" | "media", good: そうだね数 }
const SAMPLE_REPLIES = [
  { kind: "text", good: 9 },
  { kind: "media", good: 7 },
  { kind: "media", good: 2 },
  { kind: "text", good: 17 },
  { kind: "text", good: 19 },
  { kind: "text", good: 7 },
  { kind: "text", good: 17 },
  { kind: "media", good: 11 },
  { kind: "media", good: 12 },
  { kind: "text", good: 17 },
  { kind: "media", good: 3 },
  { kind: "media", good: 10 },
  { kind: "media", good: 8 },
  { kind: "media", good: 18 },
  { kind: "media", good: 11 },
  { kind: "media", good: 7 },
  { kind: "media", good: 15 },
  { kind: "text", good: 7 },
  { kind: "text", good: 18 },
  { kind: "media", good: 15 },
  { kind: "text", good: 18 },
  { kind: "media", good: 3 },
  { kind: "media", good: 7 },
  { kind: "media", good: 12 },
  { kind: "text", good: 2 },
  { kind: "media", good: 1 },
  { kind: "media", good: 5 },
  { kind: "media", good: 17 },
  { kind: "media", good: 19 },
  { kind: "media", good: 9 },
  { kind: "media", good: 7 },
  { kind: "media", good: 5 },
];

const KIND_LABEL = { text: "テキスト", media: "画像" };

function renderReplies(replies) {
  const root = document.getElementById("panel-root");
  root.innerHTML = "";

  if (replies.length === 0) return;

  const goods = replies.map((r) => r.good);
  const min = Math.min(...goods);
  const max = Math.max(...goods);

  const list = document.createElement("div");
  list.className = "reply-heatmap";

  for (const reply of replies) {
    const t = FutabaHeatmap.normalize(reply.good, min, max);
    const { hex, lum } = FutabaHeatmap.heatColor(reply.kind, t);
    const textColor = FutabaHeatmap.textColorFor(lum);

    const row = document.createElement("div");
    row.className = "reply-row";
    row.style.backgroundColor = hex;
    row.style.color = textColor;

    const label = document.createElement("span");
    label.className = "reply-label";
    label.textContent = KIND_LABEL[reply.kind];

    const good = document.createElement("span");
    good.className = "reply-good";
    good.textContent = reply.good;

    row.appendChild(label);
    row.appendChild(good);
    list.appendChild(row);
  }

  root.appendChild(list);
}

// content.js からの実データ受信用(未接続。実装待ち)
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "futaba-helper:replies") {
    renderReplies(event.data.replies);
  }
});

renderReplies(SAMPLE_REPLIES);
