// ==UserScript==
// @name         Twitch chat cleaner
// @namespace    https://filipesabella.com
// @version      0.4
// @description  Twitch chat cleaner
// @author       Filipe Sabella
// @license      Unlicense
// @match        https://www.twitch.tv/*
// ==/UserScript==

const defaults = {
  disableAll: false,
  spammy: true,
  emojiOnly: true,
  allCaps: true,
  freeFilters: [
    'lulw',
    'you can use quotes',
    '/and regexes/',
  ],
  maxWords: 40,
  tooManyDuplicatesThreshold: 1.7,
  tooManyEmojiThreshold: 3,
};

let options = defaults;
let counter = 0;
let blockedMessages = [];

function isGarbage(options, s) {
  const trimmed = s.trim();
  const upperCased = trimmed.toUpperCase();
  const words = trimmed.split(' ').filter(s => s !== '');

  const isUpperCase = s => s === upperCased;

  const filteredOut = s => options
    .freeFilters.filter(freeFilter => {
      if (freeFilter[0] !== '/') {
        return upperCased.includes(freeFilter);
      } else {
        const [_, regex, flags] = freeFilter.match(/\/(.*)\/(.*)/);
        return new RegExp(regex, flags || 'i').test(upperCased);
      }
    }).length > 0;

  const isMessageTooLong = s => words.length > options.maxWords;
  const isDuplicatedPhrase = words =>
    words.length / new Set(words).size >= options.tooManyDuplicatesThreshold;

  return (options.emojiOnly && trimmed === '') ||
    (options.allCaps && isUpperCase(trimmed)) ||
    filteredOut(trimmed) ||
    isMessageTooLong(trimmed) ||
    (options.spammy && isDuplicatedPhrase(words));
}

function handler(event) {
  if (options.disableAll) return false;

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

function remove(messageContainer) {
  // removing the node causes issues with other twitch features
  // messageContainer.remove();
  messageContainer.style.display = 'none';
  document.getElementById('counter-container').innerHTML = '🚯' + ++counter;
}

function listenToMessages() {
  readOptions();

  document.onkeyup = e => {
    if (e.which === 27) { // escape
      hideOptions();
    }
  }

  const c = document.querySelector('.chat-scrollable-area__message-container');
  if (!c) {
    window.setTimeout(listenToMessages, 500);
    return;
  }

  c.removeEventListener('DOMNodeInserted', handler);
  c.addEventListener('DOMNodeInserted', handler, false);

  if (!document.getElementById('counter-container')) {
    const container = document.querySelector('.chat-input__buttons-container');
    if (!container) return;

    const counterContainer = document.createElement('div');
    counterContainer.id = 'counter-container';
    counterContainer.style.cursor = 'pointer';
    counterContainer.style.userSelect = 'none';
    counterContainer.innerHTML = '🚯';
    counterContainer.onclick = () => {
      console.log(blockedMessages.join('\n'));
      showOptions();
    };
    container.childNodes[1]
      .insertBefore(counterContainer, container.querySelector('.tw-mg-r-1'));
  }

}

function showOptions() {
  readOptions();

  let optionsContainer = document.getElementById('options-container');
  if (!optionsContainer) {
    addStyle(`
      #options-container {
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 30em;
        z-index: 99999;
        padding: 1.5em ;
        background-color: rgb(247, 247, 248);
        color: black;
        border: 1px solid black;
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

      #options-container label span,
      #options-container p span {
        cursor: help;
        text-decoration: underline;
      }

      #options-container > div:not(:last-child) {
        margin-bottom: 1em;
      }

      #options-container input[type=number] {
        width: 6em;
      }

      #options-container textarea {
        width: 100%;
        height: 15em;
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

    const freeFilters = options.freeFilters.join(' ');

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
          <input class="input" type="checkbox" name="spammy"
            ${options.spammy && 'checked'}></input>
        </div>
        <div>
          <label>Block emoji only</label>
          <input class="input" type="checkbox" name="emojiOnly"
            ${options.emojiOnly && 'checked'}></input>
        </div>
        <div>
          <label>Block all caps</label>
          <input class="input" type="checkbox" name="allCaps"
            ${options.allCaps && 'checked'}></input>
        </div>
        <div>
          <label>Max words per message</label>
          <input class="input" type="number" name="maxWords"
            value="${options.maxWords}"></input>
        </div>
        <div>
          <p>
            Block messages that match the
            <span class="help" title="You can:
  - Add words, it simply blocks messages that contain them, case insensitive
  - Add phrases by enclosing them in double-quotes
  - Add regular expressions by surrounding your expression with '/'">
              following
            </span>
          </p>
          <textarea
            class="input"
            name="freeFilters">${freeFilters}</textarea>
        </div>
        <div>
          <label>Disable all filters</label>
          <input class="input" type="checkbox" name="disableAll"
            ${options.disableAll && 'checked'}></input>
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

    document.querySelectorAll('#options-container .input').forEach(e => {
      e.onkeyup = e.onkeypress = e.onchange = () => {
        const opts = Array.from(
          document.querySelectorAll('#options-container .input')
        ).reduce((acc, e) => {
          const name = e.name;
          acc[name] = e.type === 'checkbox' ?
            e.checked :
            e.value;
          return acc;
        }, {});

        storeOptions(opts);
        readOptions();
      };
    });

    document.getElementById('twitchCleaner__closeButton').onclick = hideOptions;
  } else {
    optionsContainer.style.display = optionsContainer
      .style.display === 'block' ?
      'none' :
      'block';
  }
}

function hideOptions() {
  document.getElementById('options-container').style.display = 'none';
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
    const opt = s ? JSON.parse(s) : defaults;
    const merged = {
      ...defaults,
      ...opt,
    };

    // puts quotes back into multi-word items. e.g., the array:
    // ['aaa', 'hello there', 'bbb', '/a regex/']
    // returns the string:
    // aaa "hello there" bbb /a regex/
    merged.freeFilters = merged.freeFilters.map(w =>
      w.includes(' ') && w[0] !== '/' ? `"${w}"` : w);

    options = merged;
  } catch (e) {
    console.error(e);
    options = defaults;
  }
}

function storeOptions(options) {
  // split into array and remove possible double-quotes. e.g., the string:
  // aaa "hello there" bbb /a regex/
  // returns the array:
  // ['aaa', 'hello there', 'bbb', '/a regex/']
  options.freeFilters = options.freeFilters
    .match(/\w+|"[^"]+"|\/[^\/]+\//g)
    .map(s => s.replace(/"/g, ''));

  localStorage.setItem(
    'twitch-cleaner-options',
    JSON.stringify(options));
}
