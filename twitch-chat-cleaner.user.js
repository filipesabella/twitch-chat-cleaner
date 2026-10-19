// ==UserScript==
// @name         Twitch chat cleaner
// @namespace    https://filipesabella.com
// @version      0.5
// @description  Add spam controls and filters to twitch chat.
// @author       Filipe Sabella
// @license      MIT
// @match        https://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

const defaults = {
  disableAll: false,
  spammy: true,
  emojiOnly: true,
  allCaps: true,
  keepImportant: true,
  hideAnnouncements: false,
  freeFilters: [
    'lulw',
    'you can use quotes',
    '/.*and regexes.*/i',
  ],
  maxWords: 40,
  minWords: 1,
  tooManyDuplicatesThreshold: 1.7,
  tooManyEmojiThreshold: 3,
  allowWords: [],
};

let options = defaults;
let filters = { free: [], allow: null };
let counter = 0;

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compileFilter(filter) {
  try {
    const regex = filter.match(/^\/(.+)\/([a-z]*)$/);
    return regex
      // stateful flags would make `test` skip matches on subsequent calls
      ? new RegExp(regex[1], regex[2].replace(/[gy]/g, ''))
      : new RegExp(escapeRegex(filter), 'i');
  } catch (e) {
    console.error(`Ignoring invalid filter: ${filter}`, e);
    return null;
  }
}

function compileFilters(options) {
  return {
    free: options.freeFilters.map(compileFilter).filter(Boolean),
    allow: options.allowWords.length > 0
      ? new RegExp(options.allowWords.map(escapeRegex).join('|'), 'i')
      : null,
  };
}

function isGarbage(options, filters, s) {
  const trimmed = s.trim();
  const words = trimmed.split(' ').filter(s => s !== '');

  // requiring a lowercase variant skips digits, symbols and caseless scripts
  const isUpperCase = s => s !== s.toLowerCase() && s === s.toUpperCase();

  const filteredOut = _ => filters.free.find(filter => filter.test(trimmed));

  const isMessageTooLong = _ => words.length > options.maxWords;
  const isMessageTooShort = _ => words.length < options.minWords;
  const isDuplicatedPhrase = words =>
    words.length / new Set(words).size >= options.tooManyDuplicatesThreshold;

  if (trimmed === '') {
    return options.emojiOnly ? [true, 'emote only'] : [false, ''];
  } else if (options.allCaps && isUpperCase(trimmed)) {
    return [true, 'all caps'];
  } else if (isMessageTooLong(trimmed)) {
    return [true, 'too long'];
  } else if (isMessageTooShort(trimmed)) {
    return [true, 'too short'];
  } else if (options.spammy && isDuplicatedPhrase(words)) {
    return [true, 'spammy'];
  } else {
    const filter = filteredOut() || false;
    if (filter) {
      return [true, filter.toString()];
    } else {
      return [false, ''];
    }
  }
}

const messageText = messageContainer =>
  Array.from(messageContainer.querySelectorAll('.text-fragment'))
    .map(e => e.textContent).join(' ').trim();

// badge image ids don't depend on the user's language, unlike the alt text
const importantBadgeIds = [
  '5527c58c-fb7d-422d-b71b-f309dcb85cc1', // broadcaster
  '3267646d-33f0-4b17-b3df-f923a41db1d0', // moderator
  'b817aba4-fad8-49e2-b88a-7cc744dfa6ec', // vip
];

const isImportantBadge = badge =>
  importantBadgeIds.some(id => badge.src.includes(`/${id}/`))
  || /^(broadcaster|moderator|lead moderator|vip)( badge)?$/i.test(badge.alt);

const isImportant = messageContainer => Array
  .from(messageContainer.querySelectorAll('img.chat-badge'))
  .some(isImportantBadge);

// returns why the message should be hidden, or null to show it
function filterReason(options, filters, messageContainer, text) {
  if (options.disableAll) return null;

  if (filters.allow?.test(text)) return null;

  // checked before important messages, since only mods can announce
  if (messageContainer.matches(announcementSelector)) {
    return options.hideAnnouncements ? 'announcement' : null;
  }

  if (options.keepImportant && isImportant(messageContainer)) return null;

  const tooManyEmoji = () => options.spammy && messageContainer
    .querySelectorAll('.chat-line__message--emote-button')
    .length >= options.tooManyEmojiThreshold;

  if (tooManyEmoji()) return 'too many emotes';

  const [garbage, reason] = isGarbage(options, filters, text);
  return garbage ? reason : null;
}

