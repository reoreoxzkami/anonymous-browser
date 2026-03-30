import express from "express";
import fetch from "node-fetch";
import session from "express-session";
import bcrypt from "bcrypt";
import helmet from "helmet";
import Redis from "ioredis";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   🔒 セキュリティ
========================= */
app.use(
  helmet({
    contentSecurityPolicy: false, // ← これ重要（フロント動かすため）
  })
);

/* =========================
   📦 基本
========================= */
app.use(express.json());
app.use(express.static("public"));

/* =========================
   🧠 Supabase
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL || "https://YOUR.supabase.co",
  process.env.SUPABASE_KEY || "YOUR_KEY"
);

/* =========================
   ⚡ Redis
========================= */
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

/* =========================
   🔒 セッション
========================= */
app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60,
    },
  })
);

/* =========================
   🛡 URLチェック
========================= */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/* =========================
   🔐 REGISTER
========================= */
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

  if (error) return res.send("登録失敗");
  res.send("登録成功");
});

/* =========================
   🔐 LOGIN
========================= */
app.get("/login", async (req, res) => {
  const { email, pass } = req.query;
  if (!email || !pass) return res.send("入力エラー");

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!data) return res.send("ユーザーなし");

  const match = await bcrypt.compare(pass, data.password);
  if (!match) return res.send("パスワード違う");

  req.session.user = {
    id: data.id,
    email: data.email,
    premium: data.premium,
  };

  res.send("ログイン成功");
});

/* =========================
   🚪 LOGOUT
========================= */
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.send("ログアウト");
});

/* =========================
   🚫 制限
========================= */
const usage = {};

app.use((req, res, next) => {
  if (req.path === "/proxy") {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const isPremium = req.session.user?.premium;

    if (!usage[ip]) {
      usage[ip] = { count: 0, lastReset: Date.now() };
    }

    if (Date.now() - usage[ip].lastReset > 60 * 60 * 1000) {
      usage[ip] = { count: 0, lastReset: Date.now() };
    }

    usage[ip].count++;

    if (!isPremium && usage[ip].count > 20) {
      return res.send("無料制限です。有料へ");
    }
  }

  next();
});

/* =========================
   🌐 PROXY（改善版）
========================= */
app.get("/proxy", async (req, res) => {
  let url = req.query.url;

  if (!url) return res.send("URLなし");

  if (!url.startsWith("http")) {
    url = "https://" + url;
  }

  if (!isValidUrl(url)) {
    return res.send("URL不正");
  }

  try {
    // 🔥 キャッシュ
    const cached = await redis.get(url);
    if (cached) {
      console.log("CACHE HIT");
      return res.send(cached);
    }

    console.log("FETCH:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    let html = await response.text();

    // 🔥 script無効化（CSP回避）
    html = html.replace(/<script/gi, "&lt;script");

    // 🔥 相対パス修正
    const base = new URL(url).origin;
    html = html.replace(/href="\//g, `href="${base}/`);
    html = html.replace(/src="\//g, `src="${base}/`);

    // 🔥 キャッシュ保存
    await redis.set(url, html, "EX", 60);

    res.send(html);
  } catch (err) {
    console.error(err);
    res.send("取得エラー");
  }
});

/* =========================
   🔍 SEARCH（修正済）
========================= */
app.get("/search", (req, res) => {
  const q = req.query.q;

  const url = "https://duckduckgo.com/?q=" + encodeURIComponent(q);

  res.redirect("/proxy?url=" + encodeURIComponent(url));
});

/* =========================
   🚀 起動
========================= */
app.listen(PORT, () => {
  console.log("🚀 Ultimate Server Running on", PORT);
});