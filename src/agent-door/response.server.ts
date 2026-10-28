import { fontDocumentResponse } from '../base/font-response'

/** Add Barrow's native font delivery and touch targets without adapting Base bytes. */
export async function agentDoorResponse(response: Response): Promise<Response> {
 if (!response.headers.get('content-type')?.startsWith('text/html')) return response
 const document = (await fontDocumentResponse(response))!
 const html = (await document.text()).replace('</head>', '<link rel="stylesheet" href="/agent-door.css"></head>')
 return new Response(html, { status: document.status, statusText: document.statusText, headers: document.headers })
}
