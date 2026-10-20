// DATA-001: the commercial records this person may see, as open JSON or one CSV per kind.
export function ExportLinks({ supplier }: { supplier: boolean }) {
  const kinds = ['accounts', 'prices', 'orders', 'lines', 'invoices', 'documents', 'quotes', 'quotelines', 'quotemessages', 'locations', ...(supplier ? ['audit'] : [])]
  return <div className="br-card br-stack"><h2>Download your commercial records</h2>
    <p>{supplier ? 'Every trade account, price, order, line, invoice and PO document reference, with audit references.' : 'Your trade account, prices, orders, lines, invoices and PO document references.'} IDs, currency and revisions are kept so the records can be reconciled anywhere.</p>
    <div className="br-actions"><a className="br-secondary" href="/api/barrow/export.json" download>All records (JSON)</a>{kinds.map(kind => <a key={kind} className="br-secondary" href={`/api/barrow/export/${kind}.csv`} download>{kind[0].toUpperCase() + kind.slice(1)} (CSV)</a>)}</div>
  </div>
}
