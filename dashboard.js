let allThreads = [];

// expiryText(例: "18:20頃消えます")は時刻のみなので、記録した時点(lastSeen)の日付と
// 組み合わせて実際の日時に変換する。組み合わせた結果が記録時刻より前になる場合は
// 日をまたいでいるとみなして+1日する。
// OPのみ・返信0件のような静かなスレでは「24時04:48頃消えます」のような別形式
// (おそらく「あと24時間04分48秒」という残り時間のカウントダウン)で出ることが
// あり、これを時刻として誤読すると実際より早く消滅するように見えてしまうため、
// 先頭が素直に時刻(HH:MM)になっている場合だけ扱う。
function parseExpiryDate(thread) {
  const match = /^(\d{1,2}):(\d{2})/.exec((thread.expiryText || "").trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ref = new Date(thread.lastSeen || thread.firstSeen || Date.now());
  const expiry = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), hour, minute, 0, 0);
  if (expiry.getTime() < ref.getTime()) {
    expiry.setDate(expiry.getDate() + 1);
  }
  return expiry;
}

function remainingLabel(expiryDate) {
  if (!expiryDate) return { text: "推定消滅時刻不明", level: "" };
  const diffMs = expiryDate.getTime() - Date.now();
  if (diffMs <= 0) return { text: "消滅済みの可能性", level: "critical" };
  const totalMin = Math.round(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const text = h > 0 ? `残り${h}時間${m}分` : `残り${m}分`;
  const level = totalMin <= 15 ? "critical" : totalMin <= 60 ? "warning" : "";
  return { text, level };
}

function withDerived(thread) {
  const expiryDate = parseExpiryDate(thread);
  return {
    ...thread,
    expiryDate,
    remainingMs: expiryDate ? expiryDate.getTime() - Date.now() : null,
  };
}

function sortThreads(threads, mode) {
  const sorted = [...threads];
  if (mode === "expiry") {
    sorted.sort((a, b) => {
      if (a.remainingMs === null) return 1;
      if (b.remainingMs === null) return -1;
      return a.remainingMs - b.remainingMs;
    });
  } else if (mode === "created") {
    sorted.sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));
  } else if (mode === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "ja"));
  } else {
    sorted.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }
  return sorted;
}

function render() {
  const listEl = document.getElementById("thread-list");
  const emptyEl = document.getElementById("empty-message");
  listEl.innerHTML = "";

  if (allThreads.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const q = document.getElementById("filter").value.trim().toLowerCase();
  const sortMode = document.getElementById("sort").value;

  let threads = allThreads.map(withDerived);
  if (q) {
    threads = threads.filter((t) => t.title.toLowerCase().includes(q));
  }
  threads = sortThreads(threads, sortMode);

  for (const thread of threads) {
    listEl.appendChild(renderCard(thread));
  }
}

function renderCard(thread) {
  const card = document.createElement("div");
  card.className = "thread-card";

  const thumb = document.createElement("div");
  thumb.className = "thread-thumb";
  if (thread.thumbDataUrl) {
    const img = document.createElement("img");
    img.src = thread.thumbDataUrl;
    img.alt = "";
    thumb.appendChild(img);
  }
  card.appendChild(thumb);

  const info = document.createElement("div");
  info.className = "thread-info";

  const title = document.createElement("div");
  title.className = "thread-title";
  title.textContent = thread.title;
  title.title = thread.title;

  const meta = document.createElement("div");
  meta.className = "thread-meta";
  const parts = [];
  if (thread.createdText) parts.push(`発生: ${thread.createdText}`);
  if (thread.expiryText) parts.push(`推定消滅: ${thread.expiryText}`);
  meta.textContent = parts.join(" / ");

  const remaining = remainingLabel(thread.expiryDate);
  const remainingEl = document.createElement("div");
  remainingEl.className = `thread-remaining${remaining.level ? ` ${remaining.level}` : ""}`;
  remainingEl.textContent = remaining.text;

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(remainingEl);

  const links = document.createElement("div");
  links.className = "thread-links";

  const liveLink = document.createElement("a");
  liveLink.href = thread.url;
  liveLink.target = "_blank";
  liveLink.rel = "noopener noreferrer";
  liveLink.textContent = "元スレ";
  links.appendChild(liveLink);

  // 保存時点のURLではなく表示するたびに組み立てる: アーカイブ側のURL規則が
  // 後から変わっても、スレに再訪問しなくてもダッシュボード側に反映されるように。
  const archiveLinks = FutabaTracker.computeArchiveLinks(thread.url);
  if (archiveLinks) {
    const archiveLink = document.createElement("a");
    archiveLink.href = archiveLinks.ftbucket;
    archiveLink.target = "_blank";
    archiveLink.rel = "noopener noreferrer";
    archiveLink.textContent = "保管(FTBucket)";
    links.appendChild(archiveLink);

    const altLink = document.createElement("a");
    altLink.href = archiveLinks.futabaForest;
    altLink.target = "_blank";
    altLink.rel = "noopener noreferrer";
    altLink.textContent = "保管(Futaba Forest)";
    links.appendChild(altLink);
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "一覧から削除";
  removeBtn.addEventListener("click", () => {
    FutabaTracker.remove(thread.id).then(load);
  });

  card.appendChild(info);
  card.appendChild(links);
  card.appendChild(removeBtn);
  return card;
}

function load() {
  FutabaTracker.list().then((threads) => {
    allThreads = threads;
    render();
  });
}

document.getElementById("filter").addEventListener("input", render);
document.getElementById("sort").addEventListener("change", render);

document.getElementById("clear-all").addEventListener("click", () => {
  if (!confirm("記録した全てのスレ情報を削除します。よろしいですか?")) return;
  FutabaTracker.clear().then(load);
});

load();
// 残り時間の表示を更新するため定期的に再描画する(フィルタ/ソート条件はそのまま)。
setInterval(render, 30000);
