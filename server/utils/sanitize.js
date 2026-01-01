import sanitizeHtml from 'sanitize-html';

export const sanitizeText = (value) =>
  sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
  });

export const sanitizeProfileField = (value) => sanitizeText(value).trim();
