import OpenAI from 'openai';
import { Settings } from '../models/settings';
import { ReviewRecord } from '../models/review';

const MAX_HTML_CHARS = 120_000;
const MAX_OUTPUT_TOKENS = 10_000;
const REPLY_MODEL = 'gpt-5.4-nano';
const SETUP_MODEL = 'gpt-5.4';

export interface AiExtractedBusiness {
  name: string;
  address?: string;
  profileUrl: string;
}

export interface BusinessExtractionResult {
  businesses: AiExtractedBusiness[];
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

export interface RefinedReplyStyle {
  replyTone: string;
  customInstructions: string;
  summary: string;
}

export class OpenAIClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReviewReply(settings: Settings, review: ReviewRecord): Promise<string> {
    const rating = `${review.rating} star${review.rating !== 1 ? 's' : ''}`;
    const reviewer = review.author || 'Anonymous';
    const comment = review.reviewText?.trim() || '(No written comment)';

    const systemPrompt = [
      'You are a professional customer service representative writing replies to Google Business reviews.',
      `Business: ${settings.businessDescription}`,
      `Tone: ${settings.replyTone}`,
      settings.customInstructions
        ? `Additional instructions: ${settings.customInstructions}`
        : '',
      'Keep replies concise (2-4 sentences), genuine, and appropriate for the rating.',
      'If the customer left only a star rating with no written comment, thank them for the rating without inventing details.',
      'Do not use placeholders. Do not mention being an AI.',
      'Sign off warmly when appropriate.',
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      `Review rating: ${rating}`,
      `Reviewer: ${reviewer}`,
      `Review text: ${comment}`,
      'Write a reply to this review.',
    ].join('\n');

    const response = await this.client.chat.completions.create({
      model: REPLY_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    });

    const reply = response.choices[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error('OpenAI returned an empty reply.');
    }

    return reply;
  }

  async refineReplyStyleFromFeedback(
    settings: Settings,
    feedback: string
  ): Promise<RefinedReplyStyle> {
    const systemPrompt = [
      'You refine Google Business review reply style settings based on user feedback on generated previews.',
      'Return JSON only in this shape:',
      '{"replyTone":"short tone label","customInstructions":"rules for the AI","summary":"one sentence explaining what you changed"}',
      'Rules:',
      '- replyTone is a short descriptive phrase (e.g. "Professional and friendly", "Warm with emojis").',
      '- customInstructions lists concrete rules: emoji use, length, sign-off, services to mention, language style, etc.',
      '- Merge new feedback with existing custom instructions; keep prior rules unless the user asks to remove them.',
      '- When feedback contradicts earlier rules, prefer the latest feedback.',
      '- customInstructions can be empty if tone alone is sufficient.',
    ].join('\n');

    const userPrompt = [
      `Business: ${settings.businessName || settings.businessDescription}`,
      `Current tone: ${settings.replyTone}`,
      `Current custom instructions: ${settings.customInstructions || '(none)'}`,
      '',
      'User feedback on the preview replies:',
      feedback,
      '',
      'Update the reply style settings to address this feedback.',
    ].join('\n');

    const response = await this.client.chat.completions.create({
      model: SETUP_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawResponse = response.choices[0]?.message?.content?.trim() ?? '';
    if (!rawResponse) {
      throw new Error('OpenAI returned an empty style refinement.');
    }

    const parsed = JSON.parse(rawResponse) as Partial<RefinedReplyStyle>;
    const replyTone = parsed.replyTone?.trim();
    const customInstructions = parsed.customInstructions?.trim() ?? '';
    const summary = parsed.summary?.trim();

    if (!replyTone) {
      throw new Error('OpenAI returned an invalid style refinement.');
    }

    return {
      replyTone,
      customInstructions,
      summary: summary || 'Updated reply style based on your feedback.',
    };
  }

  async extractBusinessesFromPageSource(
    pageUrl: string,
    pageTitle: string,
    pageHtml: string
  ): Promise<BusinessExtractionResult> {
    const preparedHtml = this.prepareHtmlForAnalysis(pageHtml);
    const truncated =
      preparedHtml.length > MAX_HTML_CHARS
        ? `${preparedHtml.slice(0, MAX_HTML_CHARS)}\n<!-- truncated -->`
        : preparedHtml;

    const systemPrompt = [
      'You extract Google Business Profile listings from raw HTML source code.',
      'Return JSON only in this shape:',
      '{"businesses":[{"name":"Business Name","address":"City, State","profileUrl":"https://business.google.com/..."}]}',
      'Rules:',
      '- Include only real managed business locations the user owns (table rows on /locations, or a single business dashboard).',
      '- Each profileUrl must be an absolute https://business.google.com/... link from an <a href> in the HTML.',
      '- Common profile paths: /n/{id}/searchprofile, /l/{id}/profile, /n/{id}/l/{id}/profile.',
      '- Extract name and address from the listing row when available.',
      '- Ignore navigation items (Overview, Services, Retail, Photos, Google Ads, help links, sign out).',
      '- Ignore marketing copy like "Connect with customers looking for your services".',
      '- If no businesses are present, return {"businesses":[]}.',
    ].join('\n');

    const userPrompt = `Page URL: ${pageUrl}\nPage title: ${pageTitle}\n\nHTML source:\n${truncated}`;

    const response = await this.client.chat.completions.create({
      model: SETUP_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawResponse = response.choices[0]?.message?.content?.trim() ?? '';

    if (!rawResponse) {
      return { businesses: [], systemPrompt, userPrompt, rawResponse };
    }

    const parsed = JSON.parse(rawResponse) as { businesses?: AiExtractedBusiness[] };
    if (!Array.isArray(parsed.businesses)) {
      return { businesses: [], systemPrompt, userPrompt, rawResponse };
    }

    const businesses = parsed.businesses.filter(
      (business) =>
        typeof business.name === 'string' &&
        business.name.trim().length > 0 &&
        typeof business.profileUrl === 'string' &&
        business.profileUrl.includes('business.google.com')
    );

    return { businesses, systemPrompt, userPrompt, rawResponse };
  }

  private prepareHtmlForAnalysis(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '<svg/>')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
