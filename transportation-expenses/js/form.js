"use strict";

(() => {
  const form = document.querySelector("#transportation-form");
  const button = document.querySelector("#transportation-confirm");
  const dialog = document.querySelector("#transportation-confirmation");
  if (!form || !button || !dialog || typeof dialog.showModal !== "function") return;

  const confirm = () => {
    if (!form.reportValidity()) return;
    dialog.querySelectorAll("[data-confirm]").forEach((element) => {
      element.textContent = form.elements.namedItem(element.dataset.confirm).value;
    });
    dialog.showModal();
    dialog.scrollTop = 0;
  };

  // 送信先の接続までは、入力値をブラウザ内だけで確認する。
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    confirm();
  });
  button.addEventListener("click", confirm);
  button.disabled = false;
  dialog.addEventListener("close", () => {
    button.focus({ preventScroll: true });
  });
})();
