(() => {
  const form = document.getElementById('contact-form');
  const dialog = document.getElementById('contact-confirmation');
  const summary = document.getElementById('contact-summary');
  if (!form || !dialog || !summary) return;
  const email = form.elements.email;
  const confirmation = form.elements.email_chk;
  const checkEmail = () => confirmation.setCustomValidity(
    confirmation.value && email.value !== confirmation.value
      ? 'メールアドレスが一致していません。' : ''
  );
  email.addEventListener('input', checkEmail);
  confirmation.addEventListener('input', checkEmail);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    checkEmail();
    if (!form.reportValidity()) return;
    summary.replaceChildren();
    form.querySelectorAll('[data-label]').forEach((field) => {
      const term = document.createElement('dt');
      const value = document.createElement('dd');
      term.textContent = field.dataset.label;
      value.textContent = field.value;
      summary.append(term, value);
    });
    dialog.showModal();
  });
})();
