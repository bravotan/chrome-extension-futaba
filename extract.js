// ふたばのスレページDOMからレス情報を抽出する。
//
// スレ全体は class="thre" data-res="..." の要素に包まれる(ふたば本体では<div>、
// ログ保存サイトなどの鏡では<span>になっている例を確認済みなので、タグ名には依存せず
// .thre というクラス名だけで判定する)。
// OP(スレ主の投稿)はこの要素の直接の子として画像・本文が並び、
// 各レスは <table border=0><tr><td class=rts>…</td><td class=rtd>…</td></tr></table>
// として .thre の子に並ぶ(入れ子にはならない)。
// そうだねボタンは <a class="sod" id="sd<投稿ID>">+</a> または
// <a class="sod" id="sd<投稿ID>">そうだねx<件数></a> という形。
// レス番号は <span class="rsc">1</span> のように振られる(OPには無いので0扱いにする)。
// 削除されたレスは <table border=0 class=deleted> のように deleted クラスが付き、
// blockquote の中身は削除通知の文言に置き換わる(ログ保存サイトで確認)。
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

  // blockquote内を1行ずつ見て、<font color="#789922">1行まるごと</font>だけの行を
  // 引用行(quotes)、それ以外のテキスト行を本文(body)として分ける。
  function splitQuotesAndBody(blockquote) {
    const quotes = [];
    const bodyLines = [];
    let lineNodes = [];

    function flushLine() {
      if (lineNodes.length === 0) return;
      const isQuoteLine =
        lineNodes.length === 1 &&
        lineNodes[0].nodeType === 1 &&
        lineNodes[0].tagName === "FONT" &&
        (lineNodes[0].getAttribute("color") || "").toLowerCase() === "#789922";

      const text = lineNodes
        .map((n) => n.textContent)
        .join("")
        .trim();
      lineNodes = [];
      if (!text) return;

      if (isQuoteLine) {
        quotes.push(text.replace(/^>+\s*/, ""));
      } else {
        bodyLines.push(text);
      }
    }

    blockquote.childNodes.forEach((node) => {
      if (node.nodeType === 1 && node.tagName === "BR") {
        flushLine();
      } else {
        lineNodes.push(node);
      }
    });
    flushLine();

    return { quotes, body: bodyLines.join("\n") };
  }

  function isDeleted(rtd) {
    const table = rtd && rtd.closest("table");
    return !!(table && table.classList.contains("deleted"));
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
      const blockquote = container.querySelector("blockquote");
      const { quotes, body } = blockquote
        ? splitQuotesAndBody(blockquote)
        : { quotes: [], body: "" };

      return {
        id: idMatch ? idMatch[1] : null,
        resNo: rscEl ? parseInt(rscEl.textContent, 10) : 0,
        kind: imgEl ? "media" : "text",
        good: parseGood(sod.textContent),
        quotes,
        body,
        thumbUrl: imgEl ? imgEl.src : null,
        deleted: isDeleted(rtd),
      };
    });
  }

  return { extractReplies };
})();
