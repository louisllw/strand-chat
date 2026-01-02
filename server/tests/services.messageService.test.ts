import test from 'node:test';
import assert from 'node:assert/strict';
import { mapInsertedMessageRow, mapMessageRow } from '../services/messageService.js';

test('mapInsertedMessageRow sanitizes content', () => {
  const row = {
    id: 'm1',
    content: '<b>hi</b>',
    sender_id: 'u1',
    sender_username: 'jane',
    conversation_id: 'c1',
    created_at: new Date().toISOString(),
    type: 'text',
    attachment_url: null,
    reply_id: null,
  };
  const message = mapInsertedMessageRow(row);
  assert.equal(message.content, 'hi');
});

test('mapMessageRow sanitizes reply content', () => {
  const row = {
    id: 'm2',
    content: 'hey',
    sender_id: 'u1',
    sender_username: 'jane',
    conversation_id: 'c1',
    created_at: new Date().toISOString(),
    type: 'text',
    attachment_url: null,
    reply_id: 'm1',
    reply_content: '<i>ok</i>',
    reply_sender_id: 'u2',
    reactions: [],
  };
  const message = mapMessageRow(row);
  assert.equal(message.replyTo?.content, 'ok');
});
