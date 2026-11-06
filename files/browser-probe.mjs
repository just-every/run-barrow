import test from 'node:test';
const {xeroBrowser}=await import('/workspace/run-barrow/tests/journeys/xero-accounting.mjs');
test('Xero current public browser accounting journey',xeroBrowser);
