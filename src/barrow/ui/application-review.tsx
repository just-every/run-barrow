import type { applicationReview } from '../application-followup'
import type { applicationStatusEmails } from '../application-mail'

type Review = Awaited<ReturnType<typeof applicationReview>>
type StatusEmail = Awaited<ReturnType<typeof applicationStatusEmails>>[number]

/** AUTO-001: how the application was routed, whether its review escalated, its prepared request and the status emails sent. */
export function ApplicationRouting({ review, statusEmails, open, onUseRequest }: { review: Review; statusEmails: StatusEmail[]; open: boolean; onUseRequest: (text: string) => void }) {
  return <div className="br-stack" role="group" aria-label="Routing and review deadline">
    <h3>Routing and review deadline</h3>
    {review ? <>
      <p>{review.ruleName ? `Routed by “${review.ruleName}”` : 'No rule matched; default route'}{review.territory ? ` to territory ${review.territory}` : ''} · reviewer {review.reviewer} · escalation person {review.escalationPerson} · {review.status === 'open' ? `review by ${review.deadline}` : `closed: ${review.resolution}`}</p>
      {review.escalatedSince && <p><strong>Escalated since {review.escalatedSince} to {review.escalationPerson}.</strong> It stays escalated until a decision or an explicit closure; sending a request does not end it.</p>}
      {review.preparedRequest && <div className="br-stack"><p>Prepared missing-information request (review before sending): “{review.preparedRequest}”</p>
        {open && <div className="br-actions"><button type="button" className="br-secondary" onClick={() => onUseRequest(review.preparedRequest!)}>Use the prepared request</button></div>}</div>}
    </> : <p>No review task recorded for this application.</p>}
    <p>Status emails to the applicant: {statusEmails.length ? statusEmails.map(mail => `${mail.at} · ${mail.state}: ${mail.status}`).join('; ') : 'none sent'}.</p>
  </div>
}
