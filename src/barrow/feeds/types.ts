/** Connection settings contain references to credentials, never credential material. */
export type SftpConfig = {
 host: string
 port: number
 username: string
 secretId: string
 /** Owner-supplied OpenSSH SHA256 fingerprint of the server host public key. */
 hostKey: string
 importDirectory: string
 exportDirectory: string
 ackDirectory: string
}

export type SftpEntry = {
 name: string
 size: number
 /** Unix epoch milliseconds. */
 modifiedAt: number
 directory: boolean
}

export type SftpConnection = {
 list(path: string): Promise<SftpEntry[]>
 read(path: string, maxBytes?: number): Promise<Uint8Array>
 write(path: string, bytes: Uint8Array): Promise<void>
 rename(from: string, to: string): Promise<void>
 remove(path: string): Promise<void>
 close(): Promise<void>
}
