// ふたばのスレページDOMからレス情報を抽出する。
//
// スレ全体は <div class="thre" data-res="..."> に包まれている。
// OP(スレ主の投稿)はこの div の直接の子として画像・本文が並び、
// 各レスは <table border=0><tr><td class=rts>…</td><td class=rtd>…</td></tr></table>
// として .thre の子に並ぶ(入れ子にはならない)。
// そうだねボタンは <a class="sod" id="sd<投稿ID>">+</a> または
// <a class="sod" id="sd<投稿ID>">そうだねx<件数></a> という形。
// レス番号は <span class="rsc">1</span> のように振られる(OPには無いので0扱いにする)。
window.FutabaExtract = (function () {
  // OPの画像要素(最初の<table>より前にある<img>)。無ければnull。
  function findOpThumb(threEl) {
    for (const child of threEl.children) {
      if (child.tagName === "TABLE") break; // 最初のレスに到達したら終了
      if (child.tagName === "IMG") return child;
      if (child.querySelector) {
        const img = child.querySelector("img");
        if (img) return img;
      }
    }
    return null;
  }

  function parseGood(text) {
    const match = text.trim().match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function commentText(container) {
    const blockquote = container.querySelector("blockquote");
    if (!blockquote) return "";
    const clone = blockquote.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return clone.textContent.replace(/\n{2,}/g, "\n").trim();
  }

  function extractReplies(threEl) {
    if (!threEl) return [];
    const opThumb = findOpThumb(threEl);

    return Array.from(threEl.querySelectorAll("a.sod")).map((sod) => {
      const rtd = sod.closest("td.rtd");
      const container = rtd || threEl;
      const imgEl = rtd ? rtd.querySelector("img") : opThumb;
      const idMatch = sod.id.match(/^sd(\d+)$/);
      const rscEl = rtd ? rtd.querySelector(".rsc") : null;

      return {
        id: idMatch ? idMatch[1] : null,
        resNo: rscEl ? parseInt(rscEl.textContent, 10) : 0,
        kind: imgEl ? "media" : "text",
        good: parseGood(sod.textContent),
        comment: commentText(container),
        thumbUrl: imgEl ? imgEl.src : null,
      };
    });
  }

  return { extractReplies };
})();
