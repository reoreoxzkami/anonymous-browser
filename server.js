import express from "express";
import fetch from "node-fetch";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;
const cache = {};

/* =============================
   セキュリティ
============================= */
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

/* =============================
   Supabase
============================= */
/*
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
*/
/* =============================
   Redis
============================= */
let redis;
if (process.env.REDIS_URL) {
}

/* =============================
   セッション
============================= */
app.set("trust proxy", 1); // ←これ重要（Render用）

app.use(
  session({
    secret: "my-secret-key", 
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // Renderはhttps
      sameSite: "none"
    },
  })
);
/* =============================
   ユーティリティ
============================= */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/* =============================
   登録
============================= */
/*
app.get("/register", async (req, res) => {
  const { email, pass } = req.query;

  if (!email || !pass) return res.send("入力エラー");

  const hash = await bcrypt.hash(pass, 10);

  const { error } = await supabase.from("users").insert([
    {
      email,
      password: hash,
      premium: false,
    },
  ]);

  if (error) {
    console.log(error);
    return res.send("登録失敗: " + error.message);
  }

  res.send("登録成功");
});
*/
/* =============================
   ログイン
============================= */
/*
app.get("/login", async (req, res) => {
  const { email, pass } = req.query;

  if (!email || !pass) return res.send("入力エラー");

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return res.send("ユーザーなし");

  const match = await bcrypt.compare(pass, data.password);
  if (!match) return res.send("パスワード違う");

  req.session.user = {
    id: data.id,
    email: data.email,
    premium: data.premium,
  };

  res.send("ログイン成功");
});
*/

/* =============================
   ログアウト
============================= */
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.send("ログアウト");
});

/* =============================
   使用制限（無料ユーザー）
============================= */
const usage = {};

app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress;

  if (!usage[ip]) {
    usage[ip] = { count: 0, lastReset: Date.now() };
  }

  if (Date.now() - usage[ip].lastReset > 60 * 60 * 1000) {
    usage[ip] = { count: 0, lastReset: Date.now() };
  }

  usage[ip].count++;

  req.usage = usage[ip];
  next();
});

/* =============================
   プロキシ（メイン機能）
============================= */
app.get("/proxy", async (req, res) => {
  if (req.usage.count > 100) {
  return res.send("使いすぎです（1時間後にリセット）");
}
    
  const url = req.query.url;

  if (!isValidUrl(url)) return res.send("URL不正");

  res.send(`
    <iframe src="${url}" 
    style="width:100%; height:100vh; border:none;">
    </iframe>
  `);
});

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    res.send(html);
  } catch (e) {
    res.send("このサイトは匿名表示できません");
  }
});

/* =============================
   検索 (エンドポイント: /api/search)
============================= */
app.get('/api/search', async (req, res) => {
  const q = req.query.q || "";
  const lang = req.query.lang || "ja";
  const page = Number(req.query.page || 1);
  const perPage = 5;

  if (!global.cache) global.cache = {};
  if (!global.searchCount) global.searchCount = {};

  if (global.cache[q + page]) {
    return res.send(global.cache[q + page]);
  }

  if (q) {
    global.searchCount[q] = (global.searchCount[q] || 0) + 1;
  }

  const ranking = Object.entries(global.searchCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let results = [];

  try {
    if (q) {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`
      );
      const data = await response.json();

      results = (data.RelatedTopics || [])
        .flatMap(item => item.Topics || [item])
        .filter(item => item.FirstURL && item.Text)
        .map(item => ({
          title: item.Text,
          url: item.FirstURL,
          content: item.Text
        }));
    }
  } catch (e) {
    console.error(e);
  }

  // ページネーション
  const paginated = results.slice((page - 1) * perPage, page * perPage);

  // 多言語
  const t = {
    ja: { placeholder: "検索...", no: "結果が見つかりません", rank: "人気検索" },
    en: { placeholder: "Search...", no: "No results", rank: "Trending" }
  }[lang];

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${q}</title>

<style>
body { font-family: Arial; margin:0; background:#fff; }
.dark { background:#0f172a; color:#fff; }

.header { display:flex; padding:15px; gap:10px; }
input { flex:1; padding:10px; border-radius:20px; }

.container { width:700px; margin:20px 0 20px 150px; }
.result { margin-bottom:20px; }

.rank { position:fixed; right:20px; top:100px; width:200px; }
.rank div { cursor:pointer; padding:5px; }

.url { font-size:12px; color:gray; }
</style>
</head>

<body>

<div class="header">
  <div onclick="location.href='/'" style="cursor:pointer;">🔍</div>

  <form action="/api/search">
    <input name="q" value="${q}" placeholder="${t.placeholder}">
    <input type="hidden" name="lang" value="${lang}">
  </form>

  <select onchange="changeLang(this.value)">
    <option value="ja" ${lang==="ja"?"selected":""}>JP</option>
    <option value="en" ${lang==="en"?"selected":""}>EN</option>
  </select>
</div>

<div class="container">
`;

  if (paginated.length > 0) {
    paginated.forEach(r => {
      const domain = new URL(r.url).hostname;

      html += `
        <div class="result">
          <img src="https://www.google.com/s2/favicons?domain=${domain}" width="16">
          
          <!-- プロキシ経由 -->
          <a href="/proxy?url=${encodeURIComponent(r.url)}" target="_blank">
            ${r.title}
          </a>

          <!-- 元URL表示 -->
          <div class="url">${r.url}</div>

          <div class="snippet">${r.content}</div>
        </div>
      `;
    });
  } else if (q) {
    html += `<p>${t.no}</p>`;
  }

  html += `
</div>

<div class="rank">
  <h4>${t.rank}</h4>
  ${ranking.map(r => `
    <div onclick="location.href='/api/search?q=${r[0]}'">
      🔥 ${r[0]}
    </div>
  `).join("")}
</div>

<div style="margin:40px 0; text-align:center;">
  ${page > 1 ? `<a href="/api/search?q=${q}&page=${page-1}">←</a>` : ""}
  <span style="margin:0 20px;">${page}</span>
  ${results.length > page * perPage ? `<a href="/api/search?q=${q}&page=${page+1}">→</a>` : ""}
</div>

<script>
function changeLang(l) {
  const url = new URL(window.location.href);
  url.searchParams.set("lang", l);
  location.href = url.toString();
}
</script>

</body>
</html>
`;

  global.cache[q + page] = html;
  res.send(html);
});
/* =============================
   静的ファイル
============================= */
app.use(express.static("public"));

/* =============================
   起動
============================= */
app.listen(PORT, () => {
  console.log("🚀 Server Running on http://localhost:" + PORT);
});