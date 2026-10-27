let instant:string|undefined
export function setTestClock(value?:string){instant=value}
export const now=()=>instant?new Date(instant):new Date()
