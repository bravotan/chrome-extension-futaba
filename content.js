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

  // OP の要素は sod.closest("table") が無いため threEl(スレ全体) が入っている。
  // threEl.getBoundingClientRect() をそのまま使うとOPの範囲がスレ全体(先頭〜末尾)に
  // なってしまい、常に「表示中」判定に引っかかって現在地マーカーが常に先頭寄りに
  // 引っ張られる(=常に真ん中付近に張り付く)バグになるため、OPは自分の直接の子要素
  // (最初の<table>より前)だけから範囲を計算する。
  function opContentRect(el) {
    let top = null;
    let bottom = null;
    for (const child of el.children) {
      if (child.tagName === "TABLE") break;
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (top === null || rect.top < top) top = rect.top;
      if (bottom === null || rect.bottom > bottom) bottom = rect.bottom;
    }
    if (top === null) {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, height: 0 };
    }
    return { top, height: bottom - top };
  }

  function buildPositions() {
    positions = Array.from(containerById.entries()).map(([id, el]) => {
      const { top: relTop, height } =
        el === threEl ? opContentRect(threEl) : el.getBoundingClientRect();
      const top = relTop + window.scrollY;
      return { id, top, bottom: top + height };
    });
  }

  const MINIMAP_THRESHOLD = 60; // panel/panel.js の同名定数と合わせる

  function sendReplies() {
    buildContainerMap();
    const replies = FutabaExtract.extractReplies(threEl);
    if (replies.length === 0) return;
    buildPositions();
    // ミニマップ判定は panel.js からの返信を待たず、ここで直接幅を決める
    // (メッセージの往復に依存すると失敗ポイントが増えるため)。
    container.style.width = replies.length > MINIMAP_THRESHOLD ? "72px" : "300px";
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
    if (!data) return;
    if (data.type === "futaba-helper:jump") {
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

  // そうだね数の更新や新着レスが途切れず続く活発なスレだと、単純な debounce では
  // タイマーが延々リセットされ続けて位置情報(ミニマップの現在地)が更新されないまま
  // 古くなってしまう。最大待ち時間を設けたthrottleにして、更新が途切れなくても
  // 一定間隔ごとには必ず反映されるようにする。
  const SEND_REPLIES_MAX_WAIT = 500;
  let mutationTimer = null;
  let lastSent = 0;
  function scheduleSendReplies() {
    const now = Date.now();
    const elapsed = now - lastSent;
    if (elapsed >= SEND_REPLIES_MAX_WAIT) {
      lastSent = now;
      sendReplies();
      return;
    }
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      lastSent = Date.now();
      sendReplies();
    }, SEND_REPLIES_MAX_WAIT - elapsed);
  }

  const observer = new MutationObserver(scheduleSendReplies);
  observer.observe(threEl, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
