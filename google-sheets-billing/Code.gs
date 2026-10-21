/**
 * नीरज ज्वैलर्स - Billing System
 * Google Sheets + Apps Script (bilkul free, koi server nahi)
 *
 * Is file mein: menu, calculation, invoice number, PDF, Sales History, search.
 */

var SETTINGS_SHEET = 'Settings';
var HISTORY_SHEET = 'Sales History';
var TZ = 'Asia/Kolkata'; // India ka time zone, taaki date sahi aaye

// Pehli baar Settings sheet mein yahi values bharengi. Baad mein sheet se hi badlo.
var DEFAULT_SETTINGS = [
  ['Shop Name (Hindi)', 'नीरज ज्वैलर्स'],
  ['Shop Name (English)', 'NEERAJ JEWELLERS'],
  ['Tagline', 'Gold & Silver Jewellery'],
  ['Address', '11, Arijit Prasad Marg, Dehradun'],
  ['Phone', '8923573805, 9536005642'],
  ['GSTIN', ''],
  ['GST Rate (%)', 3],
  ['Invoice Prefix', 'NJ-'],
  ['Next Invoice No', 1],
  ['PDF Folder ID', ''],
  ['Terms', 'Goods once sold will not be taken back.|Weight checked & accepted in front of customer.|Subject to Dehradun jurisdiction.']
];

// Sheet khulte hi ye chalta hai: menu banata hai aur zaroori sheets bana deta hai
function onOpen() {
  setupSheets();
  SpreadsheetApp.getUi().createMenu('💎 Neeraj Jewellers')
    .addItem('🧾 Naya Bill', 'showBillForm')
    .addItem('🔍 Bill Dhoondho', 'searchBill')
    .addToUi();
}

// Settings aur Sales History sheet nahi hain to bana do
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SETTINGS_SHEET)) {
    var s = ss.insertSheet(SETTINGS_SHEET);
    s.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]).setFontWeight('bold');
    s.getRange(2, 1, DEFAULT_SETTINGS.length, 2).setValues(DEFAULT_SETTINGS);
    s.setColumnWidth(1, 180);
    s.setColumnWidth(2, 500);
  }
  if (!ss.getSheetByName(HISTORY_SHEET)) {
    var h = ss.insertSheet(HISTORY_SHEET);
    h.appendRow(['Date', 'Invoice No', 'Customer', 'Mobile', 'Total (₹)', 'GST', 'PDF Link']);
    h.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#5a0f1d').setFontColor('#f3dfa8');
    h.setFrozenRows(1);
    h.getRange('A:A').setNumberFormat('dd-mm-yyyy');
    h.getRange('E:E').setNumberFormat('#,##0');
  }
}

// Settings sheet ko { 'Setting naam': value } object mein padho
function getSettings() {
  var rows = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET).getDataRange().getValues();
  var s = {};
  rows.forEach(function (r) { s[r[0]] = r[1]; });
  return s;
}

// Settings sheet mein ek value badlo (jaise Next Invoice No)
function setSetting(key, value) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET);
  var keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

// "Naya Bill" button: popup form kholo
function showBillForm() {
  setupSheets();
  var t = HtmlService.createTemplateFromFile('Form');
  t.gstRate = getSettings()['GST Rate (%)'] || 3;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(860).setHeight(640), 'Naya Bill – Neeraj Jewellers');
}

// ---------- Calculation (paise ka hisaab) ----------

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Form ka data check karo. Galti ho to Hinglish message ke saath error
function validateForm(form) {
  if (!form || !String(form.name || '').trim()) throw new Error('Customer ka naam likho.');
  if (form.mobile && !/^\d{10}$/.test(String(form.mobile).trim())) throw new Error('Mobile number 10 digit ka hona chahiye.');
  if (!form.items || !form.items.length) throw new Error('Kam se kam ek item jodo.');
  form.items.forEach(function (it, i) {
    var n = 'Item ' + (i + 1) + ': ';
    if (!String(it.name || '').trim()) throw new Error(n + 'item ka naam likho.');
    if (!(Number(it.weight) > 0)) throw new Error(n + 'weight 0 se zyada hona chahiye.');
    if (!(Number(it.rate) > 0)) throw new Error(n + 'rate 0 se zyada hona chahiye.');
    if (!(Number(it.qty) >= 1) || Number(it.qty) % 1 !== 0) throw new Error(n + 'quantity 1, 2, 3... jaisi poori ginti ho.');
  });
  if (form.gst && !(Number(form.gstRate) >= 0 && Number(form.gstRate) <= 28)) throw new Error('GST rate 0 se 28 ke beech ho.');
}

// Amount = weight x rate x qty. Phir subtotal, GST (CGST + SGST aadha-aadha), round-off, total
function calculateBill(form) {
  var items = form.items.map(function (it) {
    var weight = Number(it.weight), rate = Number(it.rate), qty = Number(it.qty);
    return { name: String(it.name).trim(), type: it.type || 'Other', weight: weight, rate: rate, qty: qty,
             amount: round2(weight * rate * qty) };
  });
  var subtotal = round2(items.reduce(function (sum, it) { return sum + it.amount; }, 0));
  var gstRate = form.gst ? Number(form.gstRate) : 0;
  var gst = round2(subtotal * gstRate / 100);
  var cgst = round2(gst / 2);
  var sgst = round2(gst - cgst);
  var beforeRound = round2(subtotal + gst);
  var total = Math.round(beforeRound);
  return { items: items, subtotal: subtotal, gst: !!form.gst, gstRate: gstRate, cgst: cgst, sgst: sgst,
           roundOff: round2(total - beforeRound), total: total };
}

