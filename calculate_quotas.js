function calculateColumns() {
  var startTime = new Date().getTime();

  Logger.log("=== START calculateColumns ===");

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  var START_ROW = 20;
  var END_ROW = 200;

  // Columns
  var COL_C = 3;
  var COL_S = 19;
  var COL_W = 23;
  var COL_X = 24;
  var COL_Y = 25;

  // Business constants
  var TOTAL_INSTALLMENTS = 84;
  var PAYMENT_BASE = 30000;
  var INITIAL_PHASE_LIMIT = 20500;
  var INSTALLMENT_AMOUNT = 500;

  Logger.log("Calling SpreadsheetApp.flush()");

  t1 = new Date().getTime();

  SpreadsheetApp.flush();

  Logger.log(
    "Flush completed in " +
      ((new Date().getTime() - t1) / 1000) +
      " sec"
  );

  Logger.log("Reading previous values");

  t1 = new Date().getTime();

  var s_prev =
    Number(sheet.getRange(START_ROW - 1, COL_S).getValue()) || 3749;

  var w_prev =
    Number(sheet.getRange(START_ROW - 1, COL_W).getValue()) || s_prev;

  var installments_paid =
    Number(sheet.getRange(START_ROW - 1, COL_Y).getValue()) || 0;

  var initial_phase = true;

  Logger.log(
    "Previous values loaded in " +
      ((new Date().getTime() - t1) / 1000) +
      " sec"
  );

  Logger.log("Reading data block");

  t1 = new Date().getTime();

  var data = sheet
    .getRange(
      START_ROW,
      1,
      END_ROW - START_ROW + 1,
      COL_Y
    )
    .getValues();

  Logger.log(
    "Data block loaded in " +
      ((new Date().getTime() - t1) / 1000) +
      " sec"
  );

  Logger.log("Starting main loop");

  t1 = new Date().getTime();

  for (var i = 0; i < data.length; i++) {

    if (i % 10 === 0) {
      Logger.log(
        "Main loop row " +
          (START_ROW + i) +
          " elapsed: " +
          ((new Date().getTime() - t1) / 1000) +
          " sec"
      );
    }

    var row = data[i];
    var rowNum = START_ROW + i;
    var c = row[COL_C - 1];

    if (c === "" || c === null) {

      Logger.log("Empty row found: " + rowNum);

      sheet.getRange(rowNum, COL_W).clearContent();
      sheet.getRange(rowNum, COL_X).setValue("");
      sheet.getRange(rowNum, COL_Y).setValue(installments_paid);

      continue;
    }

    var s = Number(row[COL_S - 1]) || 0;
    var ingreso_mes = s - s_prev;
    var w_available = w_prev + ingreso_mes;

    var w, installments_to_pay;

    var remaining_installments =
      TOTAL_INSTALLMENTS - installments_paid;

    var plan_finished =
      c >= remaining_installments;

    if (plan_finished) {
      w = w_available;
      installments_to_pay = 0;
    } else if (
      initial_phase &&
      w_available <= INITIAL_PHASE_LIMIT
    ) {
      w = w_available;
      installments_to_pay = 0;
    } else {
      initial_phase = false;

      var surplus =
        w_available - PAYMENT_BASE;

      var x;

      if (surplus <= 0) {
        x = 0;
      } else if (surplus <= INSTALLMENT_AMOUNT) {
        x = 1;
      } else {
        x = Math.floor(
          surplus / INSTALLMENT_AMOUNT
        );
      }

      installments_to_pay =
        Math.min(
          x,
          remaining_installments
        );

      w =
        w_available -
        installments_to_pay * INSTALLMENT_AMOUNT;
    }

    var x_value;

    if (plan_finished) {
      x_value = "Plan Finished";
    } else if (
      installments_to_pay === 0
    ) {
      x_value = "None";
    } else {
      var last_installment =
        TOTAL_INSTALLMENTS - installments_paid;

      var first_installment =
        last_installment -
        installments_to_pay +
        1;

      if (
        installments_to_pay === 1
      ) {
        x_value =
          String(last_installment);
      } else {
        x_value =
          last_installment +
          " to " +
          first_installment;
      }
    }

    var y_value =
      installments_paid +
      installments_to_pay;

    sheet.getRange(rowNum, COL_W)
      .setValue(w);

    sheet.getRange(rowNum, COL_X)
      .setValue(x_value);

    sheet.getRange(rowNum, COL_Y)
      .setValue(y_value);

    s_prev = s;
    w_prev = w;
    installments_paid = y_value;

    if (y_value >= TOTAL_INSTALLMENTS) {
      Logger.log(
        "Plan completed at row " +
        rowNum
      );
      break;
    }
  }

  Logger.log(
    "Main loop completed in " +
      ((new Date().getTime() - t1) / 1000) +
      " sec"
  );

  Logger.log(
    "TOTAL EXECUTION TIME: " +
      ((new Date().getTime() - startTime) / 1000) +
      " sec"
  );

  SpreadsheetApp.getUi().alert(
    "Columns W, X and Y updated."
  );
}