// ==UserScript==
// @name         Twitch chat cleaner
// @namespace    https://filipesabella.com
// @version      0.2
// @description  Twitch chat cleaner
// @author       You
// @match        https://www.twitch.tv/*
// ==/UserScript==

const defaults = {
  spammy: true,
  emojiOnly: true,
  allCaps: true,
  // if a message contains any of these, it's discarded
  garbageWords: [
    'lulw',
    'you can use quotes',
  ],
  maxWords: 40,
  tooManyDuplicatesThreshold: 1.7,
  tooManyEmojiThreshold: 3,
};

function isGarbage(options, s) {
  const trimmed = s.trim();
  const upperCased = trimmed.toUpperCase();
  const words = trimmed.split(' ').filter(s => s !== '');

  const isUpperCase = s => s === upperCased;
  const containsGarbageWord = s => options
    .garbageWords.filter(g => upperCased.includes(g)).length > 0;
  const isMessageTooLong = s => words.length > options.maxWords;
  const isDuplicatedPhrase = words =>
    words.length / new Set(words).size >= options.tooManyDuplicatesThreshold;

  return (options.emojiOnly && trimmed === '') || // covers de emoji-only
    (options.allCaps && isUpperCase(trimmed)) ||
    containsGarbageWord(trimmed) ||
    isMessageTooLong(trimmed) ||
    (options.spammy && isDuplicatedPhrase(words));
}

function handler(event) {
  const options = readOptions();

  const messageContainer = event.target;
  if (messageContainer.className !== 'chat-line__message') return;

  const text = Array.from(messageContainer.querySelectorAll('.text-fragment'))
    .map(e => e.innerHTML).join(' ').trim();

  const tooManyEmoji = () => options.spammy && messageContainer
    .querySelectorAll('.chat-line__message--emote-button')
    .length >= options.tooManyEmojiThreshold;

  if (tooManyEmoji() || isGarbage(options, text)) {
    remove(messageContainer);

    if (text !== '') {
      blockedMessages.push(text);
      blockedMessages = blockedMessages.slice(-30); // only last 30 messages
    }
  }
}

let counter = 0;
let blockedMessages = [];

function remove(messageContainer) {
  // removing the node causes issues with other twitch features
  // messageContainer.remove();
  messageContainer.style.display = 'none';

  const container = document.querySelector('.chat-input__buttons-container');

  if (!container) return;

  let counterContainer = document.getElementById('counter-container');
  if (!counterContainer) {
    counterContainer = document.createElement('div');
    counterContainer.id = 'counter-container';
    counterContainer.style.cursor = 'pointer';
    counterContainer.onclick = () => {
      console.log(blockedMessages.join('\n'));
      showOptions();
    };
    container.childNodes[1]
      .insertBefore(counterContainer, container.querySelector('.tw-mg-r-1'));
  }

  counterContainer.innerHTML = '🚯' + ++counter;
}

function listenToMessages() {
  const c = document.querySelector('.chat-scrollable-area__message-container');
  if (!c) {
    window.setTimeout(listenToMessages, 500);
    return;
  }
  c.removeEventListener('DOMNodeInserted', handler);
  c.addEventListener('DOMNodeInserted', handler, false);
}

