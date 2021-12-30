import { getHeaderBlob } from '../data_provider/io/blob'

const main = async () => {
  const blob = await getHeaderBlob(parseInt(process.env.NUMBER))
  console.log(blob[0].toString('base64'))
  // console.log(JSON.stringify(blob.toString('base64')))
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}
