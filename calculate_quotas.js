function calculateColumns() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  var START_ROW = 20;
  var END_ROW = 200;
  var COL_C = 3;
  var COL_S = 19;
  var COL_W = 23;
  var COL_X = 24;
  var COL_Y = 25;

  // Restaurar fórmulas de S primero
  for (var r = START_ROW; r <= END_ROW; r++) {
    var c_val = sheet.getRange(r, COL_C).getValue();
    if (c_val === "" || c_val === null) break;
    sheet.getRange(r, COL_S).setFormula("=S" + (r-1) + "+SUM(O" + r + ":R" + r + ")");
  }
  SpreadsheetApp.flush();

  // Leer valores iniciales de la fila anterior al loop
  var s_prev = Number(sheet.getRange(START_ROW - 1, COL_S).getValue()) || 3749;
  var w_prev = Number(sheet.getRange(START_ROW - 1, COL_W).getValue()) || s_prev;
  var installments_paid = Number(sheet.getRange(START_ROW - 1, COL_Y).getValue()) || 0;
  var initial_phase = true;

  // Leer todos los datos ya con S calculado
  var data = sheet.getRange(START_ROW, 1, END_ROW - START_ROW + 1, COL_Y).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowNum = START_ROW + i;
    var c = row[COL_C - 1];

    if (c === "" || c === null) {
      sheet.getRange(rowNum, COL_W).clearContent();
      sheet.getRange(rowNum, COL_X).setValue("");
      sheet.getRange(rowNum, COL_Y).setValue(installments_paid);
      continue;
    }

    var s = Number(row[COL_S - 1]) || 0;
    var ingreso_mes = s - s_prev;
    var w_available = w_prev + ingreso_mes;

    var w, installments_to_pay;
    var remaining_installments = 84 - installments_paid;
    var plan_finished = c >= remaining_installments;

    if (plan_finished) {
      w = w_available;
      installments_to_pay = 0;
    } else if (initial_phase && w_available <= 20500) {
      w = w_available;
      installments_to_pay = 0;
    } else {
      initial_phase = false;
      var surplus = w_available - 20000;
      var x;
      if (surplus <= 0) {
        x = 0;
      } else if (surplus <= 500) {
        x = 1;
      } else {
        x = Math.floor(surplus / 500);
      }
      installments_to_pay = Math.min(x, remaining_installments);
      w = w_available - (installments_to_pay * 500);
    }

    var x_value;
    if (plan_finished) {
      x_value = "Plan Finished";
    } else if (installments_to_pay === 0) {
      x_value = "None";
    } else {
      var last_installment = 84 - installments_paid;
      var first_installment = last_installment - installments_to_pay + 1;
      if (installments_to_pay === 1) {
        x_value = String(last_installment);
      } else {
        x_value = first_installment + " to " + last_installment;
      }
    }

    var y_value = installments_paid + installments_to_pay;

    sheet.getRange(rowNum, COL_W).setValue(w);
    sheet.getRange(rowNum, COL_X).setValue(x_value);
    sheet.getRange(rowNum, COL_Y).setValue(y_value);

    s_prev = s;
    w_prev = w;
    installments_paid = y_value;

    if (y_value >= 84) break;
  }

  SpreadsheetApp.getUi().alert("Columns S, W, X and Y updated.");
}