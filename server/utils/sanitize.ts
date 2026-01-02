import sanitizeHtml from 'sanitize-html';

export const sanitizeText = (value: unknown): string =>
  sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
  });

export const sanitizeProfileField = (value: unknown): string => sanitizeText(value).trim();
