export function formatPackingSlipNumber(num, year) {
  return `PS-${year}-${String(num).padStart(4, '0')}`;
}

export function generatePackingSlipHTML(data) {
  const { packingSlipNumber, transferDate, printDate, companyName, fromAddress, toAddress, lines } = data;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const fmt = (n) => (n || 0).toFixed(2);

  const totalCases = lines.reduce((s, l) => s + Math.floor((l.quantity_bottles || 0) / 12), 0);
  const totalExtra = lines.reduce((s, l) => s + ((l.quantity_bottles || 0) % 12), 0);
  const totalBottles = lines.reduce((s, l) => s + (l.quantity_bottles || 0), 0);
  const totalLALs = lines.reduce((s, l) => s + (l.total_lals || 0), 0);

  const rows = lines.map(l => {
    const cases = Math.floor((l.quantity_bottles || 0) / 12);
    const extra = (l.quantity_bottles || 0) % 12;
    return `<tr>
      <td>${l.product_name || ''}</td>
      <td>${l.batch_number || ''}</td>
      <td>${l.bottle_size_ml || ''}ml</td>
      <td style="text-align:right">${cases}</td>
      <td style="text-align:right">${extra}</td>
      <td style="text-align:right">${l.quantity_bottles || 0}</td>
      <td style="text-align:right">${fmt(l.total_lals)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Packing Slip ${packingSlipNumber}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
  .company-name { font-size: 16pt; font-weight: bold; }
  .doc-title { font-size: 11pt; font-weight: bold; text-align: right; }
  .doc-number { font-size: 11pt; text-align: right; margin-top: 4px; }
  .addresses { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .address-block { width: 48%; }
  .address-label { font-weight: bold; font-size: 9pt; text-transform: uppercase; margin-bottom: 4px; }
  .address-text { font-size: 10pt; white-space: pre-line; }
  .dates { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt; }
  th, td { border: 1px solid #000; padding: 6px 8px; }
  th { background: #f0f0f0; font-weight: bold; text-align: left; font-size: 9pt; }
  .totals-row td { font-weight: bold; background: #f0f0f0; }
  .signatures { margin-top: 40px; display: flex; justify-content: space-between; font-size: 10pt; }
  .sig-block { width: 48%; }
  .sig-line { border-bottom: 1px solid #000; height: 28px; margin-bottom: 4px; }
  .sig-label { font-size: 9pt; color: #333; }
  .footer { margin-top: 24px; font-size: 9pt; color: #333; border-top: 1px solid #ccc; padding-top: 8px; }
  .slip-number-footer { text-align: right; margin-top: 16px; font-size: 9pt; color: #333; }
</style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyName || ''}</div>
    <div>
      <div class="doc-title">STOCK TRANSFER &mdash; PACKING SLIP</div>
      <div class="doc-number">Packing Slip No: ${packingSlipNumber}</div>
    </div>
  </div>
  <div class="addresses">
    <div class="address-block">
      <div class="address-label">FROM:</div>
      <div class="address-text">${fromAddress || ''}</div>
    </div>
    <div class="address-block">
      <div class="address-label">TO:</div>
      <div class="address-text">${toAddress || ''}</div>
    </div>
  </div>
  <div class="dates">
    <div>Transfer Date: ${formatDate(transferDate)}</div>
    <div>Print Date: ${formatDate(printDate)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Batch No</th>
        <th>Size</th>
        <th style="text-align:right">Cases</th>
        <th style="text-align:right">Extra</th>
        <th style="text-align:right">Bottles</th>
        <th style="text-align:right">LALs</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals-row">
        <td>TOTALS</td>
        <td></td>
        <td></td>
        <td style="text-align:right">${totalCases}</td>
        <td style="text-align:right">${totalExtra}</td>
        <td style="text-align:right">${totalBottles}</td>
        <td style="text-align:right">${fmt(totalLALs)}</td>
      </tr>
    </tbody>
  </table>
  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Dispatched by</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Received by</div>
    </div>
  </div>
  <div class="footer">
    <p>This document must accompany the goods.</p>
    <p>Please sign and return a copy to the distillery.</p>
  </div>
  <div class="slip-number-footer">${packingSlipNumber}</div>
</body>
</html>`;
}

export function printPackingSlip(data) {
  const html = generatePackingSlipHTML(data);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print the packing slip.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}