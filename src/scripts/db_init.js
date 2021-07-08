const main = () => {
  console.error('Please start IO service directly, db_init is no more needed.')
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.log(error)
  process.exit(255)
}
