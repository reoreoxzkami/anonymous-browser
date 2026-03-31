import express from "express";
import fetch from "node-fetch";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import Redis from "ioredis";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
/* =============================
   Redis
============================= */
let redis;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
}

/* =============================
   セッション
============================= */
app.set("trust proxy", 1); // ←これ重要（Render用）

app.use(
  session({
    secret: process.env.SESSION_SECRET,
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

/* =============================
   ログイン
============================= */
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
  if (!req.session.user) {
    return res.send("無料制限です。有料へ");
  }

  const url = req.query.url;

  if (!isValidUrl(url)) return res.send("URL不正");

  res.send(`
    <iframe src="${url}" 
    style="width:100%; height:100vh; border:none;">
    </iframe>
  `);
});

/* =============================
   検索
============================= */
app.get("/search", async (req, res) => {
  const q = req.query.q || "";

  let results = [];

  if (q) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: q,
          search_depth: "basic",
          include_answer: false,
          include_images: false,
        }),
      });

      const data = await response.json();
      results = data.results || [];
    } catch (e) {
      console.log(e);
    }
  }

  let html = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${q ? q + " - 検索" : "検索"}</title>

<style>
body {
  font-family: Arial;
  margin: 0;
  background: #fff;
}
.header {
  padding: 20px;
  border-bottom: 1px solid #eee;
}
.logo {
  font-size: 22px;
  font-weight: bold;
  color: #4285f4;
}
.search-box {
  margin-top: 10px;
}
input {
  width: 60%;
  padding: 10px;
  border-radius: 24px;
  border: 1px solid #ddd;
}
button {
  padding: 10px 20px;
  border-radius: 24px;
  border: none;
  background: #4285f4;
  color: white;
}
.container {
  width: 800px;
  margin: 20px auto;
}
.result {
  margin-bottom: 25px;
}
.result a {
  font-size: 18px;
  color: #1a0dab;
  text-decoration: none;
}
.result a:hover {
  text-decoration: underline;
}
.url {
  font-size: 14px;
  color: #006621;
}
.snippet {
  font-size: 14px;
  color: #545454;
}
</style>
</head>
<body>

<div class="header">
  <div class="logo">Anonymous Search</div>

  <form class="search-box" action="/search">
    <input name="q" value="${q}" placeholder="検索ワード">
    <button>検索</button>
  </form>
</div>

<div class="container">
`;

  results.forEach((r, i) => {
    html += `
      <div class="result">
        <div class="url">${r.url || ""}</div>
        <a href="/proxy?url=${encodeURIComponent(r.url)}">
          ${r.title}
        </a>
        <div class="snippet">${r.content || ""}</div>
      </div>
    `;
  });

  html += `
</div>
</body>
</html>
`;

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