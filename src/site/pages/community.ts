import {
  escapeHtml,
  renderUiText,
  SITE_GITHUB_URL,
  type SitePage,
} from "../html.js";
import { siteText, type SiteLocale, type SiteUiTextKey } from "../i18n.js";

function ui(key: SiteUiTextKey, locale: SiteLocale): string {
  return renderUiText(key, locale);
}

function statusBadge(
  key: SiteUiTextKey,
  locale: SiteLocale,
  tone: "muted" | "preview" = "muted",
): string {
  return `<span class="status-badge status-${tone}">${ui(key, locale)}</span>`;
}

function statusItem(
  labelKey: SiteUiTextKey,
  valueKey: SiteUiTextKey,
  locale: SiteLocale,
  tone: "positive" | "pending",
): string {
  return `<div><span class="status-dot status-dot-${tone}" aria-hidden="true"></span><strong>${ui(labelKey, locale)}</strong><p>${ui(valueKey, locale)}</p></div>`;
}

export function renderCommunityPage(locale: SiteLocale): SitePage {
  return {
    title: siteText(locale, "communityPageTitle"),
    description: siteText(locale, "communityMetaDescription"),
    route: "/community/",
    content: `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${statusBadge("communityParticipationClosed", locale, "preview")}<span class="eyebrow">${ui("community", locale)}</span></div><h1>${ui("communityHeroTitle", locale)}</h1><p class="lede">${ui("communityHeroDescription", locale)}</p><div class="community-closed-state" role="status">${statusBadge("communityParticipationClosed", locale)}</div></div></section>
    <section class="section"><div class="shell two-column"><div><p class="eyebrow">${ui("communityWhyEyebrow", locale)}</p><h2>${ui("communityWhyTitle", locale)}</h2></div><div><p class="section-copy">${ui("communityWhyCopy", locale)}</p><p>${ui("communityWhyEvidence", locale)}</p></div></div></section>
    <section class="section section-muted"><div class="shell"><div class="section-heading"><p class="eyebrow">${ui("communityWhatEyebrow", locale)}</p><h2>${ui("communityWhatTitle", locale)}</h2><p class="section-copy">${ui("communityWhatCopy", locale)}</p></div><ul class="feature-list"><li><span>01</span><span>${ui("communityTaskRead", locale)}</span></li><li><span>02</span><span>${ui("communityTaskJudge", locale)}</span></li><li><span>03</span><span>${ui("communityTaskSubmit", locale)}</span></li><li><span>04</span><span>${ui("communityTaskQualify", locale)}</span></li></ul></div></section>
    <section class="section"><div class="shell two-column"><div><p class="eyebrow">${ui("communityHowEyebrow", locale)}</p><h2>${ui("communityHowTitle", locale)}</h2><p class="section-copy">${ui("communityHowCopy", locale)}</p></div><ol class="feature-list"><li><span>01</span><span>${ui("communityStepApplication", locale)}</span></li><li><span>02</span><span>${ui("communityStepManualReview", locale)}</span></li><li><span>03</span><span>${ui("communityStepInvitation", locale)}</span></li><li><span>04</span><span>${ui("communityStepConsent", locale)}</span></li><li><span>05</span><span>${ui("communityStepQualification", locale)}</span></li><li><span>06</span><span>${ui("communityStepBlindReview", locale)}</span></li></ol></div></section>
    <section class="section section-dark"><div class="shell"><div class="section-heading"><p class="eyebrow">${ui("communityStatusEyebrow", locale)}</p><h2>${ui("communityStatusTitle", locale)}</h2><p class="section-copy">${ui("communityStatusCopy", locale)}</p></div><div class="status-grid">${statusItem("communityStatusInfo", "communityStatusInfoValue", locale, "positive")}${statusItem("communityStatusIntake", "communityStatusIntakeValue", locale, "pending")}${statusItem("communityStatusCampaign", "communityStatusCampaignValue", locale, "pending")}${statusItem("communityStatusCalibration", "communityStatusCalibrationValue", locale, "pending")}</div></div></section>
    <section class="section section-muted"><div class="shell two-column"><div><p class="eyebrow">${ui("communityEvidenceEyebrow", locale)}</p><h2>${ui("communityEvidenceTitle", locale)}</h2></div><p class="section-copy">${ui("communityEvidenceCopy", locale)}</p></div></section>
    <section class="section"><div class="shell developer-cta"><div class="section-heading"><p class="eyebrow">${ui("communityWatchEyebrow", locale)}</p><h2>${ui("communityWatchTitle", locale)}</h2></div><div><p class="section-copy">${ui("communityWatchCopy", locale)}</p><div class="button-row"><a class="button button-primary" href="/">${ui("communityWatchHomepage", locale)}</a><a class="button button-secondary" href="/data/cases/">${ui("communityWatchCases", locale)}</a><a class="button button-quiet" href="/methodology/">${ui("communityWatchMethodology", locale)}</a></div><p><a class="text-link" href="${escapeHtml(SITE_GITHUB_URL)}" rel="noreferrer">${ui("communityWatchGitHub", locale)}</a></p></div></div></section>`,
  };
}
