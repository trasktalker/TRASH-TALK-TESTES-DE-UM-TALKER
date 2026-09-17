// Shared accessibility enhancements; existing copy and form handlers are retained.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("button[title]").forEach(function (button) {
    if (!button.hasAttribute("aria-label")) {
      button.setAttribute("aria-label", button.title);
    }
  });
  document.querySelectorAll(".field").forEach(function (field, index) {
    var input = field.querySelector("input:not([type=hidden]), textarea");
    var hint = field.querySelector(".field-hint");
    if (input && hint) {
      hint.id = hint.id || "field-hint-" + index;
      input.setAttribute("aria-describedby", hint.id);
    }
  });
  document.querySelectorAll(".banner-error, .field-error").forEach(function (el) {
    el.setAttribute("role", "alert");
  });
  document.querySelectorAll(".banner-success").forEach(function (el) {
    el.setAttribute("role", "status");
  });
  document.querySelectorAll('.sidebar a[href]').forEach(function (link) {
    if (link.getAttribute("href") === window.location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  });
  document.querySelectorAll('input[type="email"]').forEach(function (input) {
    input.autocomplete = "email";
  });
  document.querySelectorAll('.auth-card input[type="password"]').forEach(function (input) {
    input.autocomplete = location.pathname === "/login" ? "current-password" : "new-password";
  });
});
