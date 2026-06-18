function cleanUrl(value) {
  return value ? value.replace(/\/$/, '') : '';
}

function isLocalUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
}

function withHttps(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function getPublicAppUrl(req) {
  const configuredUrl = cleanUrl(process.env.APP_URL);
  const vercelUrl = cleanUrl(withHttps(
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  ));

  if (configuredUrl && !isLocalUrl(configuredUrl)) {
    return configuredUrl;
  }

  if (vercelUrl) {
    return vercelUrl;
  }

  if (req) {
    const forwardedProto = req.get('x-forwarded-proto');
    const forwardedHost = req.get('x-forwarded-host');
    const protocol = forwardedProto || req.protocol;
    const host = forwardedHost || req.get('host');

    if (host) {
      const requestUrl = cleanUrl(`${protocol}://${host}`);
      if (!isLocalUrl(requestUrl)) {
        return requestUrl;
      }
    }
  }

  if (configuredUrl) {
    return configuredUrl;
  }

  if (req) {
    const forwardedProto = req.get('x-forwarded-proto');
    const forwardedHost = req.get('x-forwarded-host');
    const protocol = forwardedProto || req.protocol;
    const host = forwardedHost || req.get('host');

    if (host) {
      return cleanUrl(`${protocol}://${host}`);
    }
  }

  return 'http://localhost:3000';
}
