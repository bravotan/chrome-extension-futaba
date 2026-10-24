// ふたば本体(2chan.net)のURLから、アーカイブサイト側の対応URLを組み立てる。
// 例: https://may.2chan.net/b/res/123.htm ->
//   FTBucket:      https://www.ftbucket.info/scrapshot/ftb/cont/may.2chan.net_b_res_123/index.htm
//   Futaba Forest: https://futabaforest.net/b/res/123.htm
// FTBucket側のURLは板ごとのサブドメイン(may.ftbucket.info等)ではなく
// www.ftbucket.info 配下に統一された(2026-10時点でユーザーが確認)。
// 全板で通用する保証はないため外れたらリンク先が404になるだけのベストエフォート。
function computeArchiveLinks() {
  const host = location.hostname;
  if (!host.endsWith(".2chan.net")) return null;
  const pathParts = location.pathname.split("/").filter(Boolean);
  if (pathParts.length === 0) return null;
  const boardCode = pathParts[0];
  const filename = pathParts[pathParts.length - 1];
  const threadId = filename.replace(/\.[a-zA-Z0-9]+$/, "");

  return {
    ftbucket: `https://www.ftbucket.info/scrapshot/ftb/cont/${host}_${boardCode}_res_${threadId}/index.htm`,
    futabaForest: `https://futabaforest.net${location.pathname}`,
  };
}

function appendArchiveLinkList(parent, insertMethod) {
  const links = computeArchiveLinks();
  if (!links) return null;

  const list = document.createElement("ul");
  list.id = "futaba-helper-dead-links";

  [
    ["FTBucket", links.ftbucket],
    ["Futaba Forest", links.futabaForest],
  ].forEach(([label, href]) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = label;
    li.appendChild(a);
    list.appendChild(li);
  });

  parent[insertMethod](list);
  return list;
}

