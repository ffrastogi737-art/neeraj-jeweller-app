// Developer self-check: Code.gs ka hisaab (calculation) Node mein test karo.
// Chalao: node google-sheets-billing/test.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);

const item = (weight, rate, qty) => ({ name: 'Ring', type: 'Gold', weight, rate, qty });

// Bina GST
let b = ctx.calculateBill({ items: [item('2.345', '6500', '1'), item(10, 85.5, 2)], gst: false });
assert.strictEqual(b.items[0].amount, 15242.5);
assert.strictEqual(b.subtotal, 16952.5);
assert.strictEqual(b.cgst + b.sgst, 0);
assert.strictEqual(b.total, 16953);
assert.strictEqual(b.roundOff, 0.5);

// GST 3% -> CGST 1.5 + SGST 1.5
b = ctx.calculateBill({ items: [item(5.111, 6543.21, 1)], gst: true, gstRate: 3 });
assert.strictEqual(b.subtotal, 33442.35);
assert.strictEqual(b.cgst, 501.64);
assert.strictEqual(b.sgst, 501.63);
assert.strictEqual(b.total, 34446);
assert.strictEqual(b.roundOff, 0.38);

// Number format + words
assert.strictEqual(ctx.inr(1234567.5), '12,34,567.50');
assert.strictEqual(ctx.inr(-0.4), '-0.40');
assert.strictEqual(ctx.inr(999), '999.00');
assert.strictEqual(ctx.amountInWords(12500), 'Rupees Twelve Thousand Five Hundred Only');
assert.strictEqual(ctx.amountInWords(34445), 'Rupees Thirty Four Thousand Four Hundred Forty Five Only');
assert.strictEqual(ctx.amountInWords(10234567), 'Rupees One Crore Two Lakh Thirty Four Thousand Five Hundred Sixty Seven Only');
assert.strictEqual(ctx.amountInWords(100), 'Rupees One Hundred Only');

// Galat form pe error
assert.throws(() => ctx.validateForm({ name: '', items: [item(1, 1, 1)] }), /naam/);
assert.throws(() => ctx.validateForm({ name: 'A', items: [item(0, 1, 1)] }), /weight/);
assert.throws(() => ctx.validateForm({ name: 'A', mobile: '123', items: [item(1, 1, 1)] }), /10 digit/);
assert.throws(() => ctx.validateForm({ name: 'A', items: [item(1, 1, 1.5)] }), /quantity/);
ctx.validateForm({ name: 'A', mobile: '9876543210', items: [item(1, 1, 1)] });

console.log('Sab tests pass ✅');
