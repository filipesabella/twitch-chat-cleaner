// ==UserScript==
// @name         Twitch chat cleaner
// @namespace    https://filipesabella.com
// @version      0.1
// @description  Twitch chat cleaner
// @author       You
// @match        https://www.twitch.tv/*
// @grant        none
// ==/UserScript==

const DUPLICATED_PHRASE_THRESHOLD = 1.7;
const TOO_MANY_EMOJI_THRESHOLD = 3;
const TOO_MANY_WORDS = 40;

// if a message contains any of these, it's discarded
const garbageWords = ['OMEGALAUGHING', 'ZULULING', 'POGGERS', 'LIBIDO', 'KEWK', 'KEKW', 'FANTASTIC, JUST NEED TO WORK ON COMM', 'KKONA', 'BBOOMER', 'LULW', 'WUT', 'PEPEGA', 'PEPW', 'NODDERS', 'DDOOMER', 'KISSAHOMIE'];

// if the message matches one of these, it's discarded
const garbageMessages = ['POG', 'POGU', 'GACHI', 'GACHIBASS', 'MONKAW', 'MONKAS', 'MONKAGIGA', 'LULWUT', 'PEPEHANDS', 'PEPEJAM', 'PEPEJAMMER', 'GACHIHYPER'];

function isGarbage(s) {
  const trimmed = s.trim();
  const upperCased = trimmed.toUpperCase();
  const words = trimmed.split(' ').filter(s => s !== '');

  const isUpperCase = s => s === upperCased;
  const hasEmoji = s => !!s.match(/[a-z]+[A-Z]+/);
  const containsGarbageWord = s => garbageWords.filter(g => upperCased.includes(g)).length > 0;
  const isGarbageMessage = s => garbageMessages.filter(g => upperCased === g).length > 0;
  const probableCopyPasta = s => words.length > TOO_MANY_WORDS;
  const isDuplicatedPhrase = words => words.length / new Set(words).size >= DUPLICATED_PHRASE_THRESHOLD;

  return trimmed === '' // covers de emoji-only messages
    ||
    isUpperCase(trimmed) ||
    hasEmoji(trimmed) ||
    containsGarbageWord(trimmed) ||
    isGarbageMessage(trimmed) ||
    probableCopyPasta(trimmed) ||
    isDuplicatedPhrase(words);
}

function handler(event) {
  const messageContainer = event.target;
  const text = Array.from(messageContainer.querySelectorAll('.text-fragment')).map(e => e.innerHTML).join(' ').trim();
  const tooManyEmoji = () => messageContainer.querySelectorAll('.chat-line__message--emote-button').length >= TOO_MANY_EMOJI_THRESHOLD;

  if (tooManyEmoji()) {
    remove(messageContainer);
  } else if (isGarbage(text)) {
    remove(messageContainer);
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
  let blockedMessagesContainer = document.getElementById('blocked-messages-container');
  if (!counterContainer) {
    blockedMessagesContainer = document.createElement('div');
    blockedMessagesContainer.id = 'blocked-messages-container';
    blockedMessagesContainer.style.display = 'none';
    blockedMessagesContainer.style.position = 'fixed';
    blockedMessagesContainer.style.top = '0';
    blockedMessagesContainer.style.left = '0';
    blockedMessagesContainer.style.bottom = '0';
    blockedMessagesContainer.style.background = '#fcc200';
    blockedMessagesContainer.style.width = '300px';
    blockedMessagesContainer.style.zIndex = '999999';
    blockedMessagesContainer.style.overflow = 'auto';
    document.body.appendChild(blockedMessagesContainer);

    counterContainer = document.createElement('div');
    counterContainer.id = 'counter-container';
    counterContainer.style.cursor = 'pointer';
    counterContainer.onclick = () => {
      if (blockedMessagesContainer.style.display === 'none') {
        blockedMessagesContainer.style.display = 'block';
        blockedMessagesContainer.innerHTML = blockedMessages.join('');
        blockedMessagesContainer.scrollTop = blockedMessagesContainer.scrollHeight;
      } else {
        blockedMessagesContainer.style.display = 'none';
      }
    };
    container.childNodes[1].insertBefore(counterContainer, container.querySelector('.tw-mg-r-1'));
  }

  counterContainer.innerHTML = ++counter;

  const clone = messageContainer.cloneNode(true);
  clone.style.display = 'block';
  blockedMessages.push(clone.outerHTML);
  blockedMessages = blockedMessages.slice(-30); // only last 30 messages
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
