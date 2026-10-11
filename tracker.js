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

  return { list, get, upsert, remove, clear };
})();
