// ─────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────

/**
 * Returns the latest blue-dollar sell value, caching it for 6 hours
 * in Script Properties to avoid hitting the API on every call.
 *
 * @return {number}
 */
function getLatestBlueCached_() {
  var props     = PropertiesService.getScriptProperties();
  var cachedVal = props.getProperty("LATEST_BLUE_VALUE");
  var cachedTs  = Number(props.getProperty("LATEST_BLUE_TS") || 0);
  var now       = Date.now();
  var TTL_MS    = 6 * 60 * 60 * 1000; // 6 hours
  var enable_cache = true;

  if (cachedVal !== null && (now - cachedTs) < TTL_MS) {
    Logger.log("[getLatestBlueCached_] Cache hit — value=%s, age=%s ms", cachedVal, now - cachedTs);
    if (enable_cache)
      return Number(cachedVal);
  }
  const URL = "https://api.bluelytics.com.ar/v2/latest"
  //const URL = "https://api.arqfinance.com/v1/tickers?currencies=ARS"
  Logger.log("[getLatestBlueCached_] Cache miss — fetching Bluelytics /latest");
  var resp = UrlFetchApp.fetch(URL, {
    muteHttpExceptions: true,
    headers: { "Accept": "application/json" }
  });
  var code = resp.getResponseCode();

  Logger.log("[getLatestBlueCached_] HTTP status=%s", code);

  if (code !== 200) {
    throw new Error("[getLatestBlueCached_] Bluelytics HTTP " + code);
  }

  var data = JSON.parse(resp.getContentText());

  if (!data || !data.blue || data.blue.value_sell == null) {
    throw new Error("[getLatestBlueCached_] Invalid Bluelytics response: " + resp.getContentText());
  }

  var value = Number(data.blue.value_sell);

  props.setProperty("LATEST_BLUE_VALUE", String(value));
  props.setProperty("LATEST_BLUE_TS",    String(now));

  Logger.log("[getLatestBlueCached_] Fetched and cached value=%s", value);
  return value;
}
// ─────────────────────────────────────────────

/**
 * Returns the monthly average blue-dollar sell value for the given year/month.
 * Uses Script Properties as a persistent cache; concurrent calls are serialised
 * with a script-level lock so only one HTTP request fires per month key.
 *
 * @param  {number} year   Full year, e.g. 2024
 * @param  {number} month0 Zero-based month (0 = January … 11 = December)
 * @return {number}        Monthly average, or 1 if no data found
 */
