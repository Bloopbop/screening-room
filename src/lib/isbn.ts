/** An ISBN-13 from a scanned EAN-13 or typed ISBN-10/13 (hyphens and spaces allowed); null if it isn't one. */
export function toIsbn13(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(code)) return eanValid(code) ? code : null;
  if (/^\d{9}[\dX]$/.test(code) && isbn10Valid(code)) {
    const body = `978${code.slice(0, 9)}`;
    return body + eanCheckDigit(body);
  }
  return null;
}

function eanCheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

function eanValid(code: string): boolean {
  return eanCheckDigit(code.slice(0, 12)) === code[12];
}

function isbn10Valid(code: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i);
  return sum % 11 === 0;
}
