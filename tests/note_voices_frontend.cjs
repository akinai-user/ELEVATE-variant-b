// Run the actual home script against a small DOM double; no external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/script.js'), 'utf8');

class Element {
  constructor(tag = 'div', className = '') {
    this.tagName = tag; this.className = className; this.children = []; this.dataset = {};
    this.attributes = {}; this.textContent = ''; this.complete = false;
    this.classList = {
      contains: (name) => this.className.split(' ').includes(name),
      add: (name) => { this.className += ` ${name}`; }, remove() {},
    };
  }
  append(...nodes) { nodes.forEach((node) => { node.parentElement = this; this.children.push(node); }); }
  replaceChildren(fragment) { this.children = fragment.children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
  matches() { return false; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  querySelectorAll(selector) {
    const results = [];
    const match = (node) => selector === '.voice-card img' ? node.tagName === 'img'
      : selector.startsWith('.') ? node.classList.contains(selector.slice(1))
      : selector === '[data-note-voices]' ? Boolean(node.dataset.noteEndpoint)
      : node.tagName === selector;
    for (const child of this.children) {
      if (match(child)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  cloneNode() {
    const clone = new Element(this.tagName, this.className);
    clone.append(...this.children.map((node) => node.cloneNode()));
    return clone;
  }
}

async function run(response) {
  const root = new Element();
  const container = new Element();
  container.dataset.noteEndpoint = 'commn/php/note-voices.php';
  const original = new Element('div', 'swiper interview-slider');
  const more = new Element('div', 'voices-more');
  more.append(new Element('a'));
  container.append(original, more); root.append(container);
  const document = {
    documentElement: root, body: new Element('body'), activeElement: null,
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: () => [], addEventListener() {},
    createElement: (tag) => new Element(tag), createDocumentFragment: () => new Element('fragment'),
  };
  let destroyed = 0;
  class Swiper {
    constructor(node, options) { node.swiper = this; this.params = options; this.events = {}; }
    on(name, callback) { this.events[name] = callback; }
    destroy() { destroyed++; this.events.destroy?.(); }
  }
  const window = {
    location: { protocol: 'https:' }, Swiper, setTimeout, clearTimeout, addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  vm.runInNewContext(source, {
    window, document, URL, AbortController,
    fetch: async (url, options) => {
      assert.equal(url, container.dataset.noteEndpoint);
      assert.equal(options.cache, 'no-store');
      if (response instanceof Error) throw response;
      return { ok: response !== null, headers: { get: () => 'application/json' }, json: async () => response };
    },
  });
  await new Promise(setImmediate);
  return { container, original, destroyed };
}

(async () => {
  const card = {
    url: 'https://note.com/elevate/n/n123', title: '<script>記事</script>',
    image: 'javascript:alert(1)', date: '2026-10-20',
  };
  let result = await run({ cards: [card, { ...card, url: 'https://note.com/elevate/n/n456' }], destination: 'https://note.com/elevate' });
  assert.equal(result.destroyed, 1);
  assert.equal(result.container.querySelectorAll('.swiper-slide').length, 2);
  assert.equal(result.container.querySelector('h3').textContent, card.title);
  assert.equal(result.container.querySelector('img').src, 'images/common/logo.png');
  assert.equal(result.container.querySelector('time').dateTime, '2026-10-20');
  assert.equal(result.container.querySelector('a').rel, 'noopener noreferrer');
  result = await run({ cards: [], destination: 'https://note.com/elevate' });
  assert.ok(result.container.querySelector('.voices-empty'));
  assert.equal(result.container.querySelectorAll('.swiper-slide').length, 0);
  for (const response of [null, new Error('offline'), { cards: [{ ...card, url: 'javascript:alert(1)' }], destination: 'https://note.com/elevate' }]) {
    result = await run(response);
    assert.equal(result.container.children[0], result.original);
    assert.equal(result.destroyed, 0);
  }
  console.log('PASS: dynamic cards, safe text and URLs, empty feed, failed fetch, slider recreation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
