"use strict";

(() => {
  const form = document.querySelector("#registration-form");
  if (!form) return;
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
  form.addEventListener("submit", event => {
    validateCommute();
    validatePhoto();
    const birthday = year.value && month.value && day.value
      ? new Date(Number(year.value), Number(month.value) - 1, Number(day.value)) : null;
    day.setCustomValidity(birthday && birthday > today ? "生年月日は今日以前の日付を選択してください。" : "");
    if (!form.reportValidity()) event.preventDefault();
  });
})();