function showOptions() {
  const options = readOptions();

  let optionsContainer = document.getElementById('options-container');
  if (!optionsContainer) {
    addStyle(`
      #options-container {
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 30em;
        height: 40.5em;
        background: #abcdef;
        z-index: 99999;
        padding: 1em;
      }

      #options-container .close-button {
        position: absolute;
        top: .5em;
        right: 1em;
        cursor: pointer;
      }

      #options-container label {
        display: inline-block;
        width: 15em;
      }

      #options-container label span {
        text-decoration: underline;
      }

      #options-container > div {
        margin-bottom: 1em;
      }

      #options-container input[type=number] {
        width: 6em;
      }

      #options-container textarea {
        width: 100%;
        height: 17em;
        font-family: inherit;
        line-height: 1.5em;
        padding: .5em;
      }

      #options-container .button {
        text-align: right;
      }

      #options-container .button input {
        padding: 3px;
      }
    `);

    const garbage = options.garbageWords.join(' ');

    document.body.insertAdjacentHTML('beforeend',
      `<div id="options-container">
        <div class="close-button"
          id="twitchCleaner__closeButton">X</div>
        <div>
          <label>Block
            <span title="Overall spam with duplicated text or too many emoji">
              spammy messages
            </span>
          </label>
          <input type="checkbox" id="twitchCleaner__spammy"
            ${options.spammy && 'checked'}></input>
        </div>
        <div>
          <label>Block emoji only</label>
          <input type="checkbox" id="twitchCleaner__emojiOnly"
            ${options.emojiOnly && 'checked'}></input>
        </div>
        <div>
          <label>Block all caps</label>
          <input type="checkbox" id="twitchCleaner__allCaps"
            ${options.allCaps && 'checked'}></input>
        </div>
        <div>
          <label>Max words per message</label>
          <input type="number" id="twitchCleaner__maxWords"
            value="${options.maxWords}"></input>
        </div>
        <div>
          <p>Block messages containing any of the following words</p>
          <textarea id="twitchCleaner__garbageWords">${garbage}</textarea>
        </div>
        <div class="button">
          <input type="button"
            id="twitchCleaner__save"
            value="Save"></input>
        </div>
      </div>`);

    optionsContainer = document.getElementById('options-container');

    const {
      top,
      left
    } = document.getElementById('counter-container').getBoundingClientRect();

    const {
      width,
      height,
    } = optionsContainer.getBoundingClientRect();

    optionsContainer.style.left = left - width + 'px';
    optionsContainer.style.top = top - height + 'px';

    document.getElementById('twitchCleaner__save').onclick = () => {
      const emojiOnly = document
        .getElementById('twitchCleaner__emojiOnly').checked;
      const allCaps = document
        .getElementById('twitchCleaner__allCaps').checked;
      const maxWords = document
        .getElementById('twitchCleaner__maxWords').value;
      const garbageWords = document
        .getElementById('twitchCleaner__garbageWords')
        .value;

      storeOptions({
        emojiOnly,
        allCaps,
        maxWords,
        garbageWords,
      });
    };

    document.getElementById('twitchCleaner__closeButton').onclick = () => {
      optionsContainer.style.display = 'none';
    };
  } else {
    optionsContainer.style.display = optionsContainer
      .style.display === 'block' ?
      'none' :
      'block';
  }
}

window.onload = listenToMessages;

// replace the built-in functions. apparently
// it's the only way to listen to these events
history.pushState = (f => function() {
  var ret = f.apply(this, arguments);
  window.setTimeout(listenToMessages, 1500);
  return ret;
})(history.pushState);

history.replaceState = (f => function() {
  var ret = f.apply(this, arguments);
  window.setTimeout(listenToMessages, 1500);
  return ret;
})(history.replaceState);

window.addEventListener('popstate', () => {
  window.setTimeout(listenToMessages, 1500);
});

function addStyle(css) {
  var style = document.createElement('style');
  style.type = 'text/css';
  style.textContent = css;
  document.head.appendChild(style);
}

function readOptions() {
  try {
    const s = localStorage.getItem('twitch-cleaner-options');
    const options = s ? JSON.parse(s) : defaults;
    const merged = {
      ...defaults,
      ...options,
    };

    // puts quotes back into multi-word items. e.g., the array:
    // ['aaa', 'hello there', 'bbb']
    // returns the string:
    // aaa "hello there" bbb
    merged.garbageWords = merged.garbageWords.map(w =>
      w.includes(' ') ? `"${w}"` : w);

    return merged;
  } catch (e) {
    console.error(e);
    return defaults;
  }
}

function storeOptions(options) {
  // split into array and remove possible double-quotes. e.g., the string:
  // aaa "hello there" bbb
  // returns the array:
  // ['aaa', 'hello there', 'bbb']
  options.garbageWords = options.garbageWords
    .match(/\w+|"[^"]+"/g)
    .map(s => s.replace(/"/g, ''));

  localStorage.setItem(
    'twitch-cleaner-options',
    JSON.stringify(options));
}