// スレが完全に消滅すると .thre を含む通常のテンプレートではなく、専用の404ページが
// 返ってくる(h1タグが目印)。この場合、下の.thre前提のロジックには一切到達しない
// (早期returnされる)ため、ここで別途アーカイブへのリンクを差し込む。
(function maybeInsertDeadThreadLinks() {
  if (document.querySelector(".thre")) return; // 通常のスレページ側は下のIIFEに任せる
  if (!document.querySelector("h1")) return; // 404ページ特有の目印が無ければ何もしない
  appendArchiveLinkList(document.body, "prepend");
})();

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
  let lastReplies = []; // 画像一覧(ギャラリー)表示用に最新のレス一覧を保持

  // 前回訪問時点での最大レス番号。前回の記録が無い(=初回訪問)場合は null のままにし、
  // 新着扱いを一切しない。iframe読み込み直後に非同期で埋まる。
  let newSinceResNo = null;
  let newBannerInserted = false;

  function sendReplies() {
    buildContainerMap();
    const replies = FutabaExtract.extractReplies(threEl);
    if (replies.length === 0) return;
    if (newSinceResNo !== null) {
      replies.forEach((r) => {
        r.isNew = r.resNo > newSinceResNo;
      });
    }
    lastReplies = replies;
    buildPositions();
    // ミニマップ判定は panel.js からの返信を待たず、ここで直接幅を決める
    // (メッセージの往復に依存すると失敗ポイントが増えるため)。
    container.style.width = replies.length > MINIMAP_THRESHOLD ? "72px" : "300px";
    iframe.contentWindow.postMessage(
      { type: "futaba-helper:replies", replies },
      panelOrigin
    );
    sendViewport();
    insertNewBannerOnce(replies);
  }

  // 前回訪問より後に増えたレスの先頭に「ここから新着」の区切りを1回だけ差し込む。
  // 以降スレが伸びても区切りの位置(=前回訪問との境目)は動かさない。
  function insertNewBannerOnce(replies) {
    if (newBannerInserted || newSinceResNo === null) return;
    const newReplies = replies.filter((r) => r.isNew);
    if (newReplies.length === 0) return;
    const firstNew = newReplies[0];
    const rtdEl = containerById.get(firstNew.id);
    const table = rtdEl && rtdEl !== threEl ? rtdEl.closest("table") : null;
    if (!table) return;
    const banner = document.createElement("div");
    banner.id = "futaba-helper-new-banner";
    banner.textContent = `ここから新着 ${newReplies.length}件`;
    table.parentNode.insertBefore(banner, table);
    newBannerInserted = true;
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

  // 推定消滅時刻(.cntd)を実際の日時に変換する。
  // 返信が多い活発なスレでは「18:20頃消えます」のように当日の時刻で出るが、
  // OPのみ・返信0件のような静かなスレでは「24時04:48頃消えます」のような
  // 別形式(おそらく「あと24時間04分48秒」という残り時間のカウントダウン)で
  // 出ることを確認した。後者を時刻として誤読すると、むしろ元気なスレを
  // 「消滅済み」と誤判定しかねないため、先頭が素直に時刻(HH:MM)になっている
  // 場合だけ扱い、それ以外(カウントダウン形式など)は判定不能として諦める。
  function computeExpiryDate() {
    const expiryEl = threEl.querySelector(".cntd");
    if (!expiryEl) return null;
    const match = /^(\d{1,2}):(\d{2})/.exec((expiryEl.textContent || "").trim());
    if (!match) return null;
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      0,
      0
    );
  }

  // 推定消滅時刻を過ぎている(=間もなく404ページに切り替わる可能性が高い)場合、
  // ページ上部にアーカイブへのリンクを一度だけ差し込む。本物の404ページ自体への
  // リンク挿入は、.thre が無いページ用の maybeInsertDeadThreadLinks() 側が担当する
  // (このスレがまだ存在している間は threEl 前提のこちらで良い)。
  let archiveBannerInserted = false;
  function maybeInsertArchiveBanner() {
    if (archiveBannerInserted) return;
    const expiryDate = computeExpiryDate();
    if (!expiryDate || expiryDate.getTime() > Date.now()) return;

    const banner = document.createElement("div");
    banner.id = "futaba-helper-archive-banner";
    banner.textContent = "このスレは消滅している可能性があります。";
    const list = appendArchiveLinkList(banner, "appendChild");
    if (!list) return;

    threEl.parentNode.insertBefore(banner, threEl);
    archiveBannerInserted = true;
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
    el.scrollIntoView({ behavior: "auto", block: "center" });
    el.classList.remove("futaba-helper-flash");
    // reflow を挟んでアニメーションを再トリガーできるようにする
    void el.offsetWidth;
    el.classList.add("futaba-helper-flash");
    setTimeout(() => el.classList.remove("futaba-helper-flash"), 1200);
  }

  // スレ内の画像だけを一覧できるギャラリー(オーバーレイ)。
  // パネルは幅が狭い(ミニマップ時72px)のでパネル内には作らず、ページ側に重ねて表示する。
  const GALLERY_ID = "futaba-helper-gallery-backdrop";

  function closeGallery() {
    const el = document.getElementById(GALLERY_ID);
    if (el) el.remove();
    document.removeEventListener("keydown", onGalleryKeydown);
  }

  function onGalleryKeydown(event) {
    if (event.key === "Escape") closeGallery();
  }

  function openGallery() {
    closeGallery();
    const items = lastReplies.filter((r) => r.thumbUrl);
    if (items.length === 0) return;

    const backdrop = document.createElement("div");
    backdrop.id = GALLERY_ID;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeGallery();
    });

    const panel = document.createElement("div");
    panel.id = "futaba-helper-gallery-panel";

    const header = document.createElement("div");
    header.id = "futaba-helper-gallery-header";
    const title = document.createElement("span");
    title.textContent = `画像一覧 (${items.length}件)`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeGallery);
    header.appendChild(title);
    header.appendChild(closeBtn);

    const grid = document.createElement("div");
    grid.id = "futaba-helper-gallery-grid";
    items.forEach((reply) => {
      const item = document.createElement("button");
      item.className = "futaba-helper-gallery-item";
      const img = document.createElement("img");
      img.src = reply.thumbUrl;
      img.loading = "lazy";
      img.alt = `No.${reply.resNo}`;
      const label = document.createElement("span");
      label.textContent = `No.${reply.resNo}`;
      item.appendChild(img);
      item.appendChild(label);
      item.addEventListener("click", () => {
        closeGallery();
        jumpTo(reply.id);
      });
      grid.appendChild(item);
    });

    panel.appendChild(header);
    panel.appendChild(grid);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onGalleryKeydown);
  }

  iframe.addEventListener("load", () => {
    const threadId = threEl.getAttribute("data-res");
    const prevLookup = threadId ? FutabaTracker.get(threadId) : Promise.resolve(null);

    prevLookup.then((prev) => {
      newSinceResNo =
        prev && typeof prev.lastSeenResNo === "number" ? prev.lastSeenResNo : null;
      sendReplies();
      maybeInsertArchiveBanner();

      const archiveLinks = computeArchiveLinks();
      const meta = extractThreadMeta();
      if (!meta) return;
      const lastSeenResNo = lastReplies.reduce((max, r) => Math.max(max, r.resNo), 0);
      captureThumbnail().then(({ thumbDataUrl, imgUrl }) => {
        const entry = {
          ...meta,
          archiveUrl: archiveLinks ? archiveLinks.ftbucket : null,
          archiveUrlAlt: archiveLinks ? archiveLinks.futabaForest : null,
          lastSeenResNo,
        };
        if (thumbDataUrl) entry.thumbDataUrl = thumbDataUrl;
        if (imgUrl) entry.imgUrl = imgUrl;
        FutabaTracker.upsert(entry);
      });
    });
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data) return;
    if (data.type === "futaba-helper:jump") {
      jumpTo(data.id);
    } else if (data.type === "futaba-helper:gallery-open") {
      openGallery();
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

  // 消滅予想時刻は、ページを開いたまま何も動きが無くても(=MutationObserverが
  // 発火しなくても)いずれ過ぎる。開きっぱなしのタブでもバナーが出るよう定期的に確認する。
  setInterval(maybeInsertArchiveBanner, 60000);
})();
