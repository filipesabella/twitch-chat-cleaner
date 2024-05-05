// ==UserScript==
// @name         Twitch chat cleaner
// @namespace    https://filipesabella.com
// @version      0.21
// @description  Add spam controls and filters to twitch chat.
// @author       Filipe Sabella
// @license      MIT
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
    '/.*and regexes.*/i',
  ],
  maxWords: 40,
  minWords: 1,
  tooManyDuplicatesThreshold: 1.7,
  tooManyEmojiThreshold: 3,
  allowWords: [],
};

let options = defaults;
let counter = 0;

function isGarbage(options, s) {
  const trimmed = s.trim();
  const upperCased = trimmed.toUpperCase();
  const words = trimmed.split(' ').filter(s => s !== '');

  const isUpperCase = s => s === upperCased;

  const filteredOut = _ => options
    .freeFilters
    .map(filter => {
      if (filter[0] === '/') {
        const [_, regex, flags] = filter.match(/\/(.*)\/(.*)/);
        return new RegExp(regex, flags);
      } else {
        return new RegExp(`.*${filter}.*`, 'i');
      }
    })
    .find(filter => filter.test(trimmed));

  const isMessageTooLong = _ => words.length > options.maxWords;
  const isMessageTooShort = _ => words.length < options.minWords;
  const isDuplicatedPhrase = words =>
    words.length / new Set(words).size >= options.tooManyDuplicatesThreshold;

  if (options.emojiOnly && trimmed === '') {
    return [true, 'emoji only'];
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

function handler(messageContainer) {
  if (options.disableAll) return false;

  if (messageContainer.className !== 'chat-line__message') return;

  const text = Array.from(messageContainer.querySelectorAll('.text-fragment'))
    .map(e => e.innerHTML).join(' ').trim();

  const allowRegex =
    new RegExp('.*(' + options.allowWords.join('|') + ').*', 'i');
  if (allowRegex.test(text)) return false;

  const tooManyEmoji = () => options.spammy && messageContainer
    .querySelectorAll('.chat-line__message--emote-button')
    .length >= options.tooManyEmojiThreshold;

  if (tooManyEmoji()) {
    remove(messageContainer);
    console.log(`Filtered message: "${text}". Reason: too many emoji.`);
  } else {
    const [garbage, reason] = isGarbage(options, text);
    if (garbage) {
      remove(messageContainer);
      console.log(`Filtered message: "${text}". Reason: ${reason}.`);
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

  const observer = new MutationObserver(mutationList => {
    for (const mutation of mutationList) {
      const node = mutation.addedNodes[0];
      if (node?.classList.contains('chat-line__message')) {
        handler(node);
      }
    }
  });
  observer.observe(c, { attributes: false, childList: true, subtree: true });

  if (!document.getElementById('counter-container')) {
    const container = document.querySelector('.chat-input__buttons-container');
    if (!container) return;

    const counterContainer = document.createElement('div');
    counterContainer.id = 'counter-container';
    counterContainer.style.cursor = 'pointer';
    counterContainer.style.userSelect = 'none';
    counterContainer.innerHTML = '🚯';
    counterContainer.onclick = () => {
      showOptions();
    };
    container.childNodes[1].prepend(counterContainer);
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
        background-color: rgb(24, 24, 27);
        color: rgb(239, 239, 241);
        border: 1px solid rgb(239, 239, 241);
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

      #options-container input, #options-container textarea {
        background-color: rgb(239, 239, 241);
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
          <label>Min words per message</label>
          <input class="input" type="number" name="minWords"
            value="${options.minWords}"></input>
        </div>
        <div>
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
            name="freeFilters">${freeFilters}</textarea>
        </div>
        <div>
          <label>
            ALLOW messages
            <span class="help" title="Useful for adding your name, for example.
Precedes *all* other filters, case insensitive.">
              containing
            </span>
          </label>
          <input class="input" type="text" name="allowWords"
            value="${options.allowWords.join(' ')}"></input>
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

window.setInterval(() => {
  if (!document.getElementById('counter-container')) {
    listenToMessages();
  }
}, 1000);

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
    merged.freeFilters = merged.freeFilters
      .map(w => w.includes(' ') && w[0] !== '/' ? `"${w}"` : w);

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
    .match(/\w+|"[^"]+"|\/[^\/]+\/[a-z]*/g)
    .map(s => s.replace(/"/g, ''));

  options.allowWords = options.allowWords.split(' ');

  localStorage.setItem(
    'twitch-cleaner-options',
    JSON.stringify(options));
}