function getBlueMonthlyAverageWithCache_(year, month0) {
  var monthHuman = month0 + 1; // 1-based for API / cache key
  var monthKey   = year + "-" + String(monthHuman).padStart(2, "0");
  var props      = PropertiesService.getScriptProperties();
  var lock       = LockService.getScriptLock();

  Logger.log("[getBlueMonthlyAverageWithCache_] year=%s | month0=%s | monthKey=%s", year, month0, monthKey);

  lock.waitLock(30000);

  try {
    var cached = props.getProperty(monthKey);

    if (cached !== null) {
      Logger.log("[getBlueMonthlyAverageWithCache_] Cache hit — %s=%s", monthKey, cached);
      return Number(cached);
    }

    Logger.log("[getBlueMonthlyAverageWithCache_] Cache miss — fetching evolution.json");

    var url  = "https://api.bluelytics.com.ar/v2/evolution.json?days=10000";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = resp.getResponseCode();

    Logger.log("[getBlueMonthlyAverageWithCache_] HTTP status=%s | body length=%s", code, resp.getContentText().length);

    if (code !== 200) {
      throw new Error("[getBlueMonthlyAverageWithCache_] Bluelytics HTTP " + code + " — " + resp.getContentText());
    }

    var historical = JSON.parse(resp.getContentText());

    Logger.log("[getBlueMonthlyAverageWithCache_] Total rows in response=%s", historical.length);

    var sum = 0;
    var count = 0;

    historical.forEach(function (row) {
      var rowYear   = Number(String(row.date).slice(0, 4));
      var rowMonth  = Number(String(row.date).slice(5, 7)); // 1-based
      var rowSource = String(row.source || "").toLowerCase();

      if (rowSource === "blue" && rowYear === year && rowMonth === monthHuman) {
        sum   += Number(row.value_sell);
        count += 1;
      }
    });

    Logger.log("[getBlueMonthlyAverageWithCache_] Matching rows=%s | sum=%s", count, sum);

    if (count === 0) {
      Logger.log("[getBlueMonthlyAverageWithCache_] No data for %s — returning 1", monthKey);
      return 1;
    }

    var average = sum / count;

    props.setProperty(monthKey, String(average));

    Logger.log("[getBlueMonthlyAverageWithCache_] Computed and cached %s=%s", monthKey, average);
    return average;

  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────

/**
 * Normalises a date input into a JavaScript Date object.
 * Accepted formats: Date object, "yyyy-MM-dd", "d/M/yyyy" (or "dd/MM/yyyy").
 *
 * @param  {Date|string} dateInput
 * @param  {string}      tz  IANA time-zone string (e.g. "America/Argentina/Buenos_Aires")
 * @return {Date}
 */
function normalizeDate_(dateInput, tz) {
  Logger.log("[normalizeDate_] Input=%s | typeof=%s | isDate=%s", dateInput, typeof dateInput, dateInput instanceof Date);

  if (dateInput instanceof Date) {
    Logger.log("[normalizeDate_] Input is already a Date — returning as-is");
    return dateInput;
  }

  if (typeof dateInput === "string") {
    // yyyy-MM-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      var isoDate = new Date(dateInput + "T00:00:00-03:00");
      Logger.log("[normalizeDate_] Parsed yyyy-MM-dd → %s", isoDate);
      return isoDate;
    }

    // d/M/yyyy or dd/MM/yyyy
    var match = dateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      var d      = match[1].padStart(2, "0");
      var mo     = match[2].padStart(2, "0");
      var y      = match[3];
      var parsed = new Date(y + "-" + mo + "-" + d + "T00:00:00-03:00");
      Logger.log("[normalizeDate_] Parsed d/M/yyyy → %s", parsed);
      return parsed;
    }
  }

  throw new Error("[normalizeDate_] Unsupported date format: " + dateInput);
}

// ─────────────────────────────────────────────
// PUBLIC SHEET FUNCTION
// ─────────────────────────────────────────────

/**
 * Returns the blue-dollar sell rate for the month that contains `dateInput`.
 *  - Past month  → monthly average (cached permanently)
 *  - Current month → latest value (cached 6 h)
 *  - Future month  → latest value (cached 6 h)
 *
 * @param  {Date|string} dateInput  Any supported date; omit/blank for today.
 * @return {number}
 * @customfunction
 */
function blueDollarMonth(dateInput) {
  var tz = Session.getScriptTimeZone();

  // Default: null / empty → today
  if (dateInput == null || dateInput === "") {
    dateInput = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    Logger.log("[blueDollarMonth] No input — defaulting to today: %s", dateInput);
  }

  Logger.log(
    "[blueDollarMonth] dateInput=%s | typeof=%s | isDate=%s | tz=%s",
    dateInput, typeof dateInput, dateInput instanceof Date, tz
  );

  var input      = normalizeDate_(dateInput, tz);
  var year       = Number(Utilities.formatDate(input, tz, "yyyy"));
  var month0     = Number(Utilities.formatDate(input, tz, "M")) - 1; // 0-based

  var today         = new Date();
  var currentYear   = Number(Utilities.formatDate(today, tz, "yyyy"));
  var currentMonth0 = Number(Utilities.formatDate(today, tz, "M")) - 1; // 0-based

  Logger.log(
    "[blueDollarMonth] input year=%s month0=%s | current year=%s month0=%s",
    year, month0, currentYear, currentMonth0
  );

  // ── Future month ──────────────────────────────
  if (year > currentYear || (year === currentYear && month0 > currentMonth0)) {
    Logger.log("[blueDollarMonth] Future month → returning latest cached value");
    return getLatestBlueCached_();
  }

  // ── Current month ─────────────────────────────
  if (year === currentYear && month0 === currentMonth0) {
    Logger.log("[blueDollarMonth] Current month → returning latest cached value");
    return getLatestBlueCached_();
  }

  // ── Past month ────────────────────────────────
  Logger.log("[blueDollarMonth] Past month → returning monthly average");
  return getBlueMonthlyAverageWithCache_(year, month0);
}

