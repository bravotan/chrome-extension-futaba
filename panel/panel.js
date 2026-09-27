// content.js から実際のレスデータが送られてくるまでのサンプルデータ。
const SAMPLE_REPLIES = [
  { id: "s1", resNo: 1, kind: "text", good: 9, comment: "テキストのみのレスの例です。" },
  { id: "s2", resNo: 2, kind: "media", good: 7, comment: "画像つきレスの例です。" },
  { id: "s3", resNo: 3, kind: "media", good: 2, comment: "画像つきレスの例です。" },
  { id: "s4", resNo: 4, kind: "text", good: 17, comment: "そうだねが多いテキストレス。" },
  { id: "s5", resNo: 5, kind: "text", good: 19, comment: "さらにそうだねが多いレス。" },
];

const KIND_LABEL = { text: "テキスト", media: "画像" };
const MINIMAP_THRESHOLD = 60;

let currentReplies = SAMPLE_REPLIES;
let lastViewport = null; // { firstIndex, lastIndex, total }

const tooltip = document.createElement("div");
tooltip.id = "reply-tooltip";
tooltip.hidden = true;
document.body.appendChild(tooltip);

function showTooltip(reply, x, y) {
  tooltip.innerHTML = "";

  const meta = document.createElement("div");
  meta.className = "tooltip-meta";
  meta.textContent = `No.${reply.resNo} / ${KIND_LABEL[reply.kind]} / そうだね${reply.good}`;
  tooltip.appendChild(meta);

  if (reply.comment) {
    const body = document.createElement("div");
    body.className = "tooltip-body";
    body.textContent =
      reply.comment.length > 300 ? `${reply.comment.slice(0, 300)}…` : reply.comment;
    tooltip.appendChild(body);
  }

  tooltip.hidden = false;
  positionTooltip(x, y);
}

function positionTooltip(x, y) {
  const margin = 12;
  const rect = tooltip.getBoundingClientRect();
  let left = x + margin;
  let top = y + margin;
  if (left + rect.width > window.innerWidth) {
    left = Math.max(0, x - rect.width - margin);
  }
  if (top + rect.height > window.innerHeight) {
    top = Math.max(0, y - rect.height - margin);
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function jumpToReply(id) {
  window.parent.postMessage({ type: "futaba-helper:jump", id }, "*");
}

function renderReplies(replies) {
  currentReplies = replies;
  const root = document.getElementById("panel-root");
  root.innerHTML = "";
  hideTooltip();

  if (replies.length === 0) return;

  const goods = replies.map((r) => r.good);
  const { min, max } = FutabaHeatmap.percentileBounds(goods, 0.05, 0.95);
  const minimap = replies.length > MINIMAP_THRESHOLD;

  const list = document.createElement("div");
  list.className = minimap ? "reply-heatmap minimap" : "reply-heatmap";

  replies.forEach((reply, index) => {
    const t = FutabaHeatmap.normalize(reply.good, min, max);
    const { hex, lum } = FutabaHeatmap.heatColor(reply.kind, t);

    const row = document.createElement("div");
    row.className = "reply-row";
    row.style.backgroundColor = hex;
    row.dataset.index = String(index);

    if (!minimap) {
      row.style.color = FutabaHeatmap.textColorFor(lum);

      const resNo = document.createElement("span");
      resNo.className = "reply-resno";
      resNo.textContent = reply.resNo;

      const label = document.createElement("span");
      label.className = "reply-label";
      label.textContent = KIND_LABEL[reply.kind];

      const good = document.createElement("span");
      good.className = "reply-good";
      good.textContent = reply.good;

      row.appendChild(resNo);
      row.appendChild(label);
      row.appendChild(good);
    }

    list.appendChild(row);
  });

  if (minimap) {
    const viewportIndicator = document.createElement("div");
    viewportIndicator.id = "viewport-indicator";
    viewportIndicator.hidden = true;
    list.appendChild(viewportIndicator);
  }

  root.appendChild(list);
  updateViewportIndicator();
}

function updateViewportIndicator() {
  const indicator = document.getElementById("viewport-indicator");
  if (!indicator || !lastViewport || currentReplies.length === 0) return;
  const { firstIndex, lastIndex, total } = lastViewport;
  const center = (firstIndex + lastIndex + 1) / 2 / total;
  indicator.style.top = `${center * 100}%`;
  indicator.hidden = false;
}

function replyAt(index) {
  return currentReplies[Number(index)];
}

document.getElementById("panel-root").addEventListener("mousemove", (event) => {
  const row = event.target.closest(".reply-row");
  if (!row) {
    hideTooltip();
    return;
  }
  const reply = replyAt(row.dataset.index);
  if (!reply) return;
  showTooltip(reply, event.clientX, event.clientY);
});

document.getElementById("panel-root").addEventListener("mouseleave", hideTooltip);

document.getElementById("panel-root").addEventListener("click", (event) => {
  const row = event.target.closest(".reply-row");
  if (!row) return;
  const reply = replyAt(row.dataset.index);
  if (!reply) return;
  jumpToReply(reply.id);
});

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "futaba-helper:replies") {
    renderReplies(data.replies);
  } else if (data.type === "futaba-helper:viewport") {
    lastViewport = data;
    updateViewportIndicator();
  }
});

renderReplies(SAMPLE_REPLIES);
