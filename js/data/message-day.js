// Optional authored purpose for an owned Post paper. This module stays independent
// of Post so its strict metadata validator can be reused by importing places.
export const MESSAGE_DAY_EPISODES = Object.freeze([
  Object.freeze({ id: 'sign', label: 'Make a sign' }),
  Object.freeze({ id: 'invitation', label: 'Invite a friend' }),
  Object.freeze({ id: 'changed', label: 'Something changed' }),
]);
export const MESSAGE_DAY_GUESTS = Object.freeze(['rayna', 'veer', 'ishan', 'mama', 'daddy', 'ba', 'dada']);
export const MESSAGE_DAY_USES = Object.freeze(['cafe-sign', 'cafe-invite']);
const fields = ['v', 'episode', 'use', 'previousMessageId', 'arrivingGuest'];
const object = raw => !!raw && typeof raw === 'object' && !Array.isArray(raw);
const own = (raw, key) => Object.prototype.hasOwnProperty.call(raw, key);
const validReference = value => typeof value === 'string' && (value === '' || /^[a-zA-Z0-9:_-]{1,100}$/.test(value));
export function messageDayError(code = 'message-day-invalid') {
  return Object.assign(new Error('This message story cannot be opened with unsupported choices. Current papers and earlier messages were kept.'), { code });
}
export function normalizeMessageDay(raw) {
  if (!object(raw) || Object.keys(raw).some(key => !fields.includes(key)) || fields.some(key => !own(raw, key))) throw messageDayError();
  if (raw.v !== 1) throw messageDayError('message-day-version');
  if (!MESSAGE_DAY_EPISODES.some(episode => episode.id === raw.episode)
    || typeof raw.use !== 'string' || raw.use !== '' && !MESSAGE_DAY_USES.includes(raw.use)
    || !validReference(raw.previousMessageId)
    || typeof raw.arrivingGuest !== 'string' || raw.arrivingGuest !== '' && !MESSAGE_DAY_GUESTS.includes(raw.arrivingGuest)) throw messageDayError();
  return { v: 1, episode: raw.episode, use: raw.use, previousMessageId: raw.previousMessageId, arrivingGuest: raw.arrivingGuest };
}
// Legacy absence stays absent; explicitly present null/undefined is malformed.
export function messageDayFields(raw) {
  return raw && own(raw, 'messageDay') ? { messageDay: normalizeMessageDay(raw.messageDay) } : {};
}
export function newMessageDay(episode, options = {}) {
  if (!object(options) || Object.keys(options).some(key => !['messageId', 'arrivingGuest'].includes(key))) throw messageDayError();
  const messageId = own(options, 'messageId') ? options.messageId : '';
  const arrivingGuest = own(options, 'arrivingGuest') ? options.arrivingGuest : '';
  if (episode !== 'changed' && messageId !== '') throw messageDayError();
  return normalizeMessageDay({ v: 1, episode, use: '', previousMessageId: messageId, arrivingGuest });
}
export function chooseMessageDayUse(raw, use) {
  if (!MESSAGE_DAY_USES.includes(use)) throw messageDayError();
  return normalizeMessageDay({ ...normalizeMessageDay(raw), use });
}
