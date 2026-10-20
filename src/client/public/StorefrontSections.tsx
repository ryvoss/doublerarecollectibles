import type { ReactNode } from "react";
import type { PublicActivityItem, PublicAnnouncement, PublicCategory, PublicNewsArticle, PublicNewsSummary } from "../../shared/storefrontContent";
import type { PublicNextShow } from "../../shared/publicSite";
import { PublicLink } from "./PublicLink";

export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <div className="public-section-heading"><div>{eyebrow && <p className="public-kicker">{eyebrow}</p>}<h2>{title}</h2></div>{children}</div>;
}

export function HorizontalRail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="public-horizontal-rail" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

const typeLabels: Record<PublicAnnouncement["type"], string> = {
  NEWS: "News", NEW_RELEASE: "New release", PRICE_DROP: "Price drop", UPCOMING_SHOW: "Upcoming show", STORE_UPDATE: "Store update", DEAL_PROMOTION: "Deal / promotion",
};

export function AnnouncementCard({ item, onNavigate, preview = false }: { item: PublicAnnouncement; onNavigate: (path: string) => void; preview?: boolean }) {
  const content = <>
    {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" width="88" height="88" />}
    <div><span className={`public-editorial-label${item.type === "PRICE_DROP" ? " is-price-drop" : ""}`}>{typeLabels[item.type]}</span>
      <h3>{item.title}</h3><p>{item.summary}</p>
      <span className="public-editorial-card__footer">{item.date && <time dateTime={item.date}>{formatEditorialDate(item.date)}</time>}<span aria-hidden="true">{item.actionLabel || "Explore"} &rarr;</span></span>
    </div>
  </>;
  return preview ? <article className="public-editorial-card">{content}</article> : <PublicLink className="public-editorial-card" href={item.href} onNavigate={onNavigate}>{content}</PublicLink>;
}

export function AnnouncementRail({ items, onNavigate }: { items: PublicActivityItem[]; onNavigate: (path: string) => void }) {
  if (!items.length) return null;
  return <section className="public-updates public-container" aria-labelledby="public-updates-heading">
    <div className="public-section-heading"><h2 id="public-updates-heading">What’s New at Double Rare</h2><PublicLink className="public-text-link" href="/news" onNavigate={onNavigate}>News & updates &rarr;</PublicLink></div>
    <HorizontalRail label="Announcements and updates"><>{items.map((item, index) => <AnnouncementCard key={`${item.href}-${index}`} item={item} onNavigate={onNavigate} />)}</></HorizontalRail>
  </section>;
}

export function CategoryNavigation({ categories, active = "", currentPage = true, onNavigate }: { categories: PublicCategory[]; active?: string; currentPage?: boolean; onNavigate: (path: string) => void }) {
  return <nav className="public-category-navigation" aria-label="Inventory categories">
    <PublicLink className={!active ? "is-active" : undefined} current={currentPage && !active} href="/inventory" onNavigate={onNavigate}>All inventory</PublicLink>
    {categories.map((category) => <PublicLink key={category.slug} current={active === category.slug} className={active === category.slug ? "is-active" : undefined} href={`/inventory?category=${encodeURIComponent(category.slug)}`} onNavigate={onNavigate}>{category.name}</PublicLink>)}
  </nav>;
}

export function formatEditorialDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function ShowCard({ show, nearest = false, onNavigate, detail = false }: { show: PublicNextShow; nearest?: boolean; onNavigate: (path: string) => void; detail?: boolean }) {
  const date = new Date(show.date);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date);
  return <article className={`public-show-card${nearest ? " is-nearest" : ""}`}>
    <time className="public-show-date" dateTime={show.date} aria-label={formatEditorialDate(show.date)}><span>{month}</span><strong>{day}</strong><span>{date.getUTCFullYear()}</span></time>
    <div>{nearest && <p className="public-kicker">Next stop</p>}<h3>{show.name}</h3>
      {show.venue && <p>{show.venue}</p>}{show.location && <p>{show.location}</p>}
      {show.boothInfo && <p className="public-show-card__booth">{show.boothInfo}</p>}
      {show.note && <p>{show.note}</p>}
      {!detail && <PublicLink className="public-text-link" href="/shows" onNavigate={onNavigate}>See show details &rarr;</PublicLink>}
    </div>
  </article>;
}

export function NewsCard({ post, onNavigate }: { post: PublicNewsSummary; onNavigate: (path: string) => void }) {
  return <PublicLink className="public-news-card" href={`/news/${post.slug}`} onNavigate={onNavigate}>
    {post.imageUrl && <img src={post.imageUrl} alt="" loading="lazy" />}
    <div><time dateTime={post.publishAt}>{formatEditorialDate(post.publishAt)}</time><h2>{post.title}</h2><p>{post.summary}</p><span className="public-text-link">Read update &rarr;</span></div>
  </PublicLink>;
}

export function NewsArticle({ post }: { post: PublicNewsArticle }) {
  return <article className="public-news-article">
    <time dateTime={post.publishAt}>{formatEditorialDate(post.publishAt)}</time><h1>{post.title}</h1><p className="public-inner-page__lead">{post.summary}</p>
    {post.imageUrl && <img src={post.imageUrl} alt="" />}
    <div className="public-news-article__body">{post.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
  </article>;
}
