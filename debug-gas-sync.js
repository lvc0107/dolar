// debug-gas-sync.js
const { execFileSync } = require("node:child_process");

const store = new Map();

global.Session = {
  getScriptTimeZone: () => "America/Argentina/Buenos_Aires",
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (store.has(k) ? store.get(k) : null),
    setProperty: (k, v) => store.set(k, String(v)),
  }),
};

global.Utilities = {
  formatDate(date, tz, pattern) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;

    if (pattern === "yyyy") return year;
    if (pattern === "M") return String(Number(month));
    throw new Error(`Pattern no soportado: ${pattern}`);
  },
};

global.UrlFetchApp = {
  fetch: (url) => {
    const body = execFileSync("curl", ["-sL", url], { encoding: "utf8" });
    return {
      getContentText: () => body, // sync, como Apps Script
    };
  },
};
