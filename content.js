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

  container.appendChild(iframe);
  document.body.appendChild(container);
})();
