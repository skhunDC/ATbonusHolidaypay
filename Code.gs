"use strict";

/** onInstall: run setup */
function onInstall() {
  setup();
}

/** Setup - ensures nightly trigger and sheet setup */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const timeZone = Session.getScriptTimeZone();
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'recomputeBonuses') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('recomputeBonuses')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .inTimezone('America/New_York')
    .create();
  ['MonthlyBonus', 'AnnualBonus'].forEach(name => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });
}

/** Import UKG roster from CSV */
function importRoster(csvBlob) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('UKGDat');
  const rows = Utilities.parseCsv(csvBlob.getDataAsString());
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  recomputeBonuses();
}

/** Add an absence row */
function addAbsence(empId, date, type) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Absenses');
  sheet.appendRow([empId, date, type]);
  recomputeBonuses();
}

/** Update or create holiday row */
function updateHoliday(date, name, busy) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Holiday');
  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd') === date) {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[date, name, !!busy]]);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([date, name, !!busy]);
  }
  recomputeBonuses();
}

/** Compute bonuses and holiday pay */
function recomputeBonuses() {
  const ss = SpreadsheetApp.getActive();
  const uk = ss.getSheetByName('UKGDat').getDataRange().getValues();
  const abs = ss.getSheetByName('Absenses').getDataRange().getValues();
  const hol = ss.getSheetByName('Holiday').getDataRange().getValues();
  const monthly = ss.getSheetByName('MonthlyBonus');
  const annual = ss.getSheetByName('AnnualBonus');

  monthly.clearContents();
  annual.clearContents();

  const headersM = ['EmpID', 'Name', 'Dept', 'YearMonth', 'Bonus'];
  const headersA = ['EmpID', 'Name', 'Dept', 'Year', 'Bonus'];
  monthly.appendRow(headersM);
  annual.appendRow(headersA);

  const employees = {};
  for (let i = 1; i < uk.length; i++) {
    const [empId, status, hireDate, firstName, lastName, dept] = uk[i];
    employees[empId] = { status, hireDate: new Date(hireDate), firstName, lastName, dept };
  }

  const absByEmpMonth = {};
  const absByEmpYear = {};
  for (let i = 1; i < abs.length; i++) {
    const [empId, date, type] = abs[i];
    if (!employees[empId]) continue;
    const d = new Date(date);
    const ym = Utilities.formatDate(d, 'UTC', 'yyyyMM');
    const y = d.getFullYear();
    const isInfraction = type.toUpperCase() !== 'PTO' && type.toUpperCase() !== 'VACATION';
    if (isInfraction) {
      absByEmpMonth[empId + '_' + ym] = (absByEmpMonth[empId + '_' + ym] || 0) + 1;
      absByEmpYear[empId + '_' + y] = (absByEmpYear[empId + '_' + y] || 0) + 1;
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  for (const empId in employees) {
    const emp = employees[empId];
    const name = emp.firstName + ' ' + emp.lastName;

    for (let m = 0; m < 12; m++) {
      const ym = Utilities.formatDate(new Date(year, m, 1), 'UTC', 'yyyyMM');
      const inf = absByEmpMonth[empId + '_' + ym] || 0;
      let bonus = 0;
      if (inf === 0) {
        bonus = emp.status === 'FT' ? 100 : 50;
        const month = m + 1;
        if (month === 5 || month === 10) bonus *= 2; // busy months
      }
      monthly.appendRow([empId, name, emp.dept, ym, bonus]);
    }

    const infractionsYTD = absByEmpYear[empId + '_' + year] || 0;
    let annualBonus = 0;
    if (emp.status === 'FT') {
      if (infractionsYTD === 0) annualBonus = 300;
      else if (infractionsYTD === 1) annualBonus = 275;
      else if (infractionsYTD === 2) annualBonus = 250;
      const monthsWorked = monthsBetween(emp.hireDate, new Date(year, 11, 31));
      if (monthsWorked < 6) annualBonus = 0;
      else if (monthsWorked < 12) annualBonus = annualBonus * (monthsWorked / 12);
    }
    annual.appendRow([empId, name, emp.dept, year, +annualBonus.toFixed(2)]);
  }
}

/** Helper months difference */
function monthsBetween(start, end) {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  return months;
}

/** Export Monthly Bonus CSV */
function exportMonthlyBonusCsv(yyyyMM) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('MonthlyBonus');
  const data = sheet.getDataRange().getValues();
  const out = [data[0]];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]) === String(yyyyMM)) out.push(data[i]);
  }
  const csv = out.map(r => r.join(',')).join('\n');
  return Utilities.newBlob(csv, 'text/csv', 'MonthlyBonus_' + yyyyMM + '.csv');
}

/** Export Annual Bonus CSV */
function exportAnnualBonusCsv(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('AnnualBonus');
  const data = sheet.getDataRange().getValues();
  const out = [data[0]];
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][3]) === Number(year)) out.push(data[i]);
  }
  const csv = out.map(r => r.join(',')).join('\n');
  return Utilities.newBlob(csv, 'text/csv', 'AnnualBonus_' + year + '.csv');
}

