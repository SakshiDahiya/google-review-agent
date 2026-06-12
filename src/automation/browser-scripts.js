/**
 * Plain JS functions executed inside the browser via page.evaluate.
 * Kept as .js so tsx/tsc do not inject __name helpers that break Playwright.
 */

function pickText(root, selectorList) {
  for (let i = 0; i < selectorList.length; i++) {
    const el = root.querySelector(selectorList[i]);
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

function discoverBusinesses(selectors) {
  const results = [];
  const seen = new Set();

  function addBusiness(name, profileUrl, address) {
    const key = name + '|' + profileUrl;
    if (!name.trim() || seen.has(key)) return;
    seen.add(key);
    results.push({
      name: name.trim(),
      profileUrl: profileUrl,
      address: address ? address.trim() : undefined,
    });
  }

  var SKIP_NAMES =
    /^(sign out|help|settings|overview|retail|services|bookings|performance|advertise|photos|posts|manufacturer center|google ads api|marketing profile settings|get expert support)$/i;
  var MARKETING_COPY = /^(connect with customers|turn local online|get expert support)/i;

  function isProfileHref(href) {
    if (!href || href.indexOf('business.google.com') === -1) return false;
    if (href.indexOf('accounts.google.com') !== -1) return false;
    if (/\/locations\/?$/.test(href) || /business\.google\.com\/?$/.test(href)) return false;
    return (
      /\/l\/\d+/.test(href) ||
      /\/n\/[^/]+\/l\/[^/]+/.test(href) ||
      /\/n\/\d+\/searchprofile\/?$/.test(href) ||
      href.indexOf('/dashboard/l/') !== -1 ||
      /\/location\/\d+/.test(href) ||
      /\/u\/\d+\/l\/\d+/.test(href)
    );
  }

  function isValidBusinessName(name) {
    if (!name || name.length < 2 || name.length > 150) return false;
    if (SKIP_NAMES.test(name) || MARKETING_COPY.test(name)) return false;
    if (/google ads/i.test(name)) return false;
    return true;
  }

  const locationLinks = document.querySelectorAll('a[href]');
  for (let i = 0; i < locationLinks.length; i++) {
    const link = locationLinks[i];
    const href = link.href;
    if (!isProfileHref(href)) continue;

    const card = link.closest('div, li, article') || link;
    const text = card.textContent || link.textContent || '';
    const lines = text
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    const name =
      (link.getAttribute('aria-label') || '').trim() ||
      lines[0] ||
      '';
    const address = lines.length > 1 ? lines.slice(1).join(', ') : undefined;

    if (isValidBusinessName(name)) {
      addBusiness(name, href, address);
    }
  }

  var locationCards = document.querySelectorAll('[data-location-id]');
  for (var lc = 0; lc < locationCards.length; lc++) {
    var card = locationCards[lc];
    var locationId = card.getAttribute('data-location-id');
    var cardLink = card.querySelector('a[href]');
    var cardHref =
      (cardLink && cardLink.href) ||
      (locationId ? 'https://business.google.com/l/' + locationId + '/profile' : '');
    if (!cardHref || !isProfileHref(cardHref)) continue;

    var cardText = (card.textContent || '').trim();
    var cardLines = cardText
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var cardName = cardLines[0] || '';
    if (isValidBusinessName(cardName)) {
      addBusiness(cardName, cardHref, cardLines.length > 1 ? cardLines.slice(1).join(', ') : undefined);
    }
  }

  if (isProfileHref(window.location.href)) {
    const h1 = document.querySelector('h1, [data-business-name], div[role="heading"]');
    const pageName =
      (h1 && h1.textContent && h1.textContent.trim()) ||
      document.title.replace(/\s*[-|–]\s*Google.*$/i, '').trim();
    if (isValidBusinessName(pageName)) {
      addBusiness(pageName, window.location.href.split('?')[0].split('#')[0]);
    }
  }

  var clickables = document.querySelectorAll('[role="listitem"], [role="button"], c-wiz');
  for (var c = 0; c < clickables.length; c++) {
    var el = clickables[c];
    var text = (el.textContent || '').trim();
    if (text.length < 3 || text.length > 200) continue;
    var innerLink = el.querySelector('a[href]');
    if (innerLink && isProfileHref(innerLink.href)) {
      var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var bizName = lines[0] || innerLink.getAttribute('aria-label') || '';
      if (isValidBusinessName(bizName)) addBusiness(bizName, innerLink.href, lines.slice(1).join(', '));
    }
  }

  for (let s = 0; s < selectors.businessCard.length; s++) {
    const cards = document.querySelectorAll(selectors.businessCard[s]);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const link = card.querySelector('a[href]');
      const nameEl = card.querySelector(selectors.businessName.join(','));
      const name =
        (nameEl && nameEl.textContent && nameEl.textContent.trim()) ||
        (card.textContent && card.textContent.split('\n')[0].trim()) ||
        '';
      const addressEl = card.querySelector(selectors.businessAddress.join(','));
      const address = addressEl && addressEl.textContent ? addressEl.textContent.trim() : undefined;
      if (link && link.href && isValidBusinessName(name)) {
        addBusiness(name, link.href, address);
      }
    }
  }

  return results;
}

function discoverLocationsTable(selectors) {
  const results = [];
  const seen = new Set();

  function addBusiness(name, profileUrl, address) {
    const key = profileUrl;
    if (!name.trim() || seen.has(key)) return;
    seen.add(key);
    results.push({
      name: name.trim(),
      profileUrl: profileUrl,
      address: address ? address.trim() : undefined,
    });
  }

  var rows = document.querySelectorAll(selectors.locationsTableRow);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var link = row.querySelector(selectors.locationsBusinessLink);
    if (!link || !link.href) continue;

    var href = link.href.split('?')[0].split('#')[0];
    if (href.indexOf('business.google.com') === -1) continue;
    if (!/\/searchprofile\/?$/.test(href) && !/\/l\/\d+/.test(href) && !/\/n\/[^/]+\/l\//.test(href)) {
      continue;
    }

    var nameEl = row.querySelector(selectors.locationsBusinessName);
    var addressEl = row.querySelector(selectors.locationsBusinessAddress);
    var name = (nameEl && nameEl.textContent && nameEl.textContent.trim()) || '';
    var address = addressEl && addressEl.textContent ? addressEl.textContent.trim() : undefined;

    if (!name) {
      var linkLines = (link.textContent || '')
        .split('\n')
        .map(function (l) {
          return l.trim();
        })
        .filter(Boolean);
      name = linkLines[0] || '';
      if (!address && linkLines.length > 1) {
        address = linkLines.slice(1).join(', ');
      }
    }

    if (name.length > 1 && name.length < 150) {
      addBusiness(name, href, address);
    }
  }

  return results;
}

