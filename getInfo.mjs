// getInfo.mjs
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const ROUTER = { url: "http://192.168.0.1", password: "Droppoint@2025" };

// candidate browser paths (Windows)
const CANDIDATE_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
  "C:\\Program Files\\Chromium\\Application\\chrome.exe",
];

function findExecutable() {
  for (const p of CANDIDATE_PATHS) {
    if (!p) continue;
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (process.env.MSEDGE_PATH && fs.existsSync(process.env.MSEDGE_PATH)) return process.env.MSEDGE_PATH;
  return null;
}

async function launchBrowser() {
  const exe = findExecutable();
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1200,800"
  ];

  if (exe) {
    return await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs });
  } else {
    return await puppeteer.launch({ headless: true, args: launchArgs });
  }
}

const NAV_CANDIDATES = ["/status.htm", "/userRpm/StatusRpm.htm", "/network_map.htm", "/index.htm", "/index.asp", "/"];

function sanitize(s) { if (!s) return s; return s.replace(/\s+/g, " ").trim(); }
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryNavigateToStatus(page, baseUrl) {
  const body = await page.content();
  if (body && body.length > 400 && /Internet Status|Connection Type|Network Map|Internet/i.test(body)) {
    return true;
  }
  for (const p of NAV_CANDIDATES) {
    try {
      const target = new URL(p, baseUrl).href;
      await page.goto(target, { waitUntil: "networkidle2", timeout: 8000 });
      const txt = await page.content();
      if (txt && txt.length > 300 && /Internet Status|Connection Type|Network Map|Internet/i.test(txt)) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function extractStatus(page) {
  return await page.evaluate(() => {
    function findLabelValue(labelPatterns) {
      const bodyText = document.body?.innerText || "";
      for (const p of labelPatterns) {
        const rx = new RegExp(p + "\\s*[:\\-]?\\s*([^\\n\\r]+)", "i");
        const m = bodyText.match(rx);
        if (m && m[1]) return m[1].trim();
      }
      for (const p of labelPatterns) {
        const nodes = Array.from(document.querySelectorAll("body *")).filter(n => (n.innerText || "").toLowerCase().includes(p.toLowerCase()));
        for (const n of nodes) {
          const t = (n.innerText || "");
          const rx = new RegExp(p + "\\s*[:\\-]?\\s*([^\\n\\r]+)", "i");
          const m = t.match(rx);
          if (m && m[1]) return m[1].trim();
          if (n.nextElementSibling && n.nextElementSibling.innerText) return n.nextElementSibling.innerText.trim();
          if (n.parentElement && n.parentElement.innerText) {
            const pm = n.parentElement.innerText.match(new RegExp(p + "\\s*[:\\-]?\\s*([^\\n\\r]+)", "i"));
            if (pm && pm[1]) return pm[1].trim();
          }
        }
      }
      return null;
    }

    const internetStatus = findLabelValue(["Internet Status", "Internet", "Status", "Connection Status"]);
    const connectionType = findLabelValue(["Connection Type", "Connection", "Type", "Network Type"]);
    return {
      internetStatus: internetStatus || null,
      connectionType: connectionType || null,
      rawSnippet: (document.body?.innerText || "").slice(0, 2000)
    };
  });
}

(async () => {
  let browser = null;
  try {
    browser = await launchBrowser();
  } catch (err) {
    console.error("Failed to launch browser:", err.message || err);
    console.error("Install Chrome/Edge or set CHROME_PATH to your browser binary.");
    process.exit(1);
  }

  const page = await browser.newPage();
  try {
    // 1) open login page
    await page.goto(ROUTER.url, { waitUntil: "networkidle2", timeout: 15000 });
    await delay(600);

    // 2) try to find password input (several possible selectors)
    const pwdSelectors = [
      "#pc-login-password",
      "#pc-setPwd-new",
      "#ph-login-password",
      "input[type=password]",
      "input#password",
      "input[name=passwd]"
    ];

    let foundSelector = null;
    for (const sel of pwdSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { foundSelector = sel; break; }
      } catch (e) {}
    }

    if (!foundSelector) {
      // maybe already logged in; try navigating to status directly
      const okDirect = await tryNavigateToStatus(page, ROUTER.url);
      if (!okDirect) {
        const snippet = sanitize(await page.evaluate(() => (document.body?.innerText || "").slice(0, 800)));
        console.error("Could not find password field and status page not reachable. Page snippet:\n", snippet);
        await browser.close();
        process.exit(2);
      }
    } else {
      // 3) populate password and call the in-page login function
      // set password value
      await page.evaluate((sel, pwd) => {
        const el = document.querySelector(sel);
        if (el) el.value = pwd;
      }, foundSelector, ROUTER.password);

      // Call page's login function if present.
      // Many MR200 pages define loginSubmit() or setPwdSubmit(). Call whichever exists.
      const called = await page.evaluate(() => {
        try {
          if (typeof loginSubmit === "function") { loginSubmit(); return "loginSubmit"; }
          if (typeof setPwdSubmit === "function") { setPwdSubmit(); return "setPwdSubmit"; }
          if (typeof cloudSubmit === "function") { cloudSubmit(); return "cloudSubmit"; }
          return null;
        } catch (e) { return null; }
      });

      // If we couldn't call the page function, fallback to clicking visible login buttons
      if (!called) {
        const loginBtnSelectors = [
          "#pc-login-btn",
          "#pc-setPwd-btn",
          "#ph-login-btn",
          "button[type=submit]",
          "input[type=button][value*=Login]",
          "button.button-button"
        ];
        let clicked = false;
        for (const bsel of loginBtnSelectors) {
          try {
            const btn = await page.$(bsel);
            if (btn) {
              await btn.click();
              clicked = true;
              break;
            }
          } catch (e) {}
        }
        if (!clicked) {
          // press Enter as last resort
          await page.keyboard.press("Enter");
        }
      }

      // give the router JS time to run login (it may do AJAX + redirect)
      await delay(1800);
    }

    // 4) force-visit status candidates (some firmwares don't auto-redirect)
    let navigated = false;
    for (const p of NAV_CANDIDATES) {
      try {
        const target = new URL(p, ROUTER.url).href;
        await page.goto(target, { waitUntil: "networkidle2", timeout: 8000 });
        const body = await page.content();
        if (body && body.length > 300 && /Internet Status|Connection Type|Network Map|Internet/i.test(body)) {
          navigated = true;
          break;
        }
      } catch (e) {}
    }

    if (!navigated) {
      // final check: maybe page is loaded but still blocked by login overlay text
      const snippet = sanitize(await page.evaluate(() => (document.body?.innerText || "").slice(0, 800)));
      console.error("Failed to reach status page after login attempts. Page snippet:\n", snippet);
      await browser.close();
      process.exit(2);
    }

    // 5) extract & print status
    const raw = await extractStatus(page);
    console.log("---- Router Status ----");
    console.log("Internet Status :", sanitize(raw.internetStatus) || "NOT FOUND");
    console.log("Connection Type :", sanitize(raw.connectionType) || "NOT FOUND");

  } catch (err) {
    console.error("Error during page interaction:", err.message || err);
  } finally {
    await browser.close();
  }
})();
