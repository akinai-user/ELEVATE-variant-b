"use strict";

(() => {
  const definitions = {
    contact: { title: "お問い合わせ", fields: { name: "ご担当者名", company: "企業名", email: "メールアドレス", email_chk: "確認用メールアドレス", tel: "電話番号", message: "お問い合わせ内容", policy_chk: "個人情報の取り扱い" } },
    advance: { title: "前払い申請", fields: { name: "氏名", id: "ID", message: "日付・勤務先", days: "何日分", email: "メールアドレス", attachment1: "勤務証明・公共機関証明（1）", attachment2: "勤務証明・公共機関証明（2）", checkbox01: "給与前払いの受け取り方法の確認", policy_chk: "個人情報の取り扱い" } },
    transportation: { title: "交通費申請", fields: { name: "氏名", id: "ID", message: "日付・就業先・通勤方法", policy_chk: "個人情報の取り扱い" } },
  };
  document.querySelectorAll("[data-mail-flow]").forEach(container => {
    const form = container.querySelector("form[data-mail-form]");
    const definition = definitions[form?.dataset.mailForm];
    if (!definition) return;
    const prefix = form.dataset.mailForm;
    const views = document.createElement("div");
    views.className = "mail-flow__views";
    // Only fixed markup and our own form definitions are interpolated here.
    views.innerHTML = `
      <section data-confirm hidden aria-labelledby="${prefix}-confirm-title">
        <h2 id="${prefix}-confirm-title" tabindex="-1">${definition.title}内容の確認</h2>
        <p>入力内容をご確認ください。修正する場合は「入力内容を修正する」からお戻りください。</p>
        <dl class="mail-flow__summary"></dl>
        <p class="mail-flow__status" role="status" id="${prefix}-send-status"></p>
        <div class="mail-flow__actions">
          <button type="button" data-edit class="mail-flow__back hover-fade">入力内容を修正する</button>
          <button type="button" data-send class="mail-flow__send hover-fade" disabled aria-describedby="${prefix}-send-status">この内容で送信する →</button>
        </div>
      </section>
      <section data-complete hidden aria-labelledby="${prefix}-complete-title">
        <h2 id="${prefix}-complete-title" tabindex="-1">送信が完了しました</h2>
        <p>${definition.title}をいただき、ありがとうございます。<br>内容を確認のうえ、担当者より対応いたします。</p>
        <div class="mail-flow__actions"><a class="mail-flow__back hover-fade" href="../index.html">トップページへ戻る</a></div>
      </section>`;
    container.append(views);
    const confirm = views.querySelector("[data-confirm]");
    const complete = views.querySelector("[data-complete]");
    const summary = views.querySelector("dl");
    const status = views.querySelector("[role=status]");
    const edit = views.querySelector("[data-edit]");
    const send = views.querySelector("[data-send]");
    const review = form.querySelector('[type="submit"]');
    const fields = Object.entries(definition.fields).map(([name, label]) => [form.elements.namedItem(name), label]);
    let token = "";
    let preparing = false;
    let sending = false;
    let finished = false;
    form.noValidate = true;

    const validate = () => {
      fields.forEach(([input]) => {
        input.setCustomValidity("");
        if (input.type === "file") {
          const file = input.files[0];
          if (file?.size > 5 * 1024 * 1024) input.setCustomValidity("添付ファイルは1点につき5MB以下にしてください。");
          else if (file && !/\.(jpe?g|png|pdf|heic)$/i.test(file.name)) input.setCustomValidity("JPEG、PNG、PDF、HEIC形式のファイルを選択してください。");
        } else if (input.required && input.type !== "checkbox" && !input.value.trim()) {
          input.setCustomValidity("この項目を入力してください。");
        }
      });
      if (prefix === "contact" && form.elements.email.value !== form.elements.email_chk.value) {
        form.elements.email_chk.setCustomValidity("メールアドレスが一致していません。");
      }
    };
    fields.forEach(([input]) => {
      input.addEventListener("input", validate);
      input.addEventListener("change", validate);
    });
    const prepare = async () => {
      if (token || preparing || finished) return;
      preparing = true;
      send.disabled = true;
      status.textContent = "送信の準備を確認しています。";
      try {
        const response = await fetch(form.action, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error();
        const result = await response.json();
        if (!response.ok || !result.token) throw new Error();
        token = result.token;
        send.disabled = false;
        status.textContent = "内容をご確認のうえ、送信してください。";
      } catch {
        status.textContent = "現在、このページからは送信できません。時間をおいて再度お試しいただくか、お電話でお問い合わせください。（TEL：0120-334-335）";
      } finally {
        preparing = false;
      }
    };
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (sending || finished) return;
      validate();
      if (!form.reportValidity()) return;
      summary.replaceChildren();
      fields.forEach(([input, label]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = input.type === "file" ? input.files[0]?.name || "添付なし"
          : input.type === "checkbox" ? (input.checked ? "同意する" : "未選択")
            : input.value.trim() + (input.name === "days" ? "日分" : "");
        row.append(term, description);
        summary.append(row);
      });
      form.hidden = true;
      confirm.hidden = false;
      confirm.querySelector("h2").focus();
      prepare();
    });
    edit.addEventListener("click", () => {
      if (sending || finished) return;
      confirm.hidden = true;
      form.hidden = false;
      fields[0][0].focus();
    });
    send.addEventListener("click", async () => {
      if (!token || sending || finished) return;
      sending = true;
      send.disabled = edit.disabled = true;
      send.textContent = "送信しています…";
      status.textContent = "送信が完了するまで、この画面を閉じずにお待ちください。";
      try {
        const data = new FormData(form);
        data.set("csrf_token", token);
        const response = await fetch(form.action, { method: "POST", credentials: "same-origin", body: data, headers: { Accept: "application/json" } });
        const result = await response.json();
        if (!response.ok || result.ok !== true) {
          if (response.status === 403) token = "";
          throw new Error(result.message || "送信できませんでした。入力内容を確認して再度お試しください。");
        }
        finished = true;
        confirm.hidden = true;
        complete.hidden = false;
        summary.replaceChildren();
        form.reset();
        complete.querySelector("h2").focus();
      } catch (error) {
        status.textContent = error instanceof TypeError || error instanceof SyntaxError
          ? "送信結果を確認できませんでした。通信状態を確認して再度お試しください。重複送信を避けるため、同じ内容を保持したまま再試行してください。" : error.message;
      } finally {
        sending = false;
        edit.disabled = false;
        send.disabled = finished || !token;
        send.textContent = "この内容で送信する →";
      }
    });
    review.disabled = false;
  });
})();
