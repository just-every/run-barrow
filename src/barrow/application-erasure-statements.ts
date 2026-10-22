export const applicationAccountErasure=(accountId:string)=>[
 {sql:'DELETE FROM bw_application_documents WHERE application_id IN (SELECT id FROM bw_applications WHERE account_id=?)',params:[accountId]},
 {sql:'DELETE FROM bw_application_history WHERE application_id IN (SELECT id FROM bw_applications WHERE account_id=?)',params:[accountId]},
 {sql:'DELETE FROM bw_application_sessions WHERE application_id IN (SELECT id FROM bw_applications WHERE account_id=?)',params:[accountId]},
 {sql:'DELETE FROM bw_application_codes WHERE application_id IN (SELECT id FROM bw_applications WHERE account_id=?)',params:[accountId]},
 {sql:'DELETE FROM bw_applications WHERE account_id=?',params:[accountId]},
]
