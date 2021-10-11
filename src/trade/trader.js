const start = async () => {
  process.send({ action: 'online' })
  process.exit()
}

export default start
