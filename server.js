import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

app.use(express.static("public"));

// URL正規化
function normalizeUrl(url) {
  if (!url.startsWith("http")) {
    return "https://" + url;
  }
  return url;
}

// 🔍 検索（DuckDuckGo）
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.send("No query");

  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(searchUrl);
    const html = await response.text();
    res.send(html);
  } catch {
    res.status(500).send("Search error");
  }
});

// 🌐 プロキシ
app.get("/proxy", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.send("No URL");

  targetUrl = normalizeUrl(targetUrl);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    let html = await response.text();

    // 🔥 リンク書き換え（最低限）
    html = html.replace(/href="(.*?)"/g, (match, p1) => {
      if (p1.startsWith("http")) {
        return `href="/proxy?url=${encodeURIComponent(p1)}"`;
      }
      return match;
    });

    res.send(html);
  } catch (err) {
    res.status(500).send("Proxy error");
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});