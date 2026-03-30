async function go() {
  const url = document.getElementById("url").value;

  const proxyUrl = "/proxy?url=" + encodeURIComponent(url);

  document.getElementById("frame").src = proxyUrl;
}

function search() {
  const q = document.getElementById("search").value;

  const url = "https://duckduckgo.com/?q=" + encodeURIComponent(q);

  document.getElementById("frame").src =
    "/proxy?url=" + encodeURIComponent(url);
}

// 仮ログイン（後でSupabaseに置き換え）
function login() {
  const email = document.getElementById("email").value;
  alert("Logged in as: " + email);
}