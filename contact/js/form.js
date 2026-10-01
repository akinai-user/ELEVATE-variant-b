(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const email = form.elements.email;
  const confirmation = form.elements.email_chk;
  const checkEmail = () => confirmation.setCustomValidity(
    confirmation.value && email.value !== confirmation.value
      ? 'メールアドレスが一致していません。' : ''
  );
  email.addEventListener('input', checkEmail);
  confirmation.addEventListener('input', checkEmail);
  form.addEventListener('submit', (event) => {
    checkEmail();
    if (!form.reportValidity()) event.preventDefault();
  });
})();
