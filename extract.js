// ふたばのスレページDOMからレス情報を抽出する。
//
// スレ全体は <div class="thre" data-res="..."> に包まれている。
// OP(スレ主の投稿)はこの div の直接の子として画像・本文が並び、
// 各レスは <table border=0><tr><td class=rts>…</td><td class=rtd>…</td></tr></table>
// として .thre の子に並ぶ(入れ子にはならない)。
// そうだねボタンは <a class="sod" id="sd<投稿ID>">+</a> または
// <a class="sod" id="sd<投稿ID>">そうだねx<件数></a> という形。
window.FutabaExtract = (function () {
  function hasOpMedia(threEl) {
    for (const child of threEl.children) {
      if (child.tagName === "TABLE") break; // 最初のレスに到達したら終了
      if (child.tagName === "IMG" || (child.querySelector && child.querySelector("img"))) {
        return true;
      }
    }
    return false;
  }

  function parseGood(text) {
    const match = text.trim().match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function extractReplies(threEl) {
    if (!threEl) return [];
    const opMedia = hasOpMedia(threEl);

    return Array.from(threEl.querySelectorAll("a.sod")).map((sod) => {
      const rtd = sod.closest("td.rtd");
      const hasMedia = rtd ? !!rtd.querySelector("img") : opMedia;
      const idMatch = sod.id.match(/^sd(\d+)$/);
      return {
        id: idMatch ? idMatch[1] : null,
        kind: hasMedia ? "media" : "text",
        good: parseGood(sod.textContent),
      };
    });
  }

  return { extractReplies };
})();
