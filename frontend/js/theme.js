// theme.js
// ========
// Alterna entre tema claro/escuro e lembra a escolha em localStorage.
// Carregado em TODAS as páginas (a marcação <html class="dark"> só é
// aplicada de fato pelo script inline em <head>, ver views/head - aqui
// a classe é reaplicada e os botões [data-theme-btn] ficam sincronizados
// com o tema atual).
//
// O padrão sem escolha gravada é "dark". Esse fallback está duplicado no
// script inline de cada HTML (o Flask serve as páginas como arquivos
// estáticos, sem partial compartilhado) - se mudar aqui, mude nos 12
// arquivos também, senão a página pinta um tema e o botão marca o outro.

function setTheme(theme) {
  localStorage.setItem("theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelectorAll("[data-theme-btn]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
    btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === theme));
  });
}

document.addEventListener("DOMContentLoaded", function () {
  var current = localStorage.getItem("theme") || "dark";
  document.querySelectorAll("[data-theme-btn]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.themeBtn === current);
    btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === current));
    btn.addEventListener("click", function () {
      setTheme(btn.dataset.themeBtn);
    });
  });
});