// also shows messages that no longer match, so it can be re-run on
// visible messages when options change
function handler(messageContainer) {
  const text = messageText(messageContainer);
  const reason = filterReason(options, filters, messageContainer, text);
  const wasHidden = 'cleanerHidden' in messageContainer.dataset;

  if (reason && !wasHidden) {
    // removing the node causes issues with other twitch features
    messageContainer.dataset.cleanerHidden = reason;
    messageContainer.style.display = 'none';
    updateCounter(1);
    console.log(`Filtered message: "${text}". Reason: ${reason}.`);
  } else if (!reason && wasHidden) {
    delete messageContainer.dataset.cleanerHidden;
    messageContainer.style.display = '';
    updateCounter(-1);
  }
}

function updateCounter(delta) {
  counter += delta;
  const counterContainer = document.getElementById('counter-container');
  if (counterContainer) counterContainer.innerHTML = '🚯 ' + counter;
}

const refilter = () => new Set(Array
  .from(observedContainer?.querySelectorAll(messageSelector) ?? [])
  .map(toMessage))
  .forEach(handler);

// announcements wrap the message with a header, so the whole announcement is
// treated as the message, otherwise hiding it would leave the header behind
const announcementSelector = '.announcement-line';
const messageSelector = `${announcementSelector}, .chat-line__message`;

const toMessage = el => el.closest(announcementSelector) ?? el;

// added nodes can be text nodes, or the message line itself
const findMessage = node => !(node instanceof Element)
  ? null
  : node.matches(messageSelector)
    ? toMessage(node)
    : node.querySelector(messageSelector);

let observer = null;
let observedContainer = null;

function listenToMessages() {
  const messageContainer = document
    .querySelector('.chat-scrollable-area__message-container');

  // twitch can swap the chat container without re-rendering the chat input
  if (messageContainer && messageContainer !== observedContainer) {
    readOptions();

    observer?.disconnect();
    observer = new MutationObserver(mutationList => mutationList
      .flatMap(mutation => Array.from(mutation.addedNodes))
      .map(findMessage)
      .filter(Boolean)
      .forEach(handler));

    observer.observe(messageContainer, {
      attributes: false,
      childList: true,
      subtree: true
    });
    observedContainer = messageContainer;
  }

  if (!document.getElementById('counter-container')) {
    const container = document.querySelector('.chat-input__buttons-container');
    if (!container?.childNodes[1]) return;

    const counterContainer = document.createElement('div');
    counterContainer.id = 'counter-container';
    counterContainer.style.cursor = 'pointer';
    counterContainer.style.userSelect = 'none';
    counterContainer.style.fontFamily = 'monospace';
    counterContainer.innerHTML = '🚯  ';
    counterContainer.onclick = onCounterClick;
    container.childNodes[1].prepend(counterContainer);
  }
}

// a click count is used instead of a dblclick listener since the overlay
// covers the counter after the first click, and forwards clicks over it
function onCounterClick(e) {
  if (e.detail === 2) {
    showOptions({ resetPosition: true });
  } else if (e.detail < 2) {
    showOptions();
  }
}

const isOverCounter = e => {
  const counterContainer = document.getElementById('counter-container');
  if (!counterContainer) return false;
  const { left, right, top, bottom } = counterContainer.getBoundingClientRect();
  return e.clientX >= left && e.clientX <= right
    && e.clientY >= top && e.clientY <= bottom;
};

