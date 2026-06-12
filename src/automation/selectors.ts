/**
 * Centralized selectors for Google Business reviews UI.
 * Google frequently changes DOM structure; multiple fallbacks are provided.
 */
export const SELECTORS = {
  // business.google.com/locations table
  locationsTable: 'table.i3WFpf',
  locationsTableRow: 'table.i3WFpf tbody tr[data-ulid], table.i3WFpf tbody tr.w0Oumf',
  locationsBusinessLink: 'a.DuDIZe, a[href*="/searchprofile"]',
  locationsBusinessName: 'span.hwl8wd',
  locationsBusinessAddress: 'span.ruyPpc',

  // Business profile / location list
  businessCard: [
    '[data-location-id]',
    'div[class*="location-card"]',
    'li[class*="location"]',
    'c-wiz[class*="location"]',
  ],

  businessName: [
    'h1',
    '[data-business-name]',
    'div[class*="business-name"]',
    'span[class*="title"]',
  ],

  businessDescription: [
    '[data-description]',
    'div[class*="description"]',
    'textarea[aria-label*="description" i]',
    'div[aria-label*="description" i]',
    'div[class*="about"]',
  ],

  businessAddress: [
    '[data-address]',
    'div[class*="address"]',
    'span[class*="address"]',
  ],

  businessCategory: [
    '[data-category]',
    'div[class*="category"]',
    'span[class*="category"]',
  ],

  googleSearchBusinessPanel: [
    'text=/you manage this business/i',
    '[aria-label*="You manage this business"]',
  ],

  googleSearchReadReviews: [
    'a[aria-label*="Read reviews" i]',
    'button[aria-label*="Read reviews" i]',
    'div[role="button"][aria-label*="Read reviews" i]',
    'a:has-text("Read reviews")',
    'button:has-text("Read reviews")',
    'div[role="button"]:has-text("Read reviews")',
  ],

  googleSearchBusinessName: [
    '[data-attrid="title"]',
    'h2[data-attrid="title"]',
    'div[role="heading"][aria-level="2"]',
    'h2',
  ],

  reviewsNavLink: [
    'a[href*="business.google.com"][href*="reviews"]',
    'a[href*="businessprofile.google.com"][href*="reviews"]',
    'a[aria-label*="Reviews"]',
    'button[aria-label*="Reviews"]',
    'div[role="tab"]:has-text("Reviews")',
  ],

  // Login detection
  loginEmailInput: 'input[type="email"]',
  loginPasswordInput: 'input[type="password"]',
  accountAvatar: '[data-email], img[alt*="Account"], a[aria-label*="Google Account"]',

  // business.google.com/reviews — GBP reviews manager
  reviewCard: ['div.OUCuxb'],
  reviewRow: ['div.DsOcnf'],

  notRepliedFilter: [
    'button:has-text("Not replied")',
    '[role="tab"]:has-text("Not replied")',
    'a:has-text("Not replied")',
  ],

  rowsPerPageOpen: '[role="option"][data-value="10"]',
  rowsPerPage: (count: number) => `[role="option"][data-value="${count}"]`,

  ownerReplyMarker: [
    ':text("Your response")',
    ':text("Owner response")',
    ':text("Response from the owner")',
  ],

  // Reply interaction (GBP reviews manager)
  replyButton: ['button:has-text("Reply")'],

  replyTextarea: [
    'textarea[aria-label="Your reply"]',
    'textarea[aria-label*="reply" i]',
    'textarea',
  ],

  submitButton: [
    'button:has-text("Post reply")',
    'button:has-text("Post")',
    'button:has-text("Submit")',
  ],

  successIndicator: [
    ':text("Your response")',
    ':text("Response posted")',
    ':text("Reply posted")',
  ],

  nextPage: 'button[aria-label="Next"]',

  cancelButton: [
    'button[aria-label*="Cancel"]',
    'button:has-text("Cancel")',
  ],
} as const;

export const URLS = {
  googleBusinessHome: 'https://business.google.com/',
  googleBusinessReviews: 'https://business.google.com/reviews',
  googleBusinessLocations: 'https://business.google.com/locations',
  googleAccounts: 'https://accounts.google.com/',
  googleAccountChooser: (continueUrl: string) =>
    `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(continueUrl)}&flowName=GlifWebSignIn&flowEntry=AccountChooser`,
  googleSignInFresh: (continueUrl: string) =>
    `https://accounts.google.com/signin/v2/identifier?continue=${encodeURIComponent(continueUrl)}&flowName=GlifWebSignIn&flowEntry=ServiceLogin`,
  googleSignOut: (continueUrl: string) =>
    `https://accounts.google.com/Logout?hl=en&continue=${encodeURIComponent(continueUrl)}`,
} as const;
