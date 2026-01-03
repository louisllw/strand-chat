export const buildCspDirectives = (isProduction: boolean, reportUri?: string) => ({
  defaultSrc: ["'self'"],
  scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
  styleSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'https:'],
  ...(reportUri ? { reportUri: [reportUri] } : {}),
});
