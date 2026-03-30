import express from "express";
import fetch from "node-fetch";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   🔒 無料制限（IPベース）
========================= */
const usage = {};

app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  if (!usage[ip]) {
    usage[ip] = { count: 0, lastReset: Date.now() };
  }

  // 1時間リセット
  if (Date.now() - usage[ip].lastReset > 60 * 60 * 1000) {
    usage[ip] = { count: 0, lastReset: Date.now() };
  }

  usage[ip].count++;

  const LIMIT = 20;

  if (usage[ip].count > LIMIT) {
    return res.send(`
      <h1>⚠️ 無料制限に達しました</h1>
      <p>1時間後にリセットされます</p>
    `);
  }

  next();
});

/* =========================
   🌐 Proxy
========================= */
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send("URLが必要です");

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const contentType = response.headers.get("content-type");

    // 画像はそのまま
    if (contentType && contentType.startsWith("image")) {
      const buffer = await response.buffer();
      res.set("Content-Type", contentType);
      return res.send(buffer);
    }

    let html = await response.text();

    // リンクを書き換え
    html = html.replace(/href="\/(.*?)"/g, (match, p1) => {
      return `href="/proxy?url=${encodeURIComponent(
        new URL(p1, targetUrl)
      )}"`;
    });

    html = html.replace(/src="\/(.*?)"/g, (match, p1) => {
      return `src="/proxy?url=${encodeURIComponent(
        new URL(p1, targetUrl)
      )}"`;
    });

    res.send(html);
  } catch (err) {
    res.send("読み込みエラー");
  }
});

/* =========================
   🔍 検索（DuckDuckGo iframe回避）
========================= */
app.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.send("検索ワードを入力");

  const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;

  res.send(`
    <iframe src="${url}" style="width:100%; height:90vh;"></iframe>
  `);
});

/* =========================
   📄 静的ファイル
========================= */
app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});