(function () {
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

  function sendReplies() {
    const threEl = document.querySelector(".thre");
    const replies = FutabaExtract.extractReplies(threEl);
    if (replies.length === 0) return;
    iframe.contentWindow.postMessage(
      { type: "futaba-helper:replies", replies },
      panelOrigin
    );
  }

  iframe.addEventListener("load", sendReplies);

  const threEl = document.querySelector(".thre");
  if (threEl) {
    let pending = null;
    const observer = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(sendReplies, 300);
    });
    observer.observe(threEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
})();