/** Export Holiday Pay CSV */
function exportHolidayPayCsv(year) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Holiday');
  const hol = sheet.getDataRange().getValues();
  const abs = SpreadsheetApp.getActive().getSheetByName('Absenses').getDataRange().getValues();
  const empSheet = SpreadsheetApp.getActive().getSheetByName('UKGDat').getDataRange().getValues();

  const employees = {};
  for (let i = 1; i < empSheet.length; i++) {
    const [empId, status, hireDate, firstName, lastName, dept] = empSheet[i];
    employees[empId] = { status, hireDate: new Date(hireDate), firstName, lastName, dept };
  }

  const infractions = {};
  for (let i = 1; i < abs.length; i++) {
    const [empId, d, type] = abs[i];
    const date = Utilities.formatDate(new Date(d), 'UTC', 'yyyy-MM-dd');
    infractions[empId + '_' + date] = type;
  }

  const header = ['EmpID', 'Name', 'HolidayDate', 'Hours'];
  const result = [header];

  hol.slice(1).forEach(r => {
    const hDate = Utilities.formatDate(new Date(r[0]), 'UTC', 'yyyy-MM-dd');
    const avg = r[3];
    for (const id in employees) {
      const emp = employees[id];
      const tenure = monthsBetween(emp.hireDate, new Date(hDate));
      if (tenure < 6) continue;
      const prev = new Date(r[0]);
      prev.setDate(prev.getDate() - 1);
      const next = new Date(r[0]);
      next.setDate(next.getDate() + 1);
      const prevKey = id + '_' + Utilities.formatDate(prev, 'UTC', 'yyyy-MM-dd');
      const nextKey = id + '_' + Utilities.formatDate(next, 'UTC', 'yyyy-MM-dd');
      if (infractions[prevKey] || infractions[nextKey]) continue;
      result.push([id, emp.firstName + ' ' + emp.lastName, hDate, avg]);
    }
  });

  const csv = result.map(r => r.join(',')).join('\n');
  return Utilities.newBlob(csv, 'text/csv', 'HolidayPay_' + year + '.csv');
}

/** Simple data provider for dashboard */
function getDashboardData(year, month) {
  recomputeBonuses();
  const ss = SpreadsheetApp.getActive();
  const uk = ss.getSheetByName('UKGDat').getDataRange().getValues();
  const abs = ss.getSheetByName('Absenses').getDataRange().getValues();
  const monthly = ss.getSheetByName('MonthlyBonus').getDataRange().getValues();
  const annual = ss.getSheetByName('AnnualBonus').getDataRange().getValues();

  const employees = {};
  for (let i = 1; i < uk.length; i++) {
    const [empId, status, hireDate, firstName, lastName, dept] = uk[i];
    employees[empId] = { status, hireDate, firstName, lastName, dept, infractions: 0 };
  }
  for (let i = 1; i < abs.length; i++) {
    const [empId, d, type] = abs[i];
    const isInf = type.toUpperCase() !== 'PTO' && type.toUpperCase() !== 'VACATION';
    if (isInf && employees[empId]) employees[empId].infractions++;
  }
  const dash = [];
  for (const id in employees) {
    const emp = employees[id];
    const ym = String(year) + String(month).padStart(2, '0');
    const rowM = monthly.find(r => String(r[0]) === id && String(r[3]) === ym);
    const rowA = annual.find(r => String(r[0]) === id && Number(r[3]) === Number(year));
    dash.push({
      empId: id,
      name: emp.firstName + ' ' + emp.lastName,
      dept: emp.dept,
      monthStatus: rowM ? rowM[4] > 0 : 0,
      annualTier: rowA ? rowA[4] : 0,
      ytdAbs: emp.infractions
    });
  }
  return dash;
}

/** Get detail for one employee */
function getEmployeeDetail(empId) {
  const ss = SpreadsheetApp.getActive();
  const uk = ss.getSheetByName('UKGDat').getDataRange().getValues();
  const abs = ss.getSheetByName('Absenses').getDataRange().getValues();
  const annual = ss.getSheetByName('AnnualBonus').getDataRange().getValues();

  const empRow = uk.find(r => String(r[0]) === String(empId));
  if (!empRow) return null;
  const emp = {
    empId: empRow[0],
    status: empRow[1],
    hireDate: empRow[2],
    firstName: empRow[3],
    lastName: empRow[4],
    dept: empRow[5],
    infractions: []
  };
  for (let i = 1; i < abs.length; i++) {
    if (String(abs[i][0]) === String(empId)) {
      emp.infractions.push({ date: abs[i][1], type: abs[i][2] });
    }
  }
  const year = new Date().getFullYear();
  const rowA = annual.find(r => String(r[0]) === String(empId) && Number(r[3]) === year);
  if (rowA) emp.annualBonus = rowA[4];
  return emp;
}

/** Serve index.html */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

/** QUnitGS2 Tests */
function test_recomputeBonuses() {
  const q = QUnitGS2.init();
  QUnit.module('Bonus');
  QUnit.test('recomputeBonuses runs', function (assert) {
    recomputeBonuses();
    assert.ok(true, 'recomputeBonuses executed');
  });
  return QUnitGS2.report();
}
