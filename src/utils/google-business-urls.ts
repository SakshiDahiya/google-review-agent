function hasBusinessLocationId(pathname: string): boolean {
  return (
    /\/l\/\d+/.test(pathname) ||
    /\/n\/[^/]+\/l\/[^/]+/.test(pathname) ||
    /\/n\/\d+\/searchprofile\/?$/.test(pathname) ||
    /\/n\/\d+\/profile\/?$/.test(pathname) ||
    /\/n\/\d+\/reviews\/?$/.test(pathname) ||
    /\/dashboard\/l\/\d+/.test(pathname) ||
    /\/location\/\d+/.test(pathname) ||
    /\/u\/\d+\/l\/\d+/.test(pathname)
  );
}

export function isGoogleBusinessHost(hostname: string): boolean {
  return hostname.includes('business.google.com') || hostname.includes('businessprofile.google.com');
}

export function isGbpReviewsManagerUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return isGoogleBusinessHost(url.hostname) && /\/reviews\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function buildReviewsUrlFromProfile(profileUrl: string): string {
  try {
    const url = new URL(profileUrl, 'https://business.google.com');
    const path = url.pathname.replace(/\/$/, '');

    if (/\/searchprofile\/?$/.test(path)) {
      url.pathname = path.replace(/\/searchprofile\/?$/, '/reviews');
      return url.toString();
    }

    if (/\/n\/\d+\/profile\/?$/.test(path)) {
      url.pathname = path.replace(/\/profile\/?$/, '/reviews');
      return url.toString();
    }

    if (/\/n\/\d+\/reviews\/?$/.test(path)) {
      return url.toString();
    }

    return `${path}/reviews${url.search}`;
  } catch {
    return profileUrl;
  }
}

export function isBusinessProfileUrl(href: string): boolean {
  try {
    const url = new URL(href, 'https://business.google.com');
    return isGoogleBusinessHost(url.hostname) && /\/profile\/?$/.test(url.pathname.replace(/\/$/, ''));
  } catch {
    return false;
  }
}

export function resolveReviewsFetchUrl(reviewsPageUrl: string, profileUrl = ''): string {
  const profile = profileUrl.trim();

  if (profile && isBusinessProfileUrl(profile)) {
    return buildReviewsUrlFromProfile(profile);
  }

  const normalized = normalizeReviewsPageUrl(reviewsPageUrl);

  try {
    const url = new URL(normalized, 'https://business.google.com');
    if (!isGoogleBusinessHost(url.hostname)) {
      return normalized;
    }

    if (!url.searchParams.has('fid')) {
      const fidSources = [profile, profile.replace(/\/reviews\/?$/, '/profile'), reviewsPageUrl];
      for (const source of fidSources) {
        if (!source) continue;
        const fid = new URL(source, 'https://business.google.com').searchParams.get('fid');
        if (fid) {
          url.searchParams.set('fid', fid);
          break;
        }
      }
    }

    return url.toString();
  } catch {
    return normalized;
  }
}

export function normalizeReviewsPageUrl(href: string): string {
  try {
    const url = new URL(href);

    if (isGoogleBusinessHost(url.hostname) && /\/n\/\d+\/reviews\/?$/.test(url.pathname)) {
      return url.toString();
    }

    if (url.hostname.includes('google.') && url.pathname === '/search') {
      const mpdMatch = url.hash.match(/mpd=~?(\d+)\/customers\/reviews/i);
      if (mpdMatch) {
        return `https://business.google.com/n/${mpdMatch[1]}/reviews`;
      }
    }

    return href;
  } catch {
    return href;
  }
}

export function isGoogleManagedReviewsUrl(href: string): boolean {
  try {
    const url = new URL(href);

    if (isGoogleBusinessHost(url.hostname)) {
      if (/\/n\/\d+\/reviews\/?$/.test(url.pathname)) {
        return true;
      }
      return /review/i.test(url.pathname) && hasBusinessLocationId(url.pathname);
    }

    if (url.hostname.includes('google.') && url.pathname === '/search') {
      return /\/customers\/reviews/i.test(url.hash) || /mpd=.*reviews/i.test(url.hash);
    }

    return false;
  } catch {
    return false;
  }
}
