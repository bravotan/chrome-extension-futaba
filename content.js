(function () {
  const threEl = document.querySelector(".thre");
  if (!threEl) {
    // カタログ表示などスレ本体が無いページでは何もしない
    return;
  }

  const CONTAINER_ID = "futaba-helper-panel-container";
  if (document.getElementById(CONTAINER_ID)) {
    return;
  }

  const container = document.createElement("div");
  container.id = CONTAINER_ID;

  const iframe = document.createElement("iframe");
  iframe.id = "futaba-helper-panel-iframe";
  iframe.src = chrome.runtime.getURL("panel/panel.html");
  const panelOrigin = new URL(iframe.src).origin;

  container.appendChild(iframe);
  document.body.appendChild(container);

  // id(投稿ID) -> ジャンプ先要素、および表示中判定用の位置情報
  let containerById = new Map();
  let positions = []; // [{ id, top, bottom }] 文書内での縦位置(document順)

  function buildContainerMap() {
    containerById = new Map();
    threEl.querySelectorAll("a.sod").forEach((sod) => {
      const idMatch = sod.id.match(/^sd(\d+)$/);
      if (!idMatch) return;
      const table = sod.closest("table");
      containerById.set(idMatch[1], table || threEl);
    });
  }

  function buildPositions() {
    positions = Array.from(containerById.entries()).map(([id, el]) => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      return { id, top, bottom: top + rect.height };
    });
  }

  function sendReplies() {
    buildContainerMap();
    const replies = FutabaExtract.extractReplies(threEl);
    if (replies.length === 0) return;
    buildPositions();
    iframe.contentWindow.postMessage(
      { type: "futaba-helper:replies", replies },
      panelOrigin
    );
    sendViewport();
  }

  function sendViewport() {
    if (positions.length === 0) return;
    const viewTop = window.scrollY;
    const viewBottom = viewTop + window.innerHeight;
    let firstIndex = -1;
    let lastIndex = -1;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (p.bottom >= viewTop && p.top <= viewBottom) {
        if (firstIndex === -1) firstIndex = i;
        lastIndex = i;
      }
    }
    if (firstIndex === -1) return;
    iframe.contentWindow.postMessage(
      {
        type: "futaba-helper:viewport",
        firstIndex,
        lastIndex,
        total: positions.length,
      },
      panelOrigin
    );
  }

  function jumpTo(id) {
    const el = containerById.get(String(id));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("futaba-helper-flash");
    // reflow を挟んでアニメーションを再トリガーできるようにする
    void el.offsetWidth;
    el.classList.add("futaba-helper-flash");
    setTimeout(() => el.classList.remove("futaba-helper-flash"), 1200);
  }

  iframe.addEventListener("load", sendReplies);

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (data && data.type === "futaba-helper:jump") {
      jumpTo(data.id);
    }
  });

  let scrollPending = false;
  window.addEventListener("scroll", () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      scrollPending = false;
      sendViewport();
    });
  });

  let mutationPending = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationPending);
    mutationPending = setTimeout(sendReplies, 300);
  });
  observer.observe(threEl, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
