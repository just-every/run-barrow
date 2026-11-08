import { readFile } from 'node:fs/promises';
import { readPdf, invoiceStreamBoundaries } from '/workspace/run-barrow/tests/api/invoice-documents.mjs';
const bytes=await readFile(process.argv[2]);
const pdf=await readPdf(bytes);
await invoiceStreamBoundaries({...pdf,bytes});
console.log('Deterministic CR-tail stream regression passed; all retained PDF text and pages preserved.');
