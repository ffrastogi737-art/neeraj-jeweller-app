# नीरज ज्वैलर्स – Billing System Setup (bilkul free)

Ye system Google Sheets + Apps Script mein chalta hai. Koi paid tool ya server nahi lagta.
Aapko sirf 3 files copy-paste karni hain: `Code.gs`, `Form.html`, `Invoice.html`.

---

## Step 1: Nayi Google Sheet banao

1. Browser mein **sheets.new** kholo (Gmail wale account se login ho).
2. Upar sheet ka naam likho: **Neeraj Jewellers Billing**.

## Step 2: Script paste karo

1. Sheet mein upar menu: **Extensions → Apps Script**. Naya tab khulega.
2. Wahan `Code.gs` naam ki file pehle se hogi. Uska saara code hata do, aur is folder ki **Code.gs** ka poora code paste karo.
3. Left side **Files** ke paas **+** dabao → **HTML** → naam likho `Form` (sirf `Form`, `.html` apne aap lagega).
   Uska saara code hata ke **Form.html** ka code paste karo.
4. Phir se **+ → HTML** → naam `Invoice` → **Invoice.html** ka code paste karo.
5. Upar **💾 Save** (ya Ctrl+S) dabao.

> Naam bilkul yahi hone chahiye: `Form` aur `Invoice` (capital F aur I).

## Step 3: Permission do (sirf pehli baar)

1. Apps Script mein upar dropdown se function **setupSheets** chuno → **▶ Run** dabao.
   (`onOpen` mat chalana. Wo editor se chalane pe error deta hai, sheet khulne pe khud chalta hai.)
2. "Authorization required" aayega → **Review permissions** → apna Gmail account chuno.
3. "Google hasn't verified this app" aaye to ghabraao mat (ye aapki apni script hai):
   **Advanced → Go to (project naam) (unsafe) → Allow**.
4. Ye permissions maangega: Sheet padhna/likhna, Drive mein PDF save karna, popup dikhana. Sab **Allow** karo.

### ✅ Test 1
- Sheet wale tab pe jao aur page **refresh** karo (F5).
- Upar menu bar mein **💎 Neeraj Jewellers** dikhna chahiye (5-10 second lag sakte hain).
- Neeche do nayi tabs ban gayi hongi: **Settings** aur **Sales History**.
- **Settings** tab kholo: shop ka naam, address `11, Arijit Prasad Marg, Dehradun`, GST rate 3 dikhega.
  Phone aur GSTIN abhi khaali hain, baad mein yahin bhar dena.

## Step 4: Pehla bill banao

1. **💎 Neeraj Jewellers → 🧾 Naya Bill**.
2. Customer ka naam (zaroori), mobile (10 digit), address bharo.
3. Item: naam, type (Gold/Silver/Other), weight (gm), rate per gm, qty.
   Aur item ke liye **+ Item Jodo**, hatane ke liye **✕**.
4. GST chahiye to **☐ GST lagao** tick karo (rate 3% hai, badal bhi sakte ho).
5. **Bill Banao ✓** dabao. 5-15 second lagenge.

### ✅ Test 2 (form ka hisaab)
Ye daalo: weight `10`, rate `100`, qty `1`.
- Bina GST: Subtotal **1000.00**, Total **1000**
- GST tick karke: GST **30.00**, Total **1030**
Agar yahi dikhe to hisaab sahi hai.

### ✅ Test 3 (invoice + history)
- "✅ Bill ban gaya!" aur invoice number **NJ-0001** dikhega.
- **📄 PDF Kholo**: naye tab mein maroon-gold invoice khulega.
- **Sales History** tab mein ek nayi row: date, NJ-0001, naam, total, GST Haan/Nahi, PDF link.
- **Settings** mein `Next Invoice No` ab **2** ho gaya hoga.
- Google Drive (drive.google.com) mein **Neeraj Jewellers Invoices** folder ban gaya hoga, PDF usme hai.
- Ek bill GST ke saath aur ek bina GST banao: GST wale mein "TAX INVOICE", CGST/SGST aur GSTIN dikhega;
  bina GST wale mein sirf "INVOICE" aur koi GST line nahi.

### Print kaise karein
- **🖨️ Print** button: naye tab mein bill khulke print box aayega. Wahan **Paper size: A5** chuno,
  **Margins: None**, aur **Background graphics ✓** tick karo (warna maroon rang nahi chhapega).
- Popup block ho jaaye to: **📄 PDF Kholo** → upar printer icon.

## Step 5: Purana bill dhoondho

**💎 Neeraj Jewellers → 🔍 Bill Dhoondho** → invoice no. (`NJ-0001` ya sirf `0001`) ya customer ka naam
(adha naam bhi chalega, jaise `ramesh`) likho → OK.

### ✅ Test 4
- Pehle bill ka naam daalo: list mein wo bill aur **Kholo** link dikhega.
- Koi galat naam daalo: "Koi bill nahi mila" aana chahiye.

---

## Settings tab mein kya badal sakte ho

| Setting | Matlab |
|---|---|
| Shop Name (Hindi/English), Tagline, Address | Bill ke header mein chhapta hai |
| Phone | Bhar doge to address ke saath dikhega |
| GSTIN | Sirf GST wale bill pe dikhega |
| GST Rate (%) | Form mein default rate |
| Invoice Prefix | `NJ-` ki jagah kuch aur chahiye to |
| Next Invoice No | Agla bill kis number se bane. **Ise kam mat karna**, warna duplicate number banenge |
| PDF Folder ID | Apne aap bharta hai, chhedo mat |
| Terms | Terms & conditions. Har line ke beech `\|` lagao |

## Kuch dikkat aaye to

| Dikkat | Hal |
|---|---|
| Menu nahi dikh raha | Sheet refresh karo, 10 second ruko. Phir bhi nahi to Step 3 dobara |
| "Script function not found" | File ka naam `Form` / `Invoice` check karo, phir Save |
| Bill banane pe error | Popup mein laal message padho (jaise "Customer ka naam likho") |
| PDF mein font alag dikh raha | Google ka PDF converter kuch fonts nahi leta. Print button wala bill sabse sharp dikhega |

---

### Developer ke liye
`node google-sheets-billing/test.cjs` se hisaab (GST, round-off, amount in words) ke tests chalte hain.
