#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Tells IndexNow (Bing, Yandex, Seznam, Naver; Bing feeds ChatGPT search) which pages of the apex
// site changed with a deploy, so they are crawled again within days rather than weeks.
//
// Run by deploy.yml after the rollout: `node scripts/indexnow.mjs <ISO date of the deployed commit>`.
// It reads the live sitemap and sends only the pages whose lastmod (their source's last commit,
// scripts/doc-lastmod.mjs) is later than that date, so a deploy that changes no page sends nothing.
// Without a date (first deploy, unknown commit) it sends nothing either: IndexNow is for changes,
// not for a whole-site push. The key is public by design (the protocol checks it at keyLocation).

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
export const SITE = "https://www.benevol.app"
export const INDEXNOW_KEY = "c3e19c7197a94b90735c0389a767a277"
/** The key file, in public/, served at the site's root. */
export const INDEXNOW_KEY_FILE = "indexnow-key.txt"
/** IndexNow's limit per request. */
export const MAX_URLS = 10000

/**
 * The sitemap's URLs on `site` whose lastmod is later than `since`. Entries without a lastmod are
 * left out: nothing says they changed.
 * @param {string} xml
 * @param {Date} since
 * @param {string} [site]
 * @returns {string[]}
 */
export function changedUrls(xml, since, site = SITE) {
  const urls = []
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1]?.trim()
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1]?.trim()
    if (!loc || !lastmod || !loc.startsWith(`${site}/`)) continue
    const date = new Date(lastmod)
    if (!Number.isNaN(date.getTime()) && date > since) urls.push(loc)
  }
  return [...new Set(urls)].slice(0, MAX_URLS)
}

/**
 * The IndexNow request body for these URLs.
 * @param {string[]} urlList
 * @param {string} [site]
 */
export function indexNowBody(urlList, site = SITE) {
  return { host: new URL(site).host, key: INDEXNOW_KEY, keyLocation: `${site}/${INDEXNOW_KEY_FILE}`, urlList }
}

async function main() {
  const sinceArg = process.argv[2]
  const since = sinceArg ? new Date(sinceArg) : null
  if (!since || Number.isNaN(since.getTime())) {
    console.log("IndexNow: no previous deploy date, nothing sent.")
    return
  }
  const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`)
  const urls = changedUrls(await res.text(), since)
  if (urls.length === 0) {
    console.log(`IndexNow: no page changed since ${since.toISOString()}, nothing sent.`)
    return
  }
  const sent = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowBody(urls)),
    signal: AbortSignal.timeout(30_000),
  })
  // 200 and 202 are both accepted (202: the key is still being checked).
  if (sent.status !== 200 && sent.status !== 202) throw new Error(`IndexNow answered ${sent.status}`)
  console.log(`IndexNow: ${urls.length} page(s) sent (${sent.status}).`)
  for (const url of urls) console.log(`  ${url}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`IndexNow: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  })
}
