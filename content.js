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
      // table 全体ではなく td.rtd を使う: 一部の崩れたHTML(閉じタグ漏れ等)で
      // ブラウザが複数の <table> を1つにマージしてしまうと、そのレス以降ずっと
      // bounding box が異常に広がり、現在地判定がおかしくなることがあるため、
      // extract.js と同じ、より狭い td.rtd を基準にする。
      const rtd = sod.closest("td.rtd");
      containerById.set(idMatch[1], rtd || threEl);
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
    let width = 0;
    for (const child of el.children) {
      if (child.tagName === "TABLE") break;
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      width = Math.max(width, rect.width);
      if (top === null || rect.top < top) top = rect.top;
      if (bottom === null || rect.bottom > bottom) bottom = rect.bottom;
    }
    if (top === null) {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, height: 0, width: 0 };
    }
    return { top, height: bottom - top, width };
  }

  // 削除されたレスなど display:none 等で描画されていない要素は
  // getBoundingClientRect() が幅・高さとも0を返す。この場合 window.scrollY を
  // 足した絶対座標は「計算した瞬間のスクロール位置そのもの」になってしまい、
  // 常に「今表示中」判定にヒットし続けて現在地マーカーがそこに張り付くバグになる。
  // 幅・高さが両方0の要素は「位置不明」として現在地判定の対象から外す。
  function buildPositions() {
    positions = Array.from(containerById.entries()).map(([id, el]) => {
      const { top: relTop, height, width } =
        el === threEl ? opContentRect(threEl) : el.getBoundingClientRect();
      if (width === 0 && height === 0) {
        return { id, hidden: true };
      }
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
      if (p.hidden) continue;
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

  // ふたば本体(2chan.net)を見ているときだけ、ftbucketアーカイブへのリンクを出す。
  // URL変換規則は実例からの推測(例: https://may.2chan.net/b/res/123.htm ->
  // https://may2.ftbucket.info/may/cont/may.2chan.net_b_res_123/index.htm)で、
  // 全板で通用する保証はないため外れたら404になるだけのベストエフォート。
  function computeArchiveUrl() {
    const host = location.hostname;
    if (!host.endsWith(".2chan.net")) return null;
    const sub = host.split(".")[0];
    const path = location.pathname
      .replace(/^\//, "")
      .replace(/\.[a-zA-Z0-9]+$/, "")
      .replace(/\//g, "_");
    const folder = `${host}_${path}`;
    return `https://${sub}2.ftbucket.info/${sub}/cont/${folder}/index.htm`;
  }

  // チェックしたスレの情報(タイトル・発生時間・推定消滅時間)をダッシュボード用に記録する。
  function extractThreadMeta() {
    const threadId = threEl.getAttribute("data-res");
    if (!threadId) return null;
    const rawTitle = document.title || "";
    const title = rawTitle.split(" - ")[0].trim() || rawTitle.trim() || threadId;
    const createdEl = threEl.querySelector(".cnw");
    const expiryEl = threEl.querySelector(".cntd");
    return {
      id: threadId,
      title,
      url: location.href,
      createdText: createdEl ? createdEl.textContent.trim() : "",
      expiryText: expiryEl ? expiryEl.textContent.trim() : "",
    };
  }

  // スレ内で最初に見つかった画像(OPにあればOP、無ければ最初のレスの画像)を縮小して
  // data URL化し、拡張側に保持する。元画像をそのまま参照すると元スレが消えた時に
  // 一緒に見えなくなるため、ダッシュボードで使う分は複製して持っておく。
  // 元画像のURL自体は imgUrl として別に残しておき、後で生存確認(そのURLがまだ
  // 読み込めるか)のビーコン代わりに使えるようにする。
  const THUMB_MAX_SIZE = 120;
  function captureThumbnail() {
    const img = threEl.querySelector("img");
    if (!img) return Promise.resolve({ thumbDataUrl: null, imgUrl: null });
    const imgUrl = img.src;

    const draw = () =>
      new Promise((resolve) => {
        try {
          const scale = Math.min(
            1,
            THUMB_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight)
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          // クロスオリジン等でcanvasが汚染されて読み出せない場合は諦める
          resolve(null);
        }
      });

    if (img.complete && img.naturalWidth > 0) {
      return draw().then((thumbDataUrl) => ({ thumbDataUrl, imgUrl }));
    }
    return new Promise((resolve) => {
      const onDone = (thumbDataUrl) => resolve({ thumbDataUrl, imgUrl });
      img.addEventListener("load", () => draw().then(onDone), { once: true });
      img.addEventListener("error", () => onDone(null), { once: true });
      setTimeout(() => onDone(null), 3000);
    });
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

  iframe.addEventListener("load", () => {
    sendReplies();
    const archiveUrl = computeArchiveUrl();
    const meta = extractThreadMeta();
    if (meta) {
      captureThumbnail().then(({ thumbDataUrl, imgUrl }) => {
        const entry = { ...meta, archiveUrl };
        if (thumbDataUrl) entry.thumbDataUrl = thumbDataUrl;
        if (imgUrl) entry.imgUrl = imgUrl;
        FutabaTracker.upsert(entry);
      });
    }
  });

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
