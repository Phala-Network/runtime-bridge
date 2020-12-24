const apply = program => {
  program
    .command('communicate')
    .alias('c')
    .description('start worker for communicating with TEE(pruntime).')
}

export default apply
