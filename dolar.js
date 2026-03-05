function blueDollarMonth(dateInput) {
  var tz = Session.getScriptTimeZone();
  Logger.log("[blueDollarMonth] Received dateInput: %s | typeof=%s | isDate=%s", dateInput, typeof dateInput, dateInput instanceof Date);
  Logger.log("[blueDollarMonth] Script timezone: %s", tz);

  var input = normalizeDate_(dateInput, tz);
  Logger.log("[blueDollarMonth] Normalized input: %s", input);

  var year = Number(Utilities.formatDate(input, tz, "yyyy"));
  var month0 = Number(Utilities.formatDate(input, tz, "M")) - 1; // 0-based
  Logger.log("[blueDollarMonth] Parsed year=%s | month0=%s", year, month0);

  var today = new Date();
  var currentYear = Number(Utilities.formatDate(today, tz, "yyyy"));
  var currentMonth0 = Number(Utilities.formatDate(today, tz, "M")) - 1; // 0-based
  Logger.log("[blueDollarMonth] Current year=%s | currentMonth0=%s", currentYear, currentMonth0);

  // =====================================
  // FUTURE MONTH: return latest value
  // =====================================
  if (year > currentYear || (year === currentYear && month0 > currentMonth0)) {
    Logger.log("[blueDollarMonth] Branch: future month -> /v2/latest");

    var latestResp = UrlFetchApp.fetch("https://api.bluelytics.com.ar/v2/latest", { muteHttpExceptions: true });
    Logger.log("[blueDollarMonth] /latest HTTP=%s", latestResp.getResponseCode());
    Logger.log("[blueDollarMonth] /latest body=%s", latestResp.getContentText());

    var latestData = JSON.parse(latestResp.getContentText());
    var latestValue = Number(latestData.blue.value_sell);

    Logger.log("[blueDollarMonth] Latest blue value_sell=%s", latestValue);
    return latestValue;
  }

  // =====================================
  // CURRENT MONTH: return latest value
  // =====================================
  if (year === currentYear && month0 === currentMonth0) {
    Logger.log("[blueDollarMonth] Branch: current month -> /v2/latest");

    var latestResp = UrlFetchApp.fetch("https://api.bluelytics.com.ar/v2/latest", { muteHttpExceptions: true });
    Logger.log("[blueDollarMonth] /latest HTTP=%s", latestResp.getResponseCode());
    Logger.log("[blueDollarMonth] /latest body=%s", latestResp.getContentText());

    var latestData = JSON.parse(latestResp.getContentText());
    var latestValue = Number(latestData.blue.value_sell);

    Logger.log("[blueDollarMonth] Latest blue value_sell=%s", latestValue);
    return latestValue;
  }

  // =====================================
  // PAST MONTH: return monthly average
  // =====================================
  Logger.log("[blueDollarMonth] Branch: historical monthly average");
  return getBlueMonthlyAverageWithCache_(year, month0);
}


function getBlueMonthlyAverageWithCache_(year, month0) {
  var monthHuman = month0 + 1; // 1..12
  var monthKey = year + "-" + String(monthHuman).padStart(2, "0");
  var props = PropertiesService.getScriptProperties();

  Logger.log("[getBlueMonthlyAverageWithCache_] year=%s | month0=%s | monthHuman=%s | monthKey=%s", year, month0, monthHuman, monthKey);

  var cached = props.getProperty(monthKey);
  Logger.log("[getBlueMonthlyAverageWithCache_] cache hit? %s | cached=%s", cached !== null, cached);

  if (cached !== null) {
    return Number(cached);
  }

  // Correct endpoint for historical series
  var url = "https://api.bluelytics.com.ar/v2/evolution.json?days=10000";
  Logger.log("[getBlueMonthlyAverageWithCache_] Request URL: %s", url);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log("[getBlueMonthlyAverageWithCache_] HTTP=%s", resp.getResponseCode());

  var body = resp.getContentText();
  Logger.log("[getBlueMonthlyAverageWithCache_] Body length=%s", body.length);

  if (resp.getResponseCode() !== 200) {
    Logger.log("[getBlueMonthlyAverageWithCache_] Error body=%s", body);
    throw new Error("Bluelytics request failed. HTTP " + resp.getResponseCode());
  }

  var historical = JSON.parse(body);
  Logger.log("[getBlueMonthlyAverageWithCache_] historical rows=%s", historical.length);

  var sum = 0;
  var count = 0;

  historical.forEach(function (row) {

    var y = Number(String(row.date).slice(0, 4));
    var m = Number(String(row.date).slice(5, 7)); // 1..12
    var source = String(row.source || "").toLowerCase();

    if (source === "blue" && y === year && m === monthHuman) {
      sum += Number(row.value_sell);
      count++;
    }

  });

  Logger.log("[getBlueMonthlyAverageWithCache_] Filtered rows count=%s | sum=%s", count, sum);

  if (count === 0) {
    Logger.log("[getBlueMonthlyAverageWithCache_] No matching data for monthKey=%s", monthKey);
    return 1;
  }

  var average = sum / count;
  Logger.log("[getBlueMonthlyAverageWithCache_] Computed average=%s", average);

  props.setProperty(monthKey, String(average)); // monthly cache
  Logger.log("[getBlueMonthlyAverageWithCache_] Cached %s=%s", monthKey, average);

  return average;
}


function normalizeDate_(dateInput, tz) {
  Logger.log("[normalizeDate_] Input=%s | typeof=%s | isDate=%s", dateInput, typeof dateInput, dateInput instanceof Date);

  if (dateInput instanceof Date) {
    Logger.log("[normalizeDate_] Returning Date directly");
    return dateInput;
  }

  if (typeof dateInput === "string") {

    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      var isoDate = new Date(dateInput + "T00:00:00-03:00");
      Logger.log("[normalizeDate_] Parsed yyyy-mm-dd -> %s", isoDate);
      return isoDate;
    }

    // d/m/yyyy or dd/mm/yyyy
    var match = dateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      var d = match[1].padStart(2, "0");
      var mo = match[2].padStart(2, "0");
      var y = match[3];

      var parsed = new Date(y + "-" + mo + "-" + d + "T00:00:00-03:00");
      Logger.log("[normalizeDate_] Parsed d/m/yyyy -> %s", parsed);
      return parsed;
    }
  }

  Logger.log("[normalizeDate_] Unsupported format. dateInput=%s", dateInput);
  throw new Error("Unsupported date format: " + dateInput);
}
