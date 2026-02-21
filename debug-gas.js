const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const _props = new Map();

global.Session = {
  getScriptTimeZone: () => "America/Argentina/Buenos_Aires",
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => _props.get(k) ?? null,
    setProperty: (k, v) => _props.set(k, String(v)),
  }),
};

global.UrlFetchApp = {
  fetch: (url) => ({
    getContentText: async () => {
      const res = await fetch(url);
      return await res.text();
    },
  }),
};

// debug-gas.js
global.Utilities = {
  formatDate(date, tz, pattern) {
    // Supports only patterns you use: "yyyy" and "M"
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);

    const year = parts.find(p => p.type === "year")?.value;
    const month = parts.find(p => p.type === "month")?.value;

    if (pattern === "yyyy") return year;
    if (pattern === "M") return String(Number(month)); // no leading zero
    throw new Error(`Unsupported pattern in mock Utilities.formatDate: ${pattern}`);
  },
};
