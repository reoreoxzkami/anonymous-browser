const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

loginTab.addEventListener("click", () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
});

registerTab.addEventListener("click", () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPass").value;

  const res = await fetch(`/login?email=${email}&pass=${pass}`);
  const text = await res.text();

  alert(text);

  if (text.includes("成功")) {
    document.getElementById("auth").style.display = "none";
    document.getElementById("app").style.display = "block";
  }
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;

  const res = await fetch(`/register?email=${email}&pass=${pass}`);
  const text = await res.text();

  alert(text);
});

document.getElementById("searchBtn").addEventListener("click", () => {
  const q = document.getElementById("searchBox").value;
  window.location = `/search?q=${encodeURIComponent(q)}`;
});

document.getElementById("openBtn").addEventListener("click", () => {
  const url = document.getElementById("urlBox").value;
  window.location = `/proxy?url=${encodeURIComponent(url)}`;
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/logout");
  location.reload();
});