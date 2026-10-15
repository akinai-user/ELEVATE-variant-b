// State transitions only; fetch is replaced so this test never sends form data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

function fixture(ready = true) {
  const field = (value = '') => ({ value, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; },
    setCustomValidity(value) { this.error = value; }, focus() { this.focused = true; }, add() {} });
  const names = ['last_name', 'first_name', 'last_name_kana', 'first_name_kana', 'birth_year',
    'birth_month', 'birth_day', 'face_photo', 'job_no', 'gender', 'postal_code', 'address1',
    'address2', 'phone', 'email', 'remarks'];
  const elements = Object.fromEntries(names.map(name => [name, field()]));
  elements.namedItem = name => elements[name];
  const photo = { name: 'face.jpg', size: 10 };
  elements.face_photo.files = [photo];
  const commute = [Object.assign(field('徒歩'), { checked: true })];
  const form = Object.assign(field(), { action: 'http://localhost/submit.php', elements,
    reportValidity: () => true, reset() { this.wasReset = true; }, querySelectorAll: () => commute });
  const summary = { rows: [], replaceChildren() { this.rows = []; }, append(row) { this.rows.push(row); } };
  const nodes = { '#registration-form': form, '#registration-summary': summary };
  for (const id of ['registration-confirmation', 'registration-send', 'registration-edit',
    'registration-send-status', 'form-title', 'confirmation-title', 'registration-complete', 'complete-title']) {
    nodes['#' + id] = Object.assign(field(), { hidden: true, disabled: true });
  }
  const responses = [];
  const calls = [];
  const document = { querySelector: name => nodes[name], createElement: () => ({ append(...children) { this.children = children; } }) };
  const context = { document, Date, Option: function () {}, AbortSignal,
    FormData: class { constructor(form) { this.form = form; } set() {} },
    fetch: async (url, options) => {
      calls.push(options);
      const result = options.method === 'POST' ? responses.shift() : { status: ready ? 200 : 503, body: ready ? { token: 'token' } : {} };
      return { ok: result.status === 200, status: result.status,
        headers: { get: () => 'application/json' }, json: async () => result.body };
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web-registered/js/form.js'), 'utf8'), context);
  elements.last_name.value = '<script>alert(1)</script>';
  elements.birth_year.value = '2000'; elements.birth_month.value = '1'; elements.birth_day.value = '1';
  return { form, elements, nodes, summary, responses, calls, photo };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const submit = form => form.handlers.submit({ preventDefault() {} });

(async () => {
  const { form, elements, nodes, summary, responses, calls, photo } = fixture();
  submit(form); await tick();
  assert(form.hidden);
  assert.equal(nodes['#registration-confirmation'].hidden, false);
  assert.equal(nodes['#registration-send'].disabled, false);
  assert.equal(summary.rows.length, 13);
  assert.equal(summary.rows[1].children[1].textContent, '<script>alert(1)</script> ');
  nodes['#registration-edit'].handlers.click();
  assert.equal(form.hidden, false);
  assert.equal(elements.face_photo.files[0], photo);
  form.reportValidity = () => false;
  submit(form); assert.equal(nodes['#registration-confirmation'].hidden, true);
  form.reportValidity = () => true;
  submit(form); await tick();
  responses.push({ status: 502, body: { message: '送信失敗テスト' } });
  await nodes['#registration-send'].handlers.click();
  assert.equal(nodes['#registration-send-status'].textContent, '送信失敗テスト');
  assert.equal(nodes['#registration-confirmation'].hidden, false);
  assert.equal(elements.face_photo.files[0], photo);
  assert.equal(form.wasReset, undefined);
  responses.push({ status: 200, body: { ok: true } });
  const first = nodes['#registration-send'].handlers.click();
  await nodes['#registration-send'].handlers.click(); // Double click while in flight.
  await first;
  assert.equal(calls.filter(call => call.method === 'POST').length, 2);
  assert.equal(nodes['#registration-complete'].hidden, false);
  assert.equal(nodes['#registration-confirmation'].hidden, true);
  assert(form.wasReset);
  assert.equal(summary.rows.length, 0);
  const unavailable = fixture(false);
  submit(unavailable.form); await tick();
  assert(unavailable.nodes['#registration-send'].disabled);
  assert.equal(unavailable.nodes['#registration-complete'].hidden, true);
  console.log('PASS: confirmation, edit/file retention, validation, safe text, error, completion, double click, unavailable backend');
})().catch(error => { console.error(error); process.exit(1); });
