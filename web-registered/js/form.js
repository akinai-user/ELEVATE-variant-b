"use strict";

(() => {
  const form = document.querySelector("#registration-form");
  const button = document.querySelector("#registration-confirm");
  const dialog = document.querySelector("#registration-confirmation");
  if (!form || !button || !dialog || typeof dialog.showModal !== "function") return;
  form.elements.family_name.autocomplete = "family-name";
  form.elements.given_name.autocomplete = "given-name";
  const year = form.elements.birth_year;
  const month = form.elements.birth_month;
  const day = form.elements.birth_day;
  const today = new Date();
  const addOptions = (select, start, end, step = 1) => {
    for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
      select.add(new Option(String(value), String(value)));
    }
  };
  addOptions(year, today.getFullYear(), today.getFullYear() - 120, -1);
  addOptions(month, 1, 12);
  const updateDays = () => {
    const previous = day.value;
    day.length = 1;
    const count = month.value ? new Date(Number(year.value) || 2000, Number(month.value), 0).getDate() : 31;
    addOptions(day, 1, count);
    day.value = previous;
    day.setCustomValidity("");
  };
  year.addEventListener("change", updateDays);
  month.addEventListener("change", updateDays);
  updateDays();
  const commute = [...form.querySelectorAll('[name="commute"]')];
  const validateCommute = () => commute[0].setCustomValidity(
    commute.some(input => input.checked) ? "" : "通勤手段を1つ以上選択してください。",
  );
  commute.forEach(input => input.addEventListener("change", validateCommute));
  const photo = form.elements.photo;
  const validatePhoto = () => {
    const file = photo.files[0];
    photo.setCustomValidity(!file ? "" : file.size > 5 * 1024 * 1024
      ? "顔写真は5MB以下のファイルを選択してください。"
      : !/\.(jpe?g|png|gif|heic)$/i.test(file.name)
        ? "JPEG、PNG、GIF、HEIC形式のファイルを選択してください。" : "");
  };
  photo.addEventListener("change", validatePhoto);
  const confirm = () => {
    validateCommute();
    validatePhoto();
    const birthday = year.value && month.value && day.value
      ? new Date(Number(year.value), Number(month.value) - 1, Number(day.value)) : null;
    day.setCustomValidity(birthday && birthday > today ? "生年月日は今日以前の日付を選択してください。" : "");
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const get = name => String(data.get(name) || "");
    const rows = [
      ["お仕事No.", get("job_number")],
      ["氏名（漢字）", get("family_name") + " " + get("given_name")],
      ["氏名（フリガナ）", get("family_kana") + " " + get("given_kana")],
      ["性別", get("gender")],
      ["生年月日", year.value + "年" + month.value + "月" + day.value + "日"],
      ["郵便番号", get("postal_code")],
      ["ご住所", get("address") + " " + get("building")],
      ["電話番号", get("phone")],
      ["メールアドレス", get("email")],
      ["顔写真", photo.files[0]?.name || "添付なし"],
      ["通勤手段", data.getAll("commute").join("、")],
      ["備考", get("notes")],
      ["個人情報の取り扱い", "同意する"],
    ];
    const summary = document.querySelector("#registration-summary");
    summary.replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value || "未入力";
      row.append(term, detail);
      return row;
    }));
    dialog.showModal();
    dialog.scrollTop = 0;
  };
  // 入力内容は保存・送信せず、ブラウザ内の確認にだけ使用する。
  form.addEventListener("submit", event => { event.preventDefault(); confirm(); });
  button.addEventListener("click", confirm);
  dialog.addEventListener("close", () => button.focus({ preventScroll: true }));
  button.disabled = false;
})();