// ─────────────────────────────────────────────
// FREEZE TRIGGER — replaces past-month formulas with static values
// ─────────────────────────────────────────────

/**
 * Iterates every cell in the active sheet and replaces any
 * `=blueDollarMonth(…)` formula that refers to a past month
 * with its current numeric value, preventing future API calls.
 *
 * Run manually or install via `installFreezeTrigger()`.
 */
function freezePastMonthCells() {
  var tz      = Session.getScriptTimeZone();
  var sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range   = sheet.getDataRange();
  var formulas = range.getFormulas();
  var values   = range.getValues();

  var today         = new Date();
  var currentYear   = Number(Utilities.formatDate(today, tz, "yyyy"));
  var currentMonth0 = Number(Utilities.formatDate(today, tz, "M")) - 1;

  Logger.log(
    "[freezePastMonthCells] Starting — sheet='%s' | rows=%s | cols=%s | current=%s-%s",
    sheet.getName(), formulas.length, (formulas[0] || []).length, currentYear, currentMonth0 + 1
  );

  var frozenCount = 0;

  for (var row = 0; row < formulas.length; row++) {
    for (var col = 0; col < formulas[row].length; col++) {
      var formula = formulas[row][col];

      if (!formula || formula.toLowerCase().indexOf("bluedollarmonth") === -1) continue;

      var currentValue = values[row][col];

      if (!currentValue || isNaN(Number(currentValue))) {
        Logger.log("[freezePastMonthCells] Skipping R%sC%s — value is empty or NaN: %s", row + 1, col + 1, currentValue);
        continue;
      }

      var match = formula.match(/blueDollarMonth\(([^)]*)\)/i);
      if (!match) {
        Logger.log("[freezePastMonthCells] Skipping R%sC%s — regex found no arg in: %s", row + 1, col + 1, formula);
        continue;
      }

      var arg       = match[1].trim();
      var dateInput;

      if (/^[A-Z]+\d+$/i.test(arg)) {
        dateInput = sheet.getRange(arg).getValue();
        Logger.log("[freezePastMonthCells] R%sC%s — arg is cell ref %s → value=%s", row + 1, col + 1, arg, dateInput);
      } else {
        dateInput = arg.replace(/^["']|["']$/g, "");
        Logger.log("[freezePastMonthCells] R%sC%s — arg is literal: %s", row + 1, col + 1, dateInput);
      }

      if (!dateInput) {
        Logger.log("[freezePastMonthCells] Skipping R%sC%s — dateInput resolved to empty", row + 1, col + 1);
        continue;
      }

      try {
        var input  = normalizeDate_(dateInput, tz);
        var year   = Number(Utilities.formatDate(input, tz, "yyyy"));
        var month0 = Number(Utilities.formatDate(input, tz, "M")) - 1;
        var isPast = year < currentYear || (year === currentYear && month0 < currentMonth0);

        Logger.log(
          "[freezePastMonthCells] R%sC%s — year=%s month0=%s isPast=%s",
          row + 1, col + 1, year, month0, isPast
        );

        if (!isPast) continue;

        sheet.getRange(row + 1, col + 1).setValue(Number(currentValue));
        frozenCount += 1;

        Logger.log("[freezePastMonthCells] Frozen R%sC%s = %s", row + 1, col + 1, currentValue);

      } catch (e) {
        Logger.log("[freezePastMonthCells] Skipped R%sC%s — %s", row + 1, col + 1, e.message);
      }
    }
  }

  Logger.log("[freezePastMonthCells] Done — %s cell(s) frozen.", frozenCount);
}

// ─────────────────────────────────────────────

/**
 * Installs (or re-installs) a daily trigger that runs `freezePastMonthCells`
 * at 03:00 in the script's time zone.
 */
function installFreezeTrigger() {
  Logger.log("[installFreezeTrigger] Removing existing freezePastMonthCells triggers");

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "freezePastMonthCells") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("freezePastMonthCells")
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log("[installFreezeTrigger] Daily trigger installed — runs at 03:00.");
}