function extractProfileDetails(selectors) {
  function pickFromDocument(list) {
    for (let i = 0; i < list.length; i++) {
      const el = document.querySelector(list[i]);
      if (el && el.textContent && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  }

  const name =
    pickFromDocument(selectors.businessName) ||
    document.title.replace(/ - Google.*$/, '').trim();
  const description = pickFromDocument(selectors.businessDescription);
  const address = pickFromDocument(selectors.businessAddress);
  const category = pickFromDocument(selectors.businessCategory);

  return { name: name, description: description, address: address, category: category };
}

function clickReviewsNav(selectors) {
  const candidates = Array.from(
    document.querySelectorAll('a, button, div[role="tab"], span[role="tab"]')
  );
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const text = el.textContent || '';
    const label = el.getAttribute('aria-label') || '';
    if (/reviews/i.test(text) || /reviews/i.test(label)) {
      el.click();
      return true;
    }
  }
  for (let s = 0; s < selectors.reviewsNavLink.length; s++) {
    const el = document.querySelector(selectors.reviewsNavLink[s]);
    if (el) {
      el.click();
      return true;
    }
  }
  return false;
}

function scrapeReviews(args) {
  const unrepliedOnly = args.unrepliedOnly === true;
  const reviewCardSelector = args.reviewCardSelector || 'div.OUCuxb';
  const results = [];

  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }

  const UI_LINES = { reply: true, more_vert: true };
  const OWNER_REPLY =
    /\(owner\)|your response|owner response|response from the owner/i;

  function stripEditDelete(text) {
    return text.replace(/\s*Edit\s*Delete\s*$/i, '').trim();
  }

  function splitReviewAndOwnerReply(text) {
    const cleaned = text
      .replace(/\s*…?\s*More$/i, '')
      .replace(/\s*Reply\s*$/i, '')
      .trim();

    const ownerMarker = cleaned.match(/^([\s\S]*?)\s*\(owner\)\s+([\s\S]+)$/i);
    if (ownerMarker) {
      return {
        reviewText: ownerMarker[1].trim(),
        ownerReply: stripEditDelete(ownerMarker[2]) || undefined,
      };
    }

    const embedded = cleaned.match(
      /^([\s\S]*?)\s+(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|a\s+year\s+ago|yesterday|today)\s+((?:Hi|Thank)[\s\S]+)$/i
    );
    if (embedded) {
      const reviewText = embedded[1].trim();
      const ownerReply = stripEditDelete(embedded[2] + ' ' + embedded[3]);
      if (reviewText.length > 0 && ownerReply.length > 15) {
        return { reviewText: reviewText, ownerReply: ownerReply };
      }
    }

    return { reviewText: cleaned, ownerReply: undefined };
  }

  function hasReplyButton(card) {
    return [...card.querySelectorAll("button, [role='button']")].some(function (btn) {
      return /\breply\b/i.test(textOf(btn));
    });
  }

  function hasOwnerReplyOnCard(card, parsed) {
    if (parsed.ownerReply) return true;
    const cardText = textOf(card);
    if (OWNER_REPLY.test(cardText)) return true;
    if (
      !hasReplyButton(card) &&
      /\bEdit\b/.test(cardText) &&
      /\bDelete\b/.test(cardText) &&
      parsed.text
    ) {
      return true;
    }
    return false;
  }

  function parseCard(card) {
    const lines = textOf(card)
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l && !UI_LINES[l] && !/^reply$/i.test(l);
      });

    if (lines.length === 0) return null;

    const reviewerName = lines[0];
    const metaLine = lines[1] || '';
    const starGlyphs = (metaLine.match(/[\uE000-\uF8FF\u2605\u2B50\uE838]/g) || []).length;
    const rating =
      starGlyphs ||
      Number((metaLine.match(/(\d)\s*star/i) || [])[1]) ||
      5;

    const textLines = lines.slice(2).filter(function (line) {
      if (/^Translated by Google/i.test(line)) return false;
      if (line === 'More') return false;
      if (/^Edit$/i.test(line)) return false;
      if (/^Delete$/i.test(line)) return false;
      return true;
    });

    let text = textLines
      .join(' ')
      .replace(/\s*…?\s*More$/, '')
      .replace(/\s*Reply\s*$/i, '')
      .trim();
    const starOnly = /left just a rating/i.test(text);
    if (starOnly) text = '';

    const split = splitReviewAndOwnerReply(text);

    return {
      reviewerName: reviewerName,
      rating: rating,
      text: split.reviewText,
      date: metaLine.replace(/[\uE000-\uF8FF\u2605\u2B50\uE838]/g, '').trim(),
      ownerReply: split.ownerReply,
    };
  }

  const cards = [...document.querySelectorAll(reviewCardSelector)];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cardText = textOf(card);
    const parsed = parseCard(card);
    if (!parsed) continue;

    const ownerReplied = hasOwnerReplyOnCard(card, parsed);
    if (unrepliedOnly && (ownerReplied || !hasReplyButton(card))) continue;

    const idSource =
      parsed.text.length > 0
        ? parsed.reviewerName + '|' + parsed.date + '|' + parsed.text.slice(0, 80)
        : parsed.reviewerName + '|' + parsed.date + '|' + parsed.rating + '|star-only';
    const reviewId = hashString(idSource);

    results.push({
      reviewId: reviewId,
      author: parsed.reviewerName,
      rating: parsed.rating,
      reviewText: parsed.text,
      reviewDate: parsed.date || undefined,
      ownerReply: parsed.ownerReply || (ownerReplied ? '(replied)' : undefined),
    });
  }

  return results;
}

