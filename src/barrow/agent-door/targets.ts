import type { ToolDefinition } from '../../modules/agent-door/types.ts'

/** Resolve identity only after the native reader has admitted this principal. */
export function recordTarget(kind:string,read:(args:Record<string,unknown>,ctx:Parameters<ToolDefinition['run']>[1])=>Promise<{id:string}>):NonNullable<ToolDefinition['target']> {
 return async(args,ctx)=>({kind,id:(await read(args,ctx)).id})
}
