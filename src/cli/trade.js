const apply = program => {
  program
    .command('trade')
    .alias('t')
    .description('start worker for signing and sending transactions.')
}

export default apply