function showOptions({ resetPosition = false } = {}) {
  readOptions();

  let optionsContainer = document.getElementById('options-container');
  if (!optionsContainer) {
    addStyle(`
      #options-container {
        display: grid;
        grid-template-areas: "area";
        position: absolute;
        width: fit-content;
        min-width: 30em;
        z-index: 99999;
        background-color: #171717;
        color: #f0f0f0;
        border: 1px solid #f0f0f0;
        border-radius: 0 7px 7px 7px;
      }

      #options-container.hidden {
        display: none;
      }

      #options-container .resize-handle {
        grid-area: area;
        width: 100%;
        height: 100%;
        background-color: transparent;
        resize: both;
        overflow: auto;
        direction: rtl;
        transform: scaleY(-1);
        z-index: 99999;
        cursor: move;
      }

      #options-container .overlay {
        position: fixed;
        inset: 0;
        z-index: 99998;
      }

      #options-container .content {
        grid-area: area;
        display: flex;
        flex-direction: column;
        margin: 1.5em;
        gap: 1em;
        z-index: 99999;
        cursor: move;
      }

      #options-container label {
        display: inline-block;
        width: 15em;
      }

      #options-container label span,
      #options-container p span {
        cursor: help;
        text-decoration: underline;
      }

      #options-container input, #options-container textarea {
        background-color: #f0f0f0;
        color: #171717;
        border: 1px solid #171717;
        padding: .3em .5em;
        outline: 1px solid #f0f0f0;
        transition: all .15s;
        cursor: auto;
      }

      #options-container input:focus, #options-container textarea:focus {
        outline: 1px solid #1f69ff;
      }

      #options-container input[type=number] {
        width: 6em;
      }

      #options-container .textarea-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 15em;
      }

      #options-container textarea {
        width: 100%;
        flex: 1;
        font-family: inherit;
        line-height: 1.5em;
      }
    `);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="options-container">
        <div class="overlay"></div>
        <div class="resize-handle"></div>
        <div class="content">
          <div>
            <label>Block
              <span title="Overall spam with duplicated text or too many emotes">
                spammy messages
              </span>
            </label>
            <input class="input" type="checkbox" name="spammy">
          </div>
          <div>
            <label>Block emote only</label>
            <input class="input" type="checkbox" name="emojiOnly">
          </div>
          <div>
            <label>Block all caps</label>
            <input class="input" type="checkbox" name="allCaps">
          </div>
          <div>
            <label>Block announcements</label>
            <input class="input" type="checkbox" name="hideAnnouncements">
          </div>
          <div>
            <label>Max words per message</label>
            <input class="input" type="number" name="maxWords">
          </div>
          <div>
            <label>Min words per message</label>
            <input class="input" type="number" name="minWords">
          </div>
          <div class="textarea-container">
            <p>
              Block messages that match the
              <span class="help" title="You can:
    - Add words, it simply blocks messages that contain them, case insensitive
    - Add phrases by enclosing them in double-quotes, same as above
    - Add regular expressions by surrounding your expression with '/'">
                following
              </span>
            </p>
            <textarea
              class="input"
              name="freeFilters"></textarea>
          </div>
          <div>
            <label>
              ALLOW messages
              <span class="help" title="Useful for adding your name, for example.
  Precedes *all* other filters, case insensitive.">
                containing
              </span>
            </label>
            <input class="input" type="text" name="allowWords">
          </div>
          <div>
            <label>
              ALLOW
              <span class="help" title="Never hide messages from the broadcaster, moderators and VIPs.
  Announcements are still blocked if that option is on.">
                important messages
              </span>
            </label>
            <input class="input" type="checkbox" name="keepImportant">
          </div>
          <div>
            <label>Disable all filters</label>
            <input class="input" type="checkbox" name="disableAll">
          </div>
        </div>
      </div>
    `);

    optionsContainer = document.getElementById('options-container');

    const inputs = Array.from(optionsContainer.querySelectorAll('.input'));

    // set as properties so values aren't parsed as HTML
    const formValues = {
      ...options,
      freeFilters: serializeFilters(options.freeFilters),
      allowWords: options.allowWords.join(' '),
    };
    inputs.forEach(e => {
      if (e.type === 'checkbox') {
        e.checked = formValues[e.name];
      } else {
        e.value = formValues[e.name];
      }
    });

    optionsContainer.addEventListener('input', () => {
      storeOptions(readForm(inputs));
      readOptions();
      refilter();
    });

    optionsContainer.querySelector('.overlay')
      .addEventListener('click', e => {
        if (isOverCounter(e)) {
          onCounterClick(e);
        } else {
          hideOptions();
        }
      });

    makeDraggable(optionsContainer);
  } else if (resetPosition) {
    optionsContainer.classList.remove('hidden');
  } else {
    optionsContainer.classList.toggle('hidden');
  }

  if (resetPosition) localStorage.removeItem(positionKey);

  // re-applied on every open so the default follows the counter, and a
  // stored position is brought back into view if the window shrank
  if (!optionsContainer.classList.contains('hidden')) {
    placeOptions(optionsContainer, readPosition() ?? defaultPosition());
  }
}

const positionKey = 'twitch-cleaner-position';

function defaultPosition() {
  const {
    top,
    right,
  } = document.getElementById('counter-container').getBoundingClientRect();

  return {
    right: window.innerWidth - right,
    bottom: window.innerHeight - top,
  };
}

function readPosition() {
  try {
    const position = JSON.parse(localStorage.getItem(positionKey));
    return Number.isFinite(position?.right) && Number.isFinite(position?.bottom)
      ? position
      : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

const storePosition = position =>
  localStorage.setItem(positionKey, JSON.stringify(position));

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const currentPosition = optionsContainer => ({
  right: parseFloat(optionsContainer.style.right),
  bottom: parseFloat(optionsContainer.style.bottom),
});

// keeps the panel within the window
function placeOptions(optionsContainer, { right, bottom }) {
  const { width, height } = optionsContainer.getBoundingClientRect();
  optionsContainer.style.right =
    clamp(right, 0, window.innerWidth - width) + 'px';
  optionsContainer.style.bottom =
    clamp(bottom, 0, window.innerHeight - height) + 'px';
}

// drags from anywhere on the panel except the form elements, the overlay
// and the resize grip, which the handle's rtl + scaleY(-1) puts top-left
function makeDraggable(optionsContainer) {
  const handle = optionsContainer.querySelector('.resize-handle');

  const isOnResizeGrip = e => {
    const { left, top } = handle.getBoundingClientRect();
    const gripSize = parseFloat(getComputedStyle(handle).fontSize) * 1.5;
    return e.target === handle
      && e.clientX - left < gripSize
      && e.clientY - top < gripSize;
  };

  optionsContainer.addEventListener('mousedown', e => {
    if (e.button !== 0
      || e.target.closest('input, textarea, select, button, .overlay')
      || isOnResizeGrip(e)) return;

    // prevents text selection while dragging
    e.preventDefault();

    const start = { x: e.clientX, y: e.clientY };
    const startPosition = currentPosition(optionsContainer);
    let moved = false;

    // positioned by right/bottom so resizing keeps growing towards top-left
    const onMove = e => {
      moved = true;
      placeOptions(optionsContainer, {
        right: startPosition.right - (e.clientX - start.x),
        bottom: startPosition.bottom - (e.clientY - start.y),
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove);
      // plain clicks don't store, so the default keeps following the counter
      if (moved) storePosition(currentPosition(optionsContainer));
    }, { once: true });
  });
}

function hideOptions() {
  document.getElementById('options-container')?.classList.add('hidden');
}

document.addEventListener('keyup', e => {
  if (e.key === 'Escape') hideOptions();
});

window.setInterval(listenToMessages, 1000);

function addStyle(css) {
  var style = document.createElement('style');
  style.type = 'text/css';
  style.textContent = css;
  document.head.appendChild(style);
}

const toNumber = (value, fallback) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

// number inputs are stored as strings, and may be empty while being edited
const normalize = options => ({
  ...options,
  maxWords: toNumber(options.maxWords, defaults.maxWords),
  minWords: toNumber(options.minWords, defaults.minWords),
  tooManyDuplicatesThreshold: toNumber(
    options.tooManyDuplicatesThreshold, defaults.tooManyDuplicatesThreshold),
  tooManyEmojiThreshold: toNumber(
    options.tooManyEmojiThreshold, defaults.tooManyEmojiThreshold),
});

function readOptions() {
  try {
    const s = localStorage.getItem('twitch-cleaner-options');
    options = normalize({
      ...defaults,
      ...(s ? JSON.parse(s) : {}),
    });
  } catch (e) {
    console.error(e);
    options = defaults;
  }
  filters = compileFilters(options);
}

// puts quotes back into multi-word items. e.g., the array:
// ['aaa', 'hello there', 'bbb', '/a regex/']
// returns the string:
// aaa "hello there" bbb /a regex/
const serializeFilters = freeFilters => freeFilters
  .map(w => w.includes(' ') && w[0] !== '/' ? `"${w}"` : w)
  .join(' ');

// split into array and remove possible double-quotes. e.g., the string:
// aaa "hello there" bbb /a regex/
// returns the array:
// ['aaa', 'hello there', 'bbb', '/a regex/']
const parseFilters = s => (s.match(/"[^"]+"|\/[^\/]+\/[a-z]*|\S+/g) || [])
  .map(s => s.replace(/"/g, ''));

const readForm = inputs => Object.fromEntries(inputs.map(e =>
  [e.name, e.type === 'checkbox' ? e.checked : e.value]));

function storeOptions(form) {
  const options = {
    ...form,
    freeFilters: parseFilters(form.freeFilters),
    allowWords: form.allowWords.split(/\s+/).filter(s => s),
  };

  localStorage.setItem(
    'twitch-cleaner-options',
    JSON.stringify(options));
}
