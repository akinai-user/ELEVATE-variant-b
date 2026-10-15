// Mock network and DOM boundaries to verify all three flows without sending mail.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const schemas = {
  contact: ['name', 'company', 'email', 'email_chk', 'tel', 'message', 'policy_chk'],
  advance: ['name', 'id', 'message', 'days', 'email', 'attachment1', 'attachment2', 'checkbox01', 'policy_chk'],
  transportation: ['name', 'id', 'message', 'policy_chk'],
};
const fixture = (kind, available = true) => {
  const element = () => ({ handlers: {}, hidden: true, disabled: true, children: [],
    addEventListener(name, handler) { this.handlers[name] = handler; }, append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; }, focus() {}, setCustomValidity(value) { this.error = value; } });
  const fields = Object.fromEntries(schemas[kind].map(name => [name, Object.assign(element(), {
    name, type: name.startsWith('attachment') ? 'file' : ['policy_chk', 'checkbox01'].includes(name) ? 'checkbox' : 'text',
    value: name === 'days' ? '2' : name.startsWith('email') ? 'test@example.invalid' : '<script>literal</script>',
    checked: true, required: !name.startsWith('attachment'), files: [{ name: 'proof.pdf', size: 100 }],
  })]));
  fields.namedItem = name => fields[name];
  const review = element();
  const form = Object.assign(element(), { dataset: { mailForm: kind }, elements: fields, action: 'http://localhost/submit.php',
    querySelector: () => review, reportValidity: () => schemas[kind].every(name => !fields[name].error), reset() { this.wasReset = true; } });
  const nodes = Object.fromEntries(['[data-confirm]', '[data-complete]', 'dl', '[role=status]', '[data-edit]', '[data-send]'].map(key => [key, element()]));
  nodes['[data-confirm]'].querySelector = nodes['[data-complete]'].querySelector = () => element();
  const views = element(); views.querySelector = key => nodes[key];
  const container = { querySelector: () => form, append() {} };
  const document = { querySelectorAll: () => [container], createElement: () => element() };
  let first = true;
  document.createElement = () => { if (first) { first = false; return views; } return element(); };
  const queue = [];
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../commn/js/mail-form.js'), 'utf8'), {
    document, AbortSignal, FormData: class { set() {} },
    fetch: async (url, options) => {
      calls.push(options);
      const result = options.method === 'POST' ? queue.shift() : { status: available ? 200 : 503, body: available ? { token: 'token' } : {} };
      return { ok: result.status === 200, status: result.status, headers: { get: () => 'application/json' }, json: async () => result.body };
    },
  });
  return { fields, form, nodes, queue, calls, review };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const submit = form => form.handlers.submit({ preventDefault() {} });

(async () => {
  for (const kind of Object.keys(schemas)) {
    const { fields, form, nodes, queue, calls, review } = fixture(kind);
    assert.equal(review.disabled, false);
    if (kind === 'contact') {
      fields.email_chk.value = 'wrong@example.invalid'; submit(form);
      assert(fields.email_chk.error); assert.equal(calls.length, 0);
      fields.email_chk.value = fields.email.value;
    }
    if (kind === 'advance') {
      fields.attachment2.files[0].size = 6 * 1024 * 1024;
      submit(form); assert(fields.attachment2.error); assert.equal(calls.length, 0);
      fields.attachment2.files[0].size = 100;
    }
    submit(form); await tick();
    assert(form.hidden); assert.equal(nodes['[data-confirm]'].hidden, false);
    assert.equal(nodes['[data-send]'].disabled, false);
    assert.equal(nodes.dl.children.length, schemas[kind].length);
    assert.equal(nodes.dl.children[0].children[1].textContent, '<script>literal</script>');
    const file = fields.attachment1?.files[0];
    nodes['[data-edit]'].handlers.click(); assert.equal(form.hidden, false);
    if (file) assert.equal(fields.attachment1.files[0], file);
    submit(form); await tick();
    queue.push({ status: 502, body: { message: '送信失敗テスト' } });
    await nodes['[data-send]'].handlers.click();
    assert.equal(nodes['[role=status]'].textContent, '送信失敗テスト');
    assert.equal(form.wasReset, undefined); assert.equal(nodes['[data-complete]'].hidden, true);
    queue.push({ status: 200, body: { ok: true } });
    const sending = nodes['[data-send]'].handlers.click();
    await nodes['[data-send]'].handlers.click(); await sending;
    assert.equal(calls.filter(call => call.method === 'POST').length, 2);
    assert(form.wasReset); assert.equal(nodes['[data-complete]'].hidden, false);
    assert.equal(nodes['[data-confirm]'].hidden, true);
    const unavailable = fixture(kind, false);
    submit(unavailable.form); await tick();
    assert(unavailable.nodes['[data-send]'].disabled);
    assert.equal(unavailable.nodes['[data-complete]'].hidden, true);
  }
  console.log('PASS: contact, advance and transportation confirmation/edit/files/errors/completion/static preview');
})().catch(error => { console.error(error); process.exit(1); });