function locateReviewByAuthor(args) {
  const author = args.author;
  const reviewCardSelector = args.reviewCardSelector;
  const cards = [...document.querySelectorAll(reviewCardSelector)];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const reviewerLine = textOf(card).split('\n')[0]?.trim() || '';
    if (reviewerLine === author) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
  }
  return false;

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }
}

function clickReplyButton(selectors) {
  for (let s = 0; s < selectors.replyButton.length; s++) {
    const buttons = document.querySelectorAll(selectors.replyButton[s]);
    if (buttons.length > 0) {
      buttons[0].click();
      return true;
    }
  }
  const all = Array.from(document.querySelectorAll('button, div[role="button"], span'));
  for (let i = 0; i < all.length; i++) {
    if (/reply/i.test(all[i].textContent || '')) {
      all[i].click();
      return true;
    }
  }
  return false;
}

function clickSubmitButton(selectors) {
  for (let s = 0; s < selectors.submitButton.length; s++) {
    const buttons = Array.from(document.querySelectorAll(selectors.submitButton[s]));
    for (let i = 0; i < buttons.length; i++) {
      const text = buttons[i].textContent || '';
      if (/post|submit|reply/i.test(text) && !/cancel/i.test(text)) {
        buttons[i].click();
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  discoverBusinesses,
  discoverLocationsTable,
  extractProfileDetails,
  clickReviewsNav,
  scrapeReviews,
  locateReviewByAuthor,
  clickReplyButton,
  clickSubmitButton,
};
