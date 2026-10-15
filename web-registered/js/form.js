"use strict";

(() => {
  const form = document.querySelector("#registration-form");
  if (!form) return;
  const confirmation = document.querySelector("#registration-confirmation");
  const summary = document.querySelector("#registration-summary");
  const send = document.querySelector("#registration-send");
  const edit = document.querySelector("#registration-edit");
  const status = document.querySelector("#registration-send-status");
  let token = "";
  let sending = false;
  let completed = false;
  const prepareSubmission = async () => {
    if (token || completed) return;
    send.disabled = true;
    status.textContent = "送信の準備を確認しています。";
    try {
      const response = await fetch(form.action, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error();
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error();
      token = result.token;
      send.disabled = false;
      status.textContent = "内容をご確認のうえ、送信してください。";
    } catch {
      status.textContent = "現在、このページからは送信できません。時間をおいて再度お試しいただくか、お電話でお問い合わせください。（TEL：0120-334-335）";
    }
  };
  // Validate all fields together before changing views, including custom rules.
  form.noValidate = true;
  form.elements.last_name.autocomplete = "family-name";
  form.elements.first_name.autocomplete = "given-name";
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
  const commute = [...form.querySelectorAll('[name="commute_method[]"]')];
  const validateCommute = () => commute[0].setCustomValidity(
    commute.some(input => input.checked) ? "" : "通勤手段を1つ以上選択してください。",
  );
  commute.forEach(input => input.addEventListener("change", validateCommute));
  const photo = form.elements.face_photo;
  const validatePhoto = () => {
    const file = photo.files[0];
    photo.setCustomValidity(!file ? "" : file.size > 5 * 1024 * 1024
      ? "顔写真は5MB以下のファイルを選択してください。"
      : !/\.(jpe?g|png|gif|heic)$/i.test(file.name)
        ? "JPEG、PNG、GIF、HEIC形式のファイルを選択してください。" : "");
  };
  photo.addEventListener("change", validatePhoto);
  const validateBirthday = () => {
    const birthday = year.value && month.value && day.value
      ? new Date(Number(year.value), Number(month.value) - 1, Number(day.value)) : null;
    day.setCustomValidity(birthday && birthday > today ? "生年月日は今日以前の日付を選択してください。" : "");
  };
  [year, month, day].forEach(input => input.addEventListener("change", validateBirthday));
  const showConfirmation = () => {
    const value = name => form.elements.namedItem(name).value;
    const entries = [
      ["お仕事No.", value("job_no")],
      ["氏名（漢字）", `${value("last_name")} ${value("first_name")}`],
      ["氏名（フリガナ）", `${value("last_name_kana")} ${value("first_name_kana")}`],
      ["性別", value("gender")],
      ["生年月日", `${year.value}年${month.value}月${day.value}日`],
      ["郵便番号", value("postal_code")],
      ["ご住所", `${value("address1")}\n${value("address2")}`],
      ["電話番号", value("phone")],
      ["メールアドレス", value("email")],
      ["顔写真の添付", photo.files[0]?.name],
      ["通勤手段", commute.filter(input => input.checked).map(input => input.value).join("、")],
      ["備考", value("remarks")],
      ["個人情報の取り扱い", "同意する"],
    ];
    summary.replaceChildren();
    entries.forEach(([label, content]) => {
      const row = document.createElement("div");
      row.className = "advance-form__row";
      const term = document.createElement("dt");
      term.className = "advance-form__label";
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = content || "未入力・未選択";
      row.append(term, description);
      summary.append(row);
    });
    form.hidden = true;
    confirmation.hidden = false;
    document.querySelector("#form-title").textContent = "Web登録内容の確認";
    document.querySelector("#confirmation-title").focus();
    prepareSubmission();
  };
  edit.addEventListener("click", () => {
    if (sending || completed) return;
    confirmation.hidden = true;
    form.hidden = false;
    document.querySelector("#form-title").textContent = "Web登録内容の入力";
    form.elements.last_name.focus();
  });
  send.addEventListener("click", async () => {
    if (sending || completed || !token) return;
    sending = true;
    send.disabled = true;
    edit.disabled = true;
    send.textContent = "送信しています…";
    status.textContent = "送信が完了するまで、この画面を閉じずにお待ちください。";
    try {
      const data = new FormData(form);
      data.set("csrf_token", token);
      const response = await fetch(form.action, {
        method: "POST", credentials: "same-origin", body: data,
        headers: { Accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        if (response.status === 403) token = "";
        throw new Error(result.message || "送信できませんでした。入力内容を確認し、再度お試しください。");
      }
      completed = true;
      confirmation.hidden = true;
      document.querySelector("#registration-complete").hidden = false;
      document.querySelector("#form-title").textContent = "Web登録の送信完了";
      form.reset();
      summary.replaceChildren();
      document.querySelector("#complete-title").focus();
    } catch (error) {
      status.textContent = error instanceof TypeError || error instanceof SyntaxError
        ? "送信結果を確認できませんでした。通信状態を確認して再度お試しください。重複送信を避けるため、同じ内容を保持したまま再試行してください。"
        : error.message;
    } finally {
      sending = false;
      edit.disabled = false;
      send.disabled = completed || !token;
      send.textContent = "この内容で送信する →";
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (completed || sending) return;
    validateCommute();
    validatePhoto();
    validateBirthday();
    if (form.reportValidity()) showConfirmation();
  });
})();
