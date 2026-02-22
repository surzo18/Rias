import type { Browser, Page } from 'puppeteer';

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-crash-reporter',
  '--crash-dumps-dir=/tmp',
  '--user-data-dir=/tmp/chromium',
];

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer');
  const b = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: LAUNCH_ARGS,
  });

  b.on('disconnected', () => {
    browser = null;
    launching = null;
  });

  return b;
}

export async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;

  // Prevent multiple concurrent launches
  if (launching) return launching;

  launching = launchBrowser();
  try {
    browser = await launching;
    return browser;
  } finally {
    launching = null;
  }
}

export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  timeout = 25000,
): Promise<T> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(USER_AGENT);
    page.setDefaultNavigationTimeout(timeout);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser?.connected) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