// Indian style number: 1,23,456.00
function inr(n) {
  var parts = Math.abs(n).toFixed(2).split('.');
  var x = parts[0], last3 = x.slice(-3), rest = x.slice(0, -3);
  if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return (n < 0 ? '-' : '') + last3 + '.' + parts[1];
}

// 12500 -> "Rupees Twelve Thousand Five Hundred Only" (Lakh/Crore wala Indian system)
function amountInWords(n) {
  var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
              'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(x) { return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''); }
  function three(x) {
    return (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + two(x % 100);
  }
  n = Math.round(n);
  if (n === 0) return 'Rupees Zero Only';
  var crore = Math.floor(n / 10000000), lakh = Math.floor(n / 100000) % 100,
      thousand = Math.floor(n / 1000) % 100, rest = n % 1000, words = [];
  if (crore) words.push((crore > 999 ? amountInWords(crore).slice(7, -5) : three(crore)) + ' Crore');
  if (lakh) words.push(two(lakh) + ' Lakh');
  if (thousand) words.push(two(thousand) + ' Thousand');
  if (rest) words.push(three(rest));
  return 'Rupees ' + words.join(' ') + ' Only';
}

// ---------- Bill banana (form ka "Bill Banao" button yahi chalata hai) ----------

function createBill(form) {
  validateForm(form);
  var bill = calculateBill(form); // hisaab server pe dobara, form ke number pe bharosa nahi
  bill.customer = { name: String(form.name).trim(), mobile: String(form.mobile || '').trim(),
                    address: String(form.address || '').trim() };

  // Lock: do log ek saath bill banayein to bhi invoice number same na ho
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var s = getSettings();
    var no = Number(s['Next Invoice No']) || 1;
    bill.invoiceNo = (s['Invoice Prefix'] || '') + String(no).padStart(4, '0');
    bill.date = Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy');
    bill.amountWords = amountInWords(bill.total);
    bill.shop = {
      nameHi: s['Shop Name (Hindi)'], nameEn: s['Shop Name (English)'], tagline: s['Tagline'],
      address: s['Address'], phone: String(s['Phone'] || ''), gstin: String(s['GSTIN'] || ''),
      terms: String(s['Terms'] || '').split('|').filter(String)
    };

    // Invoice HTML -> PDF -> Drive folder
    var html = renderInvoice(bill);
    var pdf = Utilities.newBlob(html, 'text/html', bill.invoiceNo + '.html').getAs('application/pdf')
      .setName(bill.invoiceNo + ' - ' + bill.customer.name + '.pdf');
    var file = getInvoiceFolder(s).createFile(pdf);

    // Sales History mein record
    SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET).appendRow([
      new Date(), bill.invoiceNo, bill.customer.name, bill.customer.mobile, bill.total,
      bill.gst ? 'Haan' : 'Nahi', file.getUrl()
    ]);

    // Sab ho gaya, tabhi agla number. PDF fail ho to number waste nahi hoga
    setSetting('Next Invoice No', no + 1);
    return { invoiceNo: bill.invoiceNo, total: inr(bill.total), pdfUrl: file.getUrl(), html: html };
  } finally {
    lock.releaseLock();
  }
}

// Invoice.html template mein bill data bhar ke poora HTML do
function renderInvoice(bill) {
  var t = HtmlService.createTemplateFromFile('Invoice');
  t.b = bill;
  return t.evaluate().getContent();
}

// PDF wala Drive folder. Pehli baar khud banega aur uski ID Settings mein save hogi
function getInvoiceFolder(s) {
  if (s['PDF Folder ID']) {
    try { return DriveApp.getFolderById(s['PDF Folder ID']); } catch (e) { /* folder delete ho gaya, naya banao */ }
  }
  var folder = DriveApp.createFolder('Neeraj Jewellers Invoices');
  setSetting('PDF Folder ID', folder.getId());
  return folder;
}

// ---------- Purana bill dhoondhna ----------

function searchBill() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Bill Dhoondho', 'Invoice No. (jaise NJ-0001) ya customer ka naam likho:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var q = res.getResponseText().trim().toLowerCase();
  if (!q) return;

  var rows = SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET).getDataRange().getValues().slice(1);
  var found = rows.filter(function (r) {
    return String(r[1]).toLowerCase().indexOf(q) > -1 || String(r[2]).toLowerCase().indexOf(q) > -1;
  });
  if (!found.length) { ui.alert('Koi bill nahi mila: "' + q + '"'); return; }

  var html = '<style>body{font-family:Arial;font-size:13px}table{border-collapse:collapse;width:100%}' +
    'th{background:#5a0f1d;color:#f3dfa8;padding:6px;text-align:left}td{padding:6px;border-bottom:1px solid #eadcc0}' +
    'a{color:#5a0f1d;font-weight:bold}</style><p>' + found.length + ' bill mile:</p><table>' +
    '<tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Total ₹</th><th>GST</th><th>PDF</th></tr>';
  found.reverse().forEach(function (r) {
    var d = r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'dd-MM-yyyy') : r[0];
    html += '<tr><td>' + esc(d) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(inr(Number(r[4]))) +
      '</td><td>' + esc(r[5]) + '</td><td><a href="' + esc(r[6]) + '" target="_blank">Kholo</a></td></tr>';
  });
  ui.showModalDialog(HtmlService.createHtmlOutput(html + '</table>').setWidth(700).setHeight(450), 'Bill Dhoondho');
}

// HTML mein naam wagairah safe tareeke se dikhane ke liye
function esc(v) {
  return String(v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
