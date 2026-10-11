let allThreads = [];

function render(filterText) {
  const listEl = document.getElementById("thread-list");
  const emptyEl = document.getElementById("empty-message");
  listEl.innerHTML = "";

  const q = (filterText || "").trim().toLowerCase();
  const threads = q
    ? allThreads.filter((t) => t.title.toLowerCase().includes(q))
    : allThreads;

  if (allThreads.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  for (const thread of threads) {
    listEl.appendChild(renderCard(thread));
  }
}

function renderCard(thread) {
  const card = document.createElement("div");
  card.className = "thread-card";

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

  info.appendChild(title);
  info.appendChild(meta);

  const links = document.createElement("div");
  links.className = "thread-links";

  const liveLink = document.createElement("a");
  liveLink.href = thread.url;
  liveLink.target = "_blank";
  liveLink.rel = "noopener noreferrer";
  liveLink.textContent = "元スレ";
  links.appendChild(liveLink);

  if (thread.archiveUrl) {
    const archiveLink = document.createElement("a");
    archiveLink.href = thread.archiveUrl;
    archiveLink.target = "_blank";
    archiveLink.rel = "noopener noreferrer";
    archiveLink.textContent = "保管";
    links.appendChild(archiveLink);
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
    render(document.getElementById("filter").value);
  });
}

document.getElementById("filter").addEventListener("input", (e) => {
  render(e.target.value);
});

document.getElementById("clear-all").addEventListener("click", () => {
  if (!confirm("記録した全てのスレ情報を削除します。よろしいですか?")) return;
  FutabaTracker.clear().then(load);
});

load();
