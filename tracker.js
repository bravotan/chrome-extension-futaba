// チェックしたスレの情報を chrome.storage.local に記録・取得するための共通モジュール。
// content.js(書き込み)と dashboard.js(読み込み・一覧表示)の両方から読み込まれる。
window.FutabaTracker = (function () {
  const STORAGE_KEY = "trackedThreads";
  const MAX_TRACKED = 300;

  function getAll() {
    return chrome.storage.local.get(STORAGE_KEY).then((data) => data[STORAGE_KEY] || {});
  }

  function setAll(threads) {
    return chrome.storage.local.set({ [STORAGE_KEY]: threads });
  }

  // entry: { id, title, url, archiveUrl, createdText, expiryText }
  function upsert(entry) {
    return getAll().then((threads) => {
      const prev = threads[entry.id] || {};
      const now = Date.now();
      threads[entry.id] = {
        ...prev,
        ...entry,
        firstSeen: prev.firstSeen || now,
        lastSeen: now,
      };

      const ids = Object.keys(threads);
      if (ids.length > MAX_TRACKED) {
        ids
          .sort((a, b) => threads[a].lastSeen - threads[b].lastSeen)
          .slice(0, ids.length - MAX_TRACKED)
          .forEach((id) => delete threads[id]);
      }

      return setAll(threads);
    });
  }

  function get(id) {
    return getAll().then((threads) => threads[id] || null);
  }

  function list() {
    return getAll().then((threads) =>
      Object.values(threads).sort((a, b) => b.lastSeen - a.lastSeen)
    );
  }

  function remove(id) {
    return getAll().then((threads) => {
      delete threads[id];
      return setAll(threads);
    });
  }

  function clear() {
    return setAll({});
  }

  // ふたば本体のスレURLから、アーカイブサイト側の対応URLを組み立てる。
  // content.js(その場のURLから)と dashboard.js(記録したURLから、後になって)の
  // 両方で使うのでここに置き、アーカイブ側のURL規則が変わっても1箇所直せばよいようにする。
  // 例: https://may.2chan.net/b/res/123.htm ->
  //   FTBucket:      https://www.ftbucket.info/scrapshot/ftb/cont/may.2chan.net_b_res_123/index.htm
  //   Futaba Forest: https://futabaforest.net/b/res/123.htm
  // 全板で通用する保証はないため外れたらリンク先が404になるだけのベストエフォート。
  function computeArchiveLinks(threadUrl) {
    let url;
    try {
      url = new URL(threadUrl);
    } catch {
      return null;
    }
    const host = url.hostname;
    if (!host.endsWith(".2chan.net")) return null;
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return null;
    const boardCode = pathParts[0];
    const filename = pathParts[pathParts.length - 1];
    const threadId = filename.replace(/\.[a-zA-Z0-9]+$/, "");

    return {
      ftbucket: `https://www.ftbucket.info/scrapshot/ftb/cont/${host}_${boardCode}_res_${threadId}/index.htm`,
      futabaForest: `https://futabaforest.net${url.pathname}`,
    };
  }

  return { list, get, upsert, remove, clear, computeArchiveLinks };
})();
