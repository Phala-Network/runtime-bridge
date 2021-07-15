export const getHeaderBlob: {
  (blockNumber: number): Promise<Buffer>
}
export const getBlockBlob: {
  (blockNumber: number, headerSynchedTo: number): Promise<Buffer>
}